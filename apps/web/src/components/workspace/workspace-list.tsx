"use client";

import {
  workspaceSummarySchema,
  type Role,
  type WorkspaceSummary,
} from "@sqweb/contracts";
import { Database, RefreshCw, RotateCcw } from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { randomId } from "@/lib/random-id";
import { DEFAULT_POLL_INTERVAL_MS } from "@/lib/use-polling";
import { Spinner } from "@/components/ui/spinner";
import { SqlWorkbench } from "@/components/workbench/sql-workbench";

const transitionalStates = new Set(["requested", "provisioning", "resetting"]);

function stateLabel(state: WorkspaceSummary["state"]) {
  return state.replaceAll("_", " ");
}

export function WorkspaceList({
  role,
}: Readonly<{ role: Extract<Role, "student" | "teacher"> }>) {
  const { authorizedFetch } = useAuth();
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceSummary[]>([]);
  const [status, setStatus] = useState("Loading workspace…");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const response = await authorizedFetch("/v1/workspaces");
      if (!response.ok) throw new Error("The workspace could not be loaded.");
      const parsed = workspaceSummarySchema
        .array()
        .parse(await response.json());
      setWorkspaces(parsed);
      setStatus(
        parsed.length ? "" : "No personal workspace has been requested.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The workspace could not be loaded.",
      );
    } finally {
      setRefreshing(false);
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    // Poll faster while a workspace is mid-transition (provisioning/
    // resetting) for snappy state updates; otherwise still poll at a
    // slower, "live snap" cadence so changes made elsewhere show up here
    // without a manual refresh.
    const hasTransitional = workspaces.some((workspace) =>
      transitionalStates.has(workspace.state),
    );
    const poll = window.setInterval(
      () => void load(),
      hasTransitional ? 3000 : DEFAULT_POLL_INTERVAL_MS,
    );
    return () => {
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [load, workspaces]);

  async function requestWorkspace() {
    setBusy(true);
    setStatus("Requesting an isolated workspace…");
    try {
      const response = await authorizedFetch("/v1/workspaces", {
        method: "POST",
        headers: { "Idempotency-Key": randomId() },
        body: JSON.stringify({ scope: "personal" }),
      });
      if (!response.ok)
        throw new Error("The workspace request was not accepted.");
      await load();
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The workspace request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetWorkspace(
    event: FormEvent<HTMLFormElement>,
    workspaceId: string,
  ) {
    event.preventDefault();
    const form = event.currentTarget;
    const reason = String(new FormData(form).get("reason") ?? "");
    setBusy(true);
    setStatus("Preparing a clean replacement workspace…");
    try {
      const response = await authorizedFetch(
        `/v1/workspaces/${workspaceId}/reset`,
        {
          method: "POST",
          headers: { "Idempotency-Key": randomId() },
          body: JSON.stringify({ reason }),
        },
      );
      if (!response.ok) throw new Error("The reset request was not accepted.");
      form.reset();
      await load();
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The reset request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const hasReadyWorkspace = workspaces.some(
    (workspace) => workspace.state === "ready",
  );

  return (
    <div className="space-y-5">
      {!hasReadyWorkspace ? (
        <>
          <section className="border-structural bg-surface rounded-panel border">
            <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
              <div>
                <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
                  {role === "teacher" ? "Teacher" : "Student"} personal MySQL
                  workspace
                </h2>
                <p className="text-ink-muted mt-1 max-w-2xl text-xs">
                  CodeForge provisions a private database account. Credentials
                  remain server-side and are never returned here.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void load()}
                disabled={refreshing}
                className="border-structural text-ink-muted hover:text-ink-primary rounded-control flex min-h-10 items-center gap-2 border px-3 text-xs disabled:opacity-50"
              >
                <RefreshCw
                  aria-hidden="true"
                  size={14}
                  className={
                    refreshing ? "animate-spin motion-reduce:animate-none" : ""
                  }
                />{" "}
                Refresh
              </button>
            </div>
            {workspaces.length === 0 ? (
              <div className="p-4">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void requestWorkspace()}
                  className="bg-action rounded-control flex min-h-10 items-center gap-2 px-4 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy ? <Spinner /> : null}
                  Request personal workspace
                </button>
              </div>
            ) : null}
          </section>

          <p
            role="status"
            aria-live="polite"
            className="text-ink-muted min-h-5 text-xs"
          >
            {status}
          </p>
        </>
      ) : null}

      {workspaces.map((workspace) => (
        <div key={workspace.id} className="space-y-5">
          {workspace.state !== "ready" ? (
            <article className="border-structural bg-surface rounded-panel overflow-hidden border">
              <div className="border-divider flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="border-divider bg-elevated text-action-soft rounded-control grid size-9 place-items-center border">
                    <Database aria-hidden="true" size={16} />
                  </span>
                  <div>
                    <h3 className="text-ink-primary text-sm font-semibold">
                      Personal workspace
                    </h3>
                    <p className="text-ink-muted font-mono text-[11px]">
                      {workspace.id}
                    </p>
                  </div>
                </div>
                <span className="text-ink-secondary flex items-center gap-2 text-xs capitalize">
                  <span
                    aria-hidden="true"
                    className="bg-info size-1.5 rounded-full"
                  />
                  {stateLabel(workspace.state)}
                </span>
              </div>
              <dl className="grid gap-px bg-[var(--color-divider)] sm:grid-cols-3">
                <div className="bg-surface p-4">
                  <dt className="text-ink-muted text-[11px] uppercase">
                    Storage limit
                  </dt>
                  <dd className="text-ink-primary mt-1 font-mono text-sm">
                    {Math.round(workspace.quotaBytes / 1024 / 1024)} MB
                  </dd>
                </div>
                <div className="bg-surface p-4">
                  <dt className="text-ink-muted text-[11px] uppercase">
                    Isolation
                  </dt>
                  <dd className="text-ink-primary mt-1 text-sm">
                    Private database + account
                  </dd>
                </div>
                <div className="bg-surface p-4">
                  <dt className="text-ink-muted text-[11px] uppercase">
                    Updated
                  </dt>
                  <dd className="text-ink-primary mt-1 text-sm">
                    {new Date(workspace.updatedAt).toLocaleString()}
                  </dd>
                </div>
              </dl>
              {workspace.state === "failed" ? (
                <form
                  onSubmit={(event) => void resetWorkspace(event, workspace.id)}
                  className="border-divider grid gap-3 border-t p-4 sm:grid-cols-[1fr_auto] sm:items-end"
                >
                  <label className="text-ink-muted grid gap-1.5 text-xs">
                    Reset reason
                    <input
                      name="reason"
                      required
                      minLength={8}
                      maxLength={500}
                      disabled={busy}
                      placeholder="Explain why a clean workspace is needed"
                      className="border-divider bg-elevated text-ink-primary rounded-control min-h-10 border px-3"
                    />
                  </label>
                  <button
                    disabled={busy}
                    className="border-structural text-ink-secondary hover:text-ink-primary rounded-control flex min-h-10 items-center justify-center gap-2 border px-4 text-xs disabled:opacity-50"
                  >
                    {busy ? (
                      <Spinner />
                    ) : (
                      <RotateCcw aria-hidden="true" size={14} />
                    )}
                    Reset safely
                  </button>
                </form>
              ) : null}
            </article>
          ) : null}
          {workspace.state === "ready" ? (
            <SqlWorkbench workspaceId={workspace.id} role={role} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
