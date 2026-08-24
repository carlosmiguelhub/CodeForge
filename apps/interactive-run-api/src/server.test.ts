import { once } from "node:events";

import { ExecutionGrantSigner } from "@sqweb/execution";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";

import type {
  InteractiveRunManager,
  InteractiveRunSession,
  InteractiveRunSpec,
} from "./interactive-runner";
import { buildInteractiveRunServer } from "./server";

const account = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "student-uid",
  email: "student@example.edu",
  displayName: "Student",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active" as const,
  roles: ["student" as const],
  sectionId: null,
  authorizationVersion: 1,
};

class FakeRunManager implements InteractiveRunManager {
  readonly started = vi.fn();
  readonly writes: string[] = [];
  stopped = false;
  spec: InteractiveRunSpec | undefined;
  private resolveExit!: (code: number) => void;
  private readonly exit = new Promise<number>((resolve) => {
    this.resolveExit = resolve;
  });

  async start(spec: InteractiveRunSpec): Promise<InteractiveRunSession> {
    this.spec = spec;
    this.started(spec.language, spec.sourceCode);
    return {
      writeStdin: (data) => this.writes.push(data),
      wait: () => this.exit,
      stop: async () => {
        this.stopped = true;
      },
    };
  }

  async sweepOrphans(): Promise<number> {
    return 0;
  }

  finish(code: number) {
    this.resolveExit(code);
  }
}

const signer = new ExecutionGrantSigner(
  "test-execution-secret-that-is-at-least-32-chars",
);
const servers: Array<Awaited<ReturnType<typeof buildInteractiveRunServer>>> =
  [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function setup(runs = new FakeRunManager()) {
  const server = await buildInteractiveRunServer({
    grantSigner: signer,
    runs,
    maxRuntimeSeconds: 60,
    startTimeoutMs: 1_000,
    logger: false,
  });
  servers.push(server);
  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address();
  if (!address || typeof address === "string") throw new Error("NO_TEST_PORT");
  const token = signer.issueInteractiveRun(account, 60).token;
  return {
    runs,
    token,
    url: `ws://127.0.0.1:${address.port}/v1/interactive-runs`,
  };
}

async function connect(url: string, token: string) {
  const socket = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
  await once(socket, "open");
  return socket;
}

async function nextJson(socket: WebSocket) {
  const [data] = (await once(socket, "message")) as [WebSocket.RawData];
  return JSON.parse(data.toString()) as unknown;
}

describe("interactive run websocket", () => {
  it("streams prompts, forwards stdin, and reports the exit code", async () => {
    const { runs, token, url } = await setup();
    const socket = await connect(url, token);
    socket.send(
      JSON.stringify({
        type: "start",
        language: "python",
        sourceCode: "print(input('Name: '))",
      }),
    );
    await vi.waitFor(() => expect(runs.started).toHaveBeenCalledOnce());

    const prompt = nextJson(socket);
    runs.spec!.onStdout("Name: ");
    await expect(prompt).resolves.toEqual({ type: "stdout", data: "Name: " });

    socket.send(JSON.stringify({ type: "stdin", data: "Ada\n" }));
    await vi.waitFor(() => expect(runs.writes).toEqual(["Ada\n"]));

    const exit = nextJson(socket);
    runs.finish(0);
    await expect(exit).resolves.toEqual({ type: "exit", exitCode: 0 });
    await once(socket, "close");
  });

  it("rejects malformed first messages before provisioning", async () => {
    const { runs, token, url } = await setup();
    const socket = await connect(url, token);
    const error = nextJson(socket);
    socket.send(JSON.stringify({ type: "stdin", data: "too early\n" }));
    await expect(error).resolves.toEqual({
      type: "error",
      message: "The first message must start the run",
    });
    await once(socket, "close");
    expect(runs.started).not.toHaveBeenCalled();
  });

  it("consumes each grant nonce only once", async () => {
    const { token, url } = await setup();
    const first = await connect(url, token);
    first.close();
    await once(first, "close");

    const replay = new WebSocket(`${url}?token=${encodeURIComponent(token)}`);
    const [code] = (await once(replay, "close")) as [number];
    expect(code).toBe(4401);
  });

  it("rejects an invalid grant", async () => {
    const { url } = await setup();
    const socket = new WebSocket(`${url}?token=invalid`);
    const [code] = (await once(socket, "close")) as [number];
    expect(code).toBe(4401);
  });
});
