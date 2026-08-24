"use client";

import { Square } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";

export interface InteractiveConsoleEntry {
  readonly id: string;
  readonly kind: "stdout" | "stderr" | "stdin" | "status";
  readonly data: string;
}

export function InteractiveConsole({
  entries,
  state,
  onSubmit,
  onStop,
}: Readonly<{
  entries: readonly InteractiveConsoleEntry[];
  state: "idle" | "connecting" | "running" | "finished";
  onSubmit: (line: string) => void;
  onStop: () => void;
}>) {
  const [value, setValue] = useState("");
  const transcriptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const transcript = transcriptRef.current;
    if (transcript) transcript.scrollTop = transcript.scrollHeight;
  }, [entries]);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (state !== "running" || !value) return;
    onSubmit(value);
    setValue("");
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={transcriptRef}
        aria-live="polite"
        aria-label="Interactive console transcript"
        className="bg-deep min-h-0 flex-1 overflow-auto p-3"
      >
        {entries.length ? (
          <pre className="font-mono text-xs whitespace-pre-wrap">
            {entries.map((entry) => (
              <span
                key={entry.id}
                className={
                  entry.kind === "stderr"
                    ? "text-danger"
                    : entry.kind === "stdin"
                      ? "text-action-soft"
                      : entry.kind === "status"
                        ? "text-ink-muted"
                        : "text-ink-primary"
                }
              >
                {entry.data}
              </span>
            ))}
          </pre>
        ) : (
          <p className="text-ink-muted text-xs">
            Start an interactive run to open the console.
          </p>
        )}
      </div>
      <form
        onSubmit={submit}
        className="border-divider bg-surface flex shrink-0 items-center gap-2 border-t p-2"
      >
        <span aria-hidden="true" className="text-action-soft font-mono text-xs">
          &gt;
        </span>
        <input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          disabled={state !== "running"}
          aria-label="Program input"
          placeholder={
            state === "connecting"
              ? "Starting container…"
              : state === "running"
                ? "Type a response and press Enter"
                : "Interactive input is closed"
          }
          autoComplete="off"
          spellCheck={false}
          className="text-ink-primary placeholder:text-ink-disabled min-h-9 min-w-0 flex-1 bg-transparent px-1 font-mono text-xs outline-none disabled:opacity-60"
        />
        {state === "connecting" || state === "running" ? (
          <button
            type="button"
            onClick={onStop}
            className="border-structural text-danger rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs"
          >
            <Square aria-hidden="true" size={12} fill="currentColor" /> Stop
          </button>
        ) : null}
      </form>
    </div>
  );
}
