"use client";

import {
  erdDiagramSchema,
  erdDiagramSummarySchema,
  type ErdDiagramSummary,
  type Role,
} from "@sqweb/contracts";
import { Network, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

const DELETE_CONFIRM_WINDOW_MS = 4000;

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function ErdDiagramList({
  role,
}: Readonly<{ role: Extract<Role, "student" | "teacher"> }>) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const basePath = `/${role}/erd-workspace`;
  const [diagrams, setDiagrams] = useState<readonly ErdDiagramSummary[]>([]);
  const [status, setStatus] = useState("Loading diagrams…");
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const confirmTimeoutRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/v1/erd-diagrams");
      if (!response.ok) throw new Error("Diagrams could not be loaded.");
      const parsed = erdDiagramSummarySchema
        .array()
        .parse(await response.json());
      setDiagrams(parsed);
      setStatus(parsed.length ? "" : "No diagrams yet.");
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "Diagrams could not be loaded.",
      );
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Live-reflects diagrams created/renamed/deleted in another tab without a
  // manual refresh.
  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  useEffect(
    () => () => {
      if (confirmTimeoutRef.current !== null)
        window.clearTimeout(confirmTimeoutRef.current);
    },
    [],
  );

  async function createDiagram() {
    setBusy(true);
    try {
      const response = await authorizedFetch("/v1/erd-diagrams", {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("The diagram could not be created.");
      const created = erdDiagramSchema.parse(await response.json());
      router.push(`${basePath}/${created.id}`);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The diagram could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function renameDiagram(id: string, name: string) {
    const trimmed = name.trim();
    setRenamingId(null);
    if (!trimmed) return;
    setDiagrams((current) =>
      current.map((diagram) =>
        diagram.id === id ? { ...diagram, name: trimmed } : diagram,
      ),
    );
    try {
      const response = await authorizedFetch(`/v1/erd-diagrams/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) throw new Error("The rename was not accepted.");
    } catch {
      await load();
    }
  }

  function requestDelete(id: string) {
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      if (confirmTimeoutRef.current !== null)
        window.clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingDeleteId(null);
      }, DELETE_CONFIRM_WINDOW_MS);
      return;
    }
    void deleteDiagram(id);
  }

  async function deleteDiagram(id: string) {
    setConfirmingDeleteId(null);
    setBusy(true);
    try {
      const response = await authorizedFetch(`/v1/erd-diagrams/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("The diagram could not be deleted.");
      setDiagrams((current) => current.filter((diagram) => diagram.id !== id));
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The diagram could not be deleted.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="border-structural bg-surface rounded-panel border">
        <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
              ERD diagrams
            </h2>
            <p className="text-ink-muted mt-1 max-w-2xl text-xs">
              Saved to your account — open one to keep editing, or start a new
              one.
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createDiagram()}
            className="bg-action rounded-control flex min-h-10 items-center gap-2 px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? (
              <Spinner size={15} />
            ) : (
              <Plus aria-hidden="true" size={15} />
            )}
            New diagram
          </button>
        </div>
      </section>

      {diagrams.length === 0 ? (
        <p
          role="status"
          aria-live="polite"
          className="text-ink-muted min-h-5 text-xs"
        >
          {status}
        </p>
      ) : null}

      {diagrams.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {diagrams.map((diagram) => (
            <li
              key={diagram.id}
              className="border-structural bg-surface rounded-panel overflow-hidden border"
            >
              <div className="flex items-start gap-3 p-4">
                <span className="border-divider bg-elevated text-action-soft rounded-control grid size-9 shrink-0 place-items-center border">
                  <Network aria-hidden="true" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  {renamingId === diagram.id ? (
                    <input
                      autoFocus
                      value={renamingName}
                      onChange={(event) => setRenamingName(event.target.value)}
                      onBlur={() =>
                        void renameDiagram(diagram.id, renamingName)
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter")
                          void renameDiagram(diagram.id, renamingName);
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      className="border-structural bg-elevated text-ink-primary rounded-control w-full border px-2 py-1 text-sm"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Link
                        href={`${basePath}/${diagram.id}`}
                        className="text-ink-primary min-w-0 truncate text-sm font-semibold hover:underline"
                      >
                        {diagram.name}
                      </Link>
                      <button
                        type="button"
                        aria-label={`Rename ${diagram.name}`}
                        onClick={() => {
                          setRenamingId(diagram.id);
                          setRenamingName(diagram.name);
                        }}
                        className="text-ink-muted hover:text-ink-primary shrink-0"
                      >
                        <Pencil aria-hidden="true" size={12} />
                      </button>
                    </div>
                  )}
                  <p className="text-ink-muted mt-1 text-[11px]">
                    Created {formatDate(diagram.createdAt)} · Updated{" "}
                    {formatDate(diagram.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => requestDelete(diagram.id)}
                  className={`rounded-control flex min-h-8 shrink-0 items-center gap-1.5 px-2 text-[11px] disabled:opacity-50 ${
                    confirmingDeleteId === diagram.id
                      ? "text-danger"
                      : "text-ink-muted hover:text-danger"
                  }`}
                >
                  {busy ? (
                    <Spinner size={13} />
                  ) : (
                    <Trash2 aria-hidden="true" size={13} />
                  )}
                  {confirmingDeleteId === diagram.id ? "Confirm delete?" : ""}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
