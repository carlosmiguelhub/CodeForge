"use client";

import {
  savedQuerySchema,
  workspaceSummarySchema,
  type Role,
  type SavedQuery,
} from "@sqweb/contracts";
import {
  Database,
  FileCode2,
  Pencil,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

const DELETE_CONFIRM_WINDOW_MS = 4000;
export const OPEN_SAVED_QUERY_KEY = "sqweb:open-saved-query";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function SavedQueryList({
  role,
}: Readonly<{ role: Extract<Role, "student" | "teacher"> }>) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const [workspaceId, setWorkspaceId] = useState<string | null | undefined>(
    undefined,
  );
  const [queries, setQueries] = useState<readonly SavedQuery[]>([]);
  const [status, setStatus] = useState("Loading saved queries…");
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renamingName, setRenamingName] = useState("");
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(
    null,
  );
  const confirmTimeoutRef = useRef<number | null>(null);

  const load = useCallback(
    async (currentWorkspaceId: string) => {
      try {
        const response = await authorizedFetch(
          `/v1/saved-queries?workspaceId=${encodeURIComponent(currentWorkspaceId)}`,
        );
        if (!response.ok) throw new Error("Saved queries could not be loaded.");
        const parsed = savedQuerySchema.array().parse(await response.json());
        setQueries(parsed);
        setStatus(parsed.length ? "" : "No saved queries yet.");
      } catch (error) {
        setStatus(
          error instanceof Error
            ? error.message
            : "Saved queries could not be loaded.",
        );
      }
    },
    [authorizedFetch],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void (async () => {
        const response = await authorizedFetch("/v1/workspaces");
        if (!response.ok) {
          setWorkspaceId(null);
          setStatus("The workspace could not be loaded.");
          return;
        }
        const workspaces = workspaceSummarySchema
          .array()
          .parse(await response.json());
        const id = workspaces[0]?.id ?? null;
        setWorkspaceId(id);
        if (id) void load(id);
        else setStatus("Request a personal SQL workspace first.");
      })();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [authorizedFetch, load]);

  // Live-reflects queries saved/renamed/deleted in another tab without a
  // manual refresh.
  usePolling(() => {
    if (workspaceId) void load(workspaceId);
  }, DEFAULT_POLL_INTERVAL_MS);

  useEffect(
    () => () => {
      if (confirmTimeoutRef.current !== null)
        window.clearTimeout(confirmTimeoutRef.current);
    },
    [],
  );

  function openInWorkbench(query: SavedQuery) {
    try {
      window.sessionStorage.setItem(
        OPEN_SAVED_QUERY_KEY,
        JSON.stringify({ name: query.name, sql: query.sql }),
      );
    } catch {
      // Storage can be unavailable (private browsing) — the query still
      // opens, it just falls back to a fresh tab instead of a named one.
    }
    router.push(`/${role}/workspaces`);
  }

  async function renameQuery(id: string, name: string) {
    const trimmed = name.trim();
    setRenamingId(null);
    if (!trimmed) return;
    setQueries((current) =>
      current.map((query) =>
        query.id === id ? { ...query, name: trimmed } : query,
      ),
    );
    try {
      const response = await authorizedFetch(`/v1/saved-queries/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) throw new Error("The rename was not accepted.");
    } catch {
      if (workspaceId) await load(workspaceId);
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
    void deleteQuery(id);
  }

  async function deleteQuery(id: string) {
    setConfirmingDeleteId(null);
    setBusy(true);
    try {
      const response = await authorizedFetch(`/v1/saved-queries/${id}`, {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error("The saved query could not be deleted.");
      setQueries((current) => current.filter((query) => query.id !== id));
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The saved query could not be deleted.",
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
              Saved queries
            </h2>
            <p className="text-ink-muted mt-1 max-w-2xl text-xs">
              SQL you&apos;ve explicitly saved from the workbench — open one to
              keep editing, or run it again.
            </p>
          </div>
        </div>
      </section>

      {workspaceId === null ? (
        <div className="border-structural bg-surface rounded-panel flex items-center gap-3 border p-4">
          <Database
            aria-hidden="true"
            className="text-ink-disabled"
            size={18}
          />
          <p className="text-ink-muted text-xs leading-5">
            {status || "Request a personal SQL workspace first."}
          </p>
        </div>
      ) : null}

      {workspaceId && queries.length === 0 ? (
        <p
          role="status"
          aria-live="polite"
          className="text-ink-muted min-h-5 text-xs"
        >
          {status}
        </p>
      ) : null}

      {queries.length > 0 ? (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {queries.map((query) => (
            <li
              key={query.id}
              className="border-structural bg-surface rounded-panel overflow-hidden border"
            >
              <div className="flex items-start gap-3 p-4">
                <span className="border-divider bg-elevated text-action-soft rounded-control grid size-9 shrink-0 place-items-center border">
                  <FileCode2 aria-hidden="true" size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  {renamingId === query.id ? (
                    <input
                      autoFocus
                      value={renamingName}
                      onChange={(event) => setRenamingName(event.target.value)}
                      onBlur={() => void renameQuery(query.id, renamingName)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter")
                          void renameQuery(query.id, renamingName);
                        if (event.key === "Escape") setRenamingId(null);
                      }}
                      className="border-structural bg-elevated text-ink-primary rounded-control w-full border px-2 py-1 text-sm"
                    />
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openInWorkbench(query)}
                        className="text-ink-primary min-w-0 truncate text-left text-sm font-semibold hover:underline"
                      >
                        {query.name}
                      </button>
                      <button
                        type="button"
                        aria-label={`Rename ${query.name}`}
                        onClick={() => {
                          setRenamingId(query.id);
                          setRenamingName(query.name);
                        }}
                        className="text-ink-muted hover:text-ink-primary shrink-0"
                      >
                        <Pencil aria-hidden="true" size={12} />
                      </button>
                    </div>
                  )}
                  <p className="text-ink-muted mt-1 truncate font-mono text-[11px]">
                    {query.sql}
                  </p>
                  <p className="text-ink-muted mt-1 text-[11px]">
                    Created {formatDate(query.createdAt)} · Updated{" "}
                    {formatDate(query.updatedAt)}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => requestDelete(query.id)}
                  className={`rounded-control flex min-h-8 shrink-0 items-center gap-1.5 px-2 text-[11px] disabled:opacity-50 ${
                    confirmingDeleteId === query.id
                      ? "text-danger"
                      : "text-ink-muted hover:text-danger"
                  }`}
                >
                  {busy ? (
                    <Spinner size={13} />
                  ) : (
                    <Trash2 aria-hidden="true" size={13} />
                  )}
                  {confirmingDeleteId === query.id ? "Confirm delete?" : ""}
                </button>
              </div>
              <button
                type="button"
                onClick={() => openInWorkbench(query)}
                className="border-divider text-action-soft hover:bg-elevated flex w-full items-center justify-center gap-2 border-t px-4 py-2 text-xs"
              >
                <SquareTerminal aria-hidden="true" size={13} /> Open in
                workbench
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
