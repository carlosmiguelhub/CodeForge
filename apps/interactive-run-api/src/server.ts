import type { ExecutionGrantSigner } from "@sqweb/execution";
import {
  interactiveRunClientMessageSchema,
  type InteractiveRunServerMessage,
} from "@sqweb/contracts";
import websocketPlugin from "@fastify/websocket";
import Fastify from "fastify";
import WebSocket, { type RawData } from "ws";
import { z } from "zod";

import type {
  InteractiveRunManager,
  InteractiveRunSession,
} from "./interactive-runner";

const querySchema = z.object({ token: z.string().min(1) });

export interface InteractiveRunServerDependencies {
  readonly grantSigner: ExecutionGrantSigner;
  readonly runs: InteractiveRunManager;
  readonly maxRuntimeSeconds: number;
  readonly startTimeoutMs?: number;
  readonly maxOutputBytes?: number;
  readonly logger?: boolean;
}

export async function buildInteractiveRunServer(
  dependencies: InteractiveRunServerDependencies,
) {
  const server = Fastify({
    logger:
      dependencies.logger === false
        ? false
        : {
            // The WebSocket grant is the sole credential and lives in the
            // query string. Never put request URLs containing it in logs.
            redact: { paths: ["req.url"], censor: "[REDACTED]" },
          },
  });
  await server.register(websocketPlugin);

  const consumedNonces = new Map<string, number>();
  const startTimeoutMs = dependencies.startTimeoutMs ?? 10_000;
  const maxOutputBytes = dependencies.maxOutputBytes ?? 1024 * 1024;

  server.get("/health", async () => ({ status: "ok" }));
  server.get("/v1/interactive-runs", { websocket: true }, (socket, request) => {
    let grant: ReturnType<ExecutionGrantSigner["verifyInteractiveRun"]>;
    try {
      const query = querySchema.parse(request.query);
      grant = dependencies.grantSigner.verifyInteractiveRun(query.token);
      const now = Math.floor(Date.now() / 1000);
      for (const [nonce, expiresAt] of consumedNonces) {
        if (expiresAt < now) consumedNonces.delete(nonce);
      }
      if (consumedNonces.has(grant.nonce)) throw new Error("GRANT_REPLAYED");
      consumedNonces.set(grant.nonce, grant.expiresAt);
    } catch {
      socket.close(4401, "unauthorized");
      return;
    }
    void handleSocket(socket);
  });

  async function handleSocket(socket: WebSocket) {
    let phase: "waiting" | "starting" | "running" | "finished" = "waiting";
    let session: InteractiveRunSession | undefined;
    let closed = false;
    let stopRequested = false;
    let totalOutputBytes = 0;
    let pendingStdinBytes = 0;
    const pendingStdin: string[] = [];
    let runtimeTimer: ReturnType<typeof setTimeout> | undefined;

    const send = (message: InteractiveRunServerMessage) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(JSON.stringify(message));
    };
    const stopSession = async () => {
      stopRequested = true;
      if (session) await session.stop().catch(() => undefined);
    };
    const fail = (message: string, closeCode = 4400) => {
      if (phase === "finished") return;
      phase = "finished";
      send({ type: "error", message });
      void stopSession().finally(() => {
        if (socket.readyState === WebSocket.OPEN)
          socket.close(closeCode, "interactive_run_failed");
      });
    };
    const forwardOutput = (type: "stdout" | "stderr", data: string) => {
      if (phase === "finished" || closed) return;
      totalOutputBytes += Buffer.byteLength(data, "utf8");
      if (totalOutputBytes > maxOutputBytes) {
        fail("Output limit exceeded", 4409);
        return;
      }
      send({ type, data });
    };

    const startTimer = setTimeout(
      () => fail("Start message timed out", 4408),
      startTimeoutMs,
    );

    const startRun = async (message: {
      language: "python" | "java" | "cpp" | "javascript" | "c";
      sourceCode: string;
    }) => {
      phase = "starting";
      clearTimeout(startTimer);
      try {
        const started = await dependencies.runs.start({
          language: message.language,
          sourceCode: message.sourceCode,
          onStdout: (data) => forwardOutput("stdout", data),
          onStderr: (data) => forwardOutput("stderr", data),
        });
        session = started;
        if (closed || stopRequested) {
          await started.stop().catch(() => undefined);
          return;
        }
        phase = "running";
        for (const data of pendingStdin.splice(0)) started.writeStdin(data);
        runtimeTimer = setTimeout(() => {
          fail("Time limit exceeded", 4408);
        }, dependencies.maxRuntimeSeconds * 1000);

        void started
          .wait()
          .then((exitCode) => {
            if (phase === "finished" || closed || stopRequested) return;
            phase = "finished";
            if (runtimeTimer) clearTimeout(runtimeTimer);
            send({ type: "exit", exitCode });
            if (socket.readyState === WebSocket.OPEN)
              socket.close(1000, "complete");
          })
          .catch(() => fail("Interactive run failed", 4500));
      } catch {
        fail("Interactive run could not be started", 4500);
      }
    };

    const handleMessage = (data: RawData) => {
      let decoded: unknown;
      try {
        decoded = JSON.parse(data.toString());
      } catch {
        fail("Invalid message", 4400);
        return;
      }
      const parsed = interactiveRunClientMessageSchema.safeParse(decoded);
      if (!parsed.success) {
        fail("Invalid message", 4400);
        return;
      }
      const message = parsed.data;
      if (phase === "waiting") {
        if (message.type !== "start") {
          fail("The first message must start the run", 4400);
          return;
        }
        void startRun(message);
        return;
      }
      if (message.type !== "stdin" || phase === "finished") {
        fail("Only stdin messages are accepted after start", 4400);
        return;
      }
      if (phase === "starting") {
        pendingStdinBytes += Buffer.byteLength(message.data, "utf8");
        if (pendingStdinBytes > 50_000) {
          fail("Pending input limit exceeded", 4409);
          return;
        }
        pendingStdin.push(message.data);
        return;
      }
      try {
        session?.writeStdin(message.data);
      } catch {
        fail("Program input is closed", 4400);
      }
    };

    socket.on("message", handleMessage);
    socket.once("close", () => {
      closed = true;
      clearTimeout(startTimer);
      if (runtimeTimer) clearTimeout(runtimeTimer);
      void stopSession();
    });
    socket.once("error", () => {
      closed = true;
      void stopSession();
    });
  }

  return server;
}
