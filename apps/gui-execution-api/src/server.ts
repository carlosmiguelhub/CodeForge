import { setTimeout as delay } from "node:timers/promises";

import type { ExecutionGrantSigner } from "@sqweb/execution";
import type { GuiContainerAllocation } from "@sqweb/gui-session";
import websocketPlugin from "@fastify/websocket";
import Fastify from "fastify";
import WebSocket from "ws";
import { z } from "zod";

import type { GuiSessionLogReader } from "./docker-log-reader";

export interface GuiSessionAccessReader {
  findAllocation(sessionId: string): Promise<GuiContainerAllocation | null>;
  markStopped(sessionId: string): Promise<void>;
}

const paramsSchema = z.object({ sessionId: z.string().uuid() });
const querySchema = z.object({ token: z.string().min(1) });

// Native browser WebSocket can't set a header, so the grant travels as a
// query parameter — this is the sole credential on both routes below (see
// GuiSessionGrantPayload's doc comment in @sqweb/execution).
function verifyGrant(
  grantSigner: ExecutionGrantSigner,
  request: { params: unknown; query: unknown },
) {
  const params = paramsSchema.parse(request.params);
  const query = querySchema.parse(request.query);
  const payload = grantSigner.verifyGuiSession(query.token);
  if (payload.sessionId !== params.sessionId)
    throw new Error("GRANT_SESSION_MISMATCH");
  return params.sessionId;
}

// The allocation row doesn't exist until the provisioning worker finishes
// its (usually sub-second, poll-interval-bound) claim — retry briefly
// rather than failing a connection opened the instant the create-session
// response comes back.
async function resolveAllocation(
  accessReader: GuiSessionAccessReader,
  sessionId: string,
  timeoutMs = 8000,
): Promise<GuiContainerAllocation | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const allocation = await accessReader.findAllocation(sessionId);
    if (allocation) return allocation;
    await delay(300);
  }
  return null;
}

export async function buildGuiExecutionServer(dependencies: {
  grantSigner: ExecutionGrantSigner;
  accessReader: GuiSessionAccessReader;
  logs: GuiSessionLogReader;
  logger?: boolean;
}) {
  const server = Fastify({
    logger: dependencies.logger === false ? false : true,
  });
  await server.register(websocketPlugin);

  server.get("/health", async () => ({ status: "ok" }));

  server.get(
    "/v1/gui-sessions/:sessionId/console",
    { websocket: true },
    (socket, request) => {
      void handleConsole(socket, request);
    },
  );

  server.get(
    "/v1/gui-sessions/:sessionId/vnc",
    { websocket: true },
    (socket, request) => {
      void handleVnc(socket, request);
    },
  );

  async function handleConsole(
    socket: WebSocket,
    request: { params: unknown; query: unknown },
  ) {
    let sessionId: string;
    try {
      sessionId = verifyGrant(dependencies.grantSigner, request);
    } catch {
      socket.close(4401, "unauthorized");
      return;
    }
    const allocation = await resolveAllocation(
      dependencies.accessReader,
      sessionId,
    );
    if (!allocation) {
      socket.close(4404, "not_found");
      return;
    }
    let stream: NodeJS.ReadableStream;
    try {
      stream = await dependencies.logs.streamLogs(allocation.containerRef);
    } catch {
      socket.close(4500, "log_stream_unavailable");
      return;
    }
    stream.on("data", (chunk: Buffer) => {
      if (socket.readyState === WebSocket.OPEN)
        socket.send(chunk.toString("utf8"));
    });
    stream.on("end", () => socket.close());
    socket.on("close", () => {
      if ("destroy" in stream && typeof stream.destroy === "function")
        stream.destroy();
    });
  }

  async function handleVnc(
    socket: WebSocket,
    request: { params: unknown; query: unknown },
  ) {
    let sessionId: string;
    try {
      sessionId = verifyGrant(dependencies.grantSigner, request);
    } catch {
      socket.close(4401, "unauthorized");
      return;
    }
    const allocation = await resolveAllocation(
      dependencies.accessReader,
      sessionId,
    );
    if (!allocation) {
      socket.close(4404, "not_found");
      return;
    }

    // A dumb byte pump between the browser's socket and the container's
    // internal websockify port — this process never speaks VNC itself.
    const upstream = new WebSocket(
      `ws://${allocation.internalHost}:${allocation.websockifyPort}/websockify`,
    );

    const closeBoth = () => {
      if (
        socket.readyState === WebSocket.OPEN ||
        socket.readyState === WebSocket.CONNECTING
      )
        socket.close();
      if (
        upstream.readyState === WebSocket.OPEN ||
        upstream.readyState === WebSocket.CONNECTING
      )
        upstream.close();
    };

    // The browser can send its first bytes the instant this WS accepts —
    // before the outbound connection to `upstream` has actually opened.
    // Attaching the forward-listener only inside upstream's "open" handler
    // (as an earlier version of this did) drops that first message
    // silently, since EventEmitter never buffers events for listeners
    // added after they fire. Buffer here instead, and flush once open.
    const pendingToUpstream: (string | Buffer)[] = [];
    let upstreamOpen = false;
    socket.on("message", (data) => {
      const payload = data as Buffer;
      if (upstreamOpen && upstream.readyState === WebSocket.OPEN) {
        upstream.send(payload);
      } else {
        pendingToUpstream.push(payload);
      }
    });

    upstream.once("open", () => {
      upstreamOpen = true;
      for (const payload of pendingToUpstream.splice(0)) upstream.send(payload);
      upstream.on("message", (data) => {
        if (socket.readyState === WebSocket.OPEN) socket.send(data as Buffer);
      });
    });
    upstream.once("error", closeBoth);
    socket.once("error", closeBoth);
    upstream.once("close", closeBoth);
    // The fast-path cleanup trigger: as soon as the *browser* disconnects
    // from the live session, mark it for teardown immediately instead of
    // waiting for the provisioning worker's safety-net poll tick.
    socket.once("close", () => {
      closeBoth();
      void dependencies.accessReader.markStopped(sessionId);
    });
  }

  return server;
}
