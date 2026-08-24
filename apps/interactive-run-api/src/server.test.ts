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

interface FakeSession {
  readonly spec: InteractiveRunSpec;
  readonly writes: string[];
  stopped: boolean;
  finish(code: number): void;
}

class FakeRunManager implements InteractiveRunManager {
  readonly started = vi.fn();
  readonly sessions: FakeSession[] = [];

  async start(spec: InteractiveRunSpec): Promise<InteractiveRunSession> {
    this.started(spec.language, spec.sourceCode);
    const writes: string[] = [];
    let resolveExit!: (code: number) => void;
    const exit = new Promise<number>((resolve) => {
      resolveExit = resolve;
    });
    const fakeSession: FakeSession = {
      spec,
      writes,
      stopped: false,
      finish: (code) => resolveExit(code),
    };
    this.sessions.push(fakeSession);
    return {
      writeStdin: (data) => writes.push(data),
      wait: () => exit,
      stop: async () => {
        fakeSession.stopped = true;
      },
    };
  }

  async sweepOrphans(): Promise<number> {
    return 0;
  }

  // Convenience accessors for the common single-run tests below — the
  // multi-run concurrency-cap tests index into `sessions` directly.
  get spec(): InteractiveRunSpec | undefined {
    return this.sessions.at(-1)?.spec;
  }
  get writes(): string[] {
    return this.sessions.at(-1)?.writes ?? [];
  }
  finish(code: number) {
    this.sessions.at(-1)!.finish(code);
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

async function setup(
  options: {
    runs?: FakeRunManager;
    maxConcurrentRuns?: number;
  } = {},
) {
  const runs = options.runs ?? new FakeRunManager();
  const server = await buildInteractiveRunServer({
    grantSigner: signer,
    runs,
    maxRuntimeSeconds: 60,
    startTimeoutMs: 1_000,
    logger: false,
    ...(options.maxConcurrentRuns !== undefined
      ? { maxConcurrentRuns: options.maxConcurrentRuns }
      : {}),
  });
  servers.push(server);
  await server.listen({ host: "127.0.0.1", port: 0 });
  const address = server.server.address();
  if (!address || typeof address === "string") throw new Error("NO_TEST_PORT");
  const issueToken = () => signer.issueInteractiveRun(account, 60).token;
  return {
    runs,
    token: issueToken(),
    issueToken,
    url: `ws://127.0.0.1:${address.port}/v1/interactive-runs`,
  };
}

async function startRun(
  url: string,
  token: string,
  sourceCode = "print('hi')",
) {
  const socket = await connect(url, token);
  socket.send(
    JSON.stringify({ type: "start", language: "python", sourceCode }),
  );
  return socket;
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

describe("interactive run concurrency cap", () => {
  it("rejects a new run once the limit is reached, then accepts one again once a slot frees up", async () => {
    const { runs, url, issueToken } = await setup({ maxConcurrentRuns: 2 });

    const first = await startRun(url, issueToken());
    const second = await startRun(url, issueToken());
    await vi.waitFor(() => expect(runs.started).toHaveBeenCalledTimes(2));

    const third = new WebSocket(
      `${url}?token=${encodeURIComponent(issueToken())}`,
    );
    await once(third, "open");
    const rejection = nextJson(third);
    third.send(
      JSON.stringify({
        type: "start",
        language: "python",
        sourceCode: "print('over capacity')",
      }),
    );
    await expect(rejection).resolves.toEqual({
      type: "error",
      message: "Server is at capacity, try again shortly",
    });
    const [thirdCloseCode] = (await once(third, "close")) as [number];
    expect(thirdCloseCode).toBe(4429);
    // The rejected attempt never reaches the run manager at all.
    expect(runs.started).toHaveBeenCalledTimes(2);

    // Finishing the first run frees its slot.
    const firstExit = nextJson(first);
    runs.sessions[0]!.finish(0);
    await expect(firstExit).resolves.toEqual({ type: "exit", exitCode: 0 });
    await once(first, "close");

    const fourth = await startRun(url, issueToken());
    await vi.waitFor(() => expect(runs.started).toHaveBeenCalledTimes(3));

    second.close();
    fourth.close();
  });

  it("frees a slot when a run is stopped by the client closing the socket", async () => {
    const { runs, url, issueToken } = await setup({ maxConcurrentRuns: 1 });

    const first = await startRun(url, issueToken());
    await vi.waitFor(() => expect(runs.started).toHaveBeenCalledTimes(1));

    first.close();
    await once(first, "close");
    // stop() resolving is what the server waits on before releasing the
    // slot — the fake's stop() settles synchronously, so this should be
    // immediate, but give the close handler's async stopSession() a tick.
    await vi.waitFor(() => expect(runs.sessions[0]!.stopped).toBe(true));

    const second = await startRun(url, issueToken());
    await vi.waitFor(() => expect(runs.started).toHaveBeenCalledTimes(2));
    second.close();
  });
});
