"use client";

import {
  apiErrorSchema,
  codeLanguageMeta,
  interactiveRunGrantResponseSchema,
  interactiveRunServerMessageSchema,
  type CodeLanguage,
} from "@sqweb/contracts";
import { useCallback, useEffect, useRef, useState } from "react";

import type { InteractiveConsoleEntry } from "@/components/code-workbench/interactive-console";
import { useAuth } from "@/components/auth/auth-provider";
import { interactiveRunSocketUrl } from "@/lib/interactive-run-url";
import { randomId } from "@/lib/random-id";

// Same WebSocket lifecycle Code Workspace's "Run Interactively" button uses
// (apps/interactive-run-api) — kept as its own hook rather than folded into
// code-workbench.tsx so a second surface (the Activity workspace) can reuse
// it without touching that already-shipped component.
export function useInteractiveRun() {
  const { authorizedFetch, executionFetch } = useAuth();
  const [state, setState] = useState<
    "idle" | "connecting" | "running" | "finished"
  >("idle");
  const [entries, setEntries] = useState<readonly InteractiveConsoleEntry[]>(
    [],
  );
  const socketRef = useRef<WebSocket | null>(null);
  const stopRequestedRef = useRef(false);

  const append = useCallback(
    (kind: InteractiveConsoleEntry["kind"], data: string) => {
      setEntries((current) => [...current, { id: randomId(), kind, data }]);
    },
    [],
  );

  useEffect(() => () => socketRef.current?.close(), []);

  const run = useCallback(
    async (language: CodeLanguage, sourceCode: string) => {
      if (state === "connecting" || state === "running" || !sourceCode.trim())
        return;
      stopRequestedRef.current = false;
      setState("connecting");
      setEntries([
        {
          id: randomId(),
          kind: "status",
          data: `Starting ${codeLanguageMeta[language].label} run…\n`,
        },
      ]);
      try {
        const response = await authorizedFetch("/v1/interactive-run-grants", {
          method: "POST",
        });
        if (!response.ok) {
          const parsedError = apiErrorSchema.safeParse(
            await response.json().catch(() => null),
          );
          throw new Error(
            parsedError.success
              ? parsedError.data.error.message
              : "Interactive execution could not be authorized.",
          );
        }
        const grant = interactiveRunGrantResponseSchema.parse(
          await response.json(),
        );
        const socket = new WebSocket(interactiveRunSocketUrl(grant.token));
        socketRef.current = socket;
        let terminalMessageReceived = false;
        let startedAtMs: number | null = null;

        socket.addEventListener("open", () => {
          if (stopRequestedRef.current) {
            socket.close();
            return;
          }
          setState("running");
          startedAtMs = Date.now();
          socket.send(JSON.stringify({ type: "start", language, sourceCode }));
        });
        socket.addEventListener("message", (event) => {
          try {
            const message = interactiveRunServerMessageSchema.parse(
              JSON.parse(String(event.data)),
            );
            switch (message.type) {
              case "stdout":
              case "stderr":
                append(message.type, message.data);
                break;
              case "exit":
                terminalMessageReceived = true;
                setState("finished");
                append(
                  "status",
                  `\n[Process exited with code ${message.exitCode}]\n`,
                );
                void executionFetch("/v1/interactive-run-history", {
                  method: "POST",
                  body: JSON.stringify({
                    language,
                    exitCode: message.exitCode,
                    timeMs:
                      startedAtMs === null ? null : Date.now() - startedAtMs,
                  }),
                }).catch(() => undefined);
                socket.close();
                break;
              case "error":
                terminalMessageReceived = true;
                setState("finished");
                append("stderr", `\n[${message.message}]\n`);
                socket.close();
                break;
            }
          } catch {
            terminalMessageReceived = true;
            setState("finished");
            append("stderr", "\n[Invalid response from runner]\n");
            socket.close();
          }
        });
        socket.addEventListener("error", () => {
          if (terminalMessageReceived) return;
          terminalMessageReceived = true;
          setState("finished");
          append("stderr", "\n[Interactive connection failed]\n");
        });
        socket.addEventListener("close", () => {
          if (socketRef.current === socket) socketRef.current = null;
          if (terminalMessageReceived) return;
          terminalMessageReceived = true;
          setState("finished");
          append(
            "status",
            stopRequestedRef.current
              ? "\n[Run stopped]\n"
              : "\n[Interactive connection closed]\n",
          );
        });
      } catch (error) {
        setState("finished");
        append(
          "stderr",
          `\n[${
            error instanceof Error
              ? error.message
              : "Interactive execution could not be started."
          }]\n`,
        );
      }
    },
    [state, authorizedFetch, executionFetch, append],
  );

  const sendInput = useCallback(
    (line: string) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) return;
      socket.send(JSON.stringify({ type: "stdin", data: line + "\n" }));
      append("stdin", line + "\n");
    },
    [append],
  );

  const stop = useCallback(() => {
    stopRequestedRef.current = true;
    socketRef.current?.close();
  }, []);

  return { state, entries, run, sendInput, stop };
}
