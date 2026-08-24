import type { AddressInfo } from "node:net";
import { Readable } from "node:stream";

import { ExecutionGrantSigner } from "@sqweb/execution";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket, { WebSocketServer } from "ws";

import type { GuiSessionAccessReader } from "./server";
import { buildGuiExecutionServer } from "./server";

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
const sessionId = "00000000-0000-4000-8000-000000000050";
const allocation = {
  id: "00000000-0000-4000-8000-000000000051",
  containerRef: "container-abc",
  internalHost: "127.0.0.1",
  websockifyPort: 0, // filled in per-test once a fake upstream is listening
};

const signer = new ExecutionGrantSigner(
  "test-execution-secret-that-is-at-least-32-chars",
);

const servers: WebSocketServer[] = [];
afterEach(() => {
  for (const server of servers.splice(0)) server.close();
});

async function startFakeWebsockify(): Promise<{
  port: number;
  received: Buffer[];
  wss: WebSocketServer;
}> {
  const wss = new WebSocketServer({ port: 0 });
  servers.push(wss);
  await new Promise<void>((resolve) => wss.once("listening", resolve));
  const received: Buffer[] = [];
  wss.on("connection", (socket) => {
    socket.on("message", (data) => {
      received.push(Buffer.from(data as Buffer));
      socket.send(data); // echo, so the test can also assert the relay-back direction
    });
  });
  return { port: (wss.address() as AddressInfo).port, received, wss };
}

function accessReader(
  overrides: Partial<GuiSessionAccessReader> = {},
): GuiSessionAccessReader {
  return {
    findAllocation: vi.fn().mockResolvedValue(allocation),
    markStopped: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function startServer(dependencies: {
  accessReader: GuiSessionAccessReader;
  logs?: {
    streamLogs: (containerRef: string) => Promise<NodeJS.ReadableStream>;
  };
}) {
  const server = await buildGuiExecutionServer({
    grantSigner: signer,
    accessReader: dependencies.accessReader,
    logs: dependencies.logs ?? {
      streamLogs: vi.fn().mockResolvedValue(Readable.from([])),
    },
    logger: false,
  });
  const address = await server.listen({ host: "127.0.0.1", port: 0 });
  return { server, address };
}

describe("gui-execution-api WebSocket routes", () => {
  it("rejects a connection with no grant", async () => {
    const { server, address } = await startServer({
      accessReader: accessReader(),
    });
    try {
      const socket = new WebSocket(
        `${address.replace("http", "ws")}/v1/gui-sessions/${sessionId}/vnc`,
      );
      const code = await new Promise<number>((resolve) => {
        socket.once("close", (closeCode) => resolve(closeCode));
      });
      expect(code).toBe(4401);
    } finally {
      await server.close();
    }
  });

  it("rejects a grant minted for a different session", async () => {
    const { server, address } = await startServer({
      accessReader: accessReader(),
    });
    try {
      const { token } = signer.issueGuiSession(
        account,
        "00000000-0000-4000-8000-000000000099",
        60,
      );
      const socket = new WebSocket(
        `${address.replace("http", "ws")}/v1/gui-sessions/${sessionId}/vnc?token=${token}`,
      );
      const code = await new Promise<number>((resolve) => {
        socket.once("close", (closeCode) => resolve(closeCode));
      });
      expect(code).toBe(4401);
    } finally {
      await server.close();
    }
  });

  it("relays bytes both ways between the browser and the container's websockify port", async () => {
    const upstream = await startFakeWebsockify();
    const reader = accessReader({
      findAllocation: vi
        .fn()
        .mockResolvedValue({ ...allocation, websockifyPort: upstream.port }),
    });
    const { server, address } = await startServer({ accessReader: reader });
    try {
      const { token } = signer.issueGuiSession(account, sessionId, 60);
      const socket = new WebSocket(
        `${address.replace("http", "ws")}/v1/gui-sessions/${sessionId}/vnc?token=${token}`,
      );
      await new Promise<void>((resolve) => socket.once("open", resolve));

      const echoed = new Promise<Buffer>((resolve) => {
        socket.once("message", (data) => resolve(Buffer.from(data as Buffer)));
      });
      socket.send(Buffer.from("hello vnc"));
      expect((await echoed).toString("utf8")).toBe("hello vnc");
      expect(upstream.received[0]?.toString("utf8")).toBe("hello vnc");

      socket.close();
      await vi.waitFor(() =>
        expect(reader.markStopped).toHaveBeenCalledWith(sessionId),
      );
    } finally {
      await server.close();
    }
  });

  it("streams container logs as text frames on the console route", async () => {
    const stream = Readable.from(["compiling...\n", "hello from stdout\n"]);
    const logs = { streamLogs: vi.fn().mockResolvedValue(stream) };
    const { server, address } = await startServer({
      accessReader: accessReader(),
      logs,
    });
    try {
      const { token } = signer.issueGuiSession(account, sessionId, 60);
      const socket = new WebSocket(
        `${address.replace("http", "ws")}/v1/gui-sessions/${sessionId}/console?token=${token}`,
      );
      const chunks: string[] = [];
      await new Promise<void>((resolve) => {
        socket.on("message", (data) =>
          chunks.push(Buffer.from(data as Buffer).toString("utf8")),
        );
        socket.on("close", resolve);
      });
      expect(chunks.join("")).toContain("hello from stdout");
      expect(logs.streamLogs).toHaveBeenCalledWith(allocation.containerRef);
    } finally {
      await server.close();
    }
  });

  it("closes with 404 when the allocation never shows up", async () => {
    const reader = accessReader({
      findAllocation: vi.fn().mockResolvedValue(null),
    });
    const { server, address } = await startServer({ accessReader: reader });
    try {
      const { token } = signer.issueGuiSession(account, sessionId, 60);
      const socket = new WebSocket(
        `${address.replace("http", "ws")}/v1/gui-sessions/${sessionId}/vnc?token=${token}`,
      );
      const code = await new Promise<number>((resolve) => {
        socket.once("close", (closeCode) => resolve(closeCode));
      });
      expect(code).toBe(4404);
    } finally {
      await server.close();
    }
  }, 15_000);
});
