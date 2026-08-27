"use client";

import {
  activityResetSummarySchema,
  systemStatusSchema,
  type ActivityResetSummary,
  type SystemStatus,
} from "@sqweb/contracts";
import { AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";

interface Feedback {
  readonly tone: "success" | "error";
  readonly message: string;
}

export function SystemSettingsView() {
  const auth = useAuth();
  const { publicFetch } = auth;
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmingEnable, setConfirmingEnable] = useState(false);
  const [saving, setSaving] = useState<"enable" | "disable" | null>(null);
  const [feedback, setFeedback] = useState<Feedback | undefined>();

  const [confirmingReset, setConfirmingReset] = useState(false);
  const [resetReason, setResetReason] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<Feedback | undefined>();
  const [resetSummary, setResetSummary] = useState<ActivityResetSummary | null>(
    null,
  );

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await publicFetch("/v1/system/status");
      if (!response.ok) throw new Error("System status could not be loaded.");
      const parsed = systemStatusSchema.parse(await response.json());
      setStatus(parsed);
      setMessageDraft(parsed.message ?? "");
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "System status could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
    // AuthProvider recreates its whole context value object every render, so
    // depending on `auth` here (instead of the specific stable `publicFetch`
    // callback) would re-run the mount effect below on every re-render.
  }, [publicFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function updateMaintenance(enabled: boolean) {
    setSaving(enabled ? "enable" : "disable");
    setFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        "/v1/admin/settings/maintenance",
        {
          method: "PUT",
          body: JSON.stringify({
            enabled,
            message: messageDraft.trim() ? messageDraft.trim() : null,
          }),
        },
      );
      if (!response.ok)
        throw new Error("Maintenance mode could not be updated.");
      const parsed = systemStatusSchema.parse(await response.json());
      setStatus(parsed);
      setConfirmingEnable(false);
      setFeedback({
        tone: "success",
        message: enabled
          ? "Maintenance mode is on. Students and teachers have been signed out."
          : "Maintenance mode is off. Sign-ins are open again.",
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Maintenance mode could not be updated.",
      });
    } finally {
      setSaving(null);
    }
  }

  async function resetActivity() {
    setResetting(true);
    setResetFeedback(undefined);
    try {
      const response = await auth.authorizedFetch(
        "/v1/admin/settings/activity-reset",
        {
          method: "POST",
          body: JSON.stringify({ reason: resetReason.trim() }),
        },
      );
      if (!response.ok) throw new Error("Activity numbers could not be reset.");
      const parsed = activityResetSummarySchema.parse(await response.json());
      setResetSummary(parsed);
      setConfirmingReset(false);
      setResetReason("");
      setResetFeedback({
        tone: "success",
        message: `Cleared ${(
          parsed.sqlExecutionsCleared +
          parsed.codeExecutionsCleared +
          parsed.guiSessionsCleared
        ).toLocaleString()} activity records. Saved files and diagrams were not touched.`,
      });
    } catch (error) {
      setResetFeedback({
        tone: "error",
        message:
          error instanceof Error
            ? error.message
            : "Activity numbers could not be reset.",
      });
    } finally {
      setResetting(false);
    }
  }

  if (loading) {
    return (
      <div className="grid min-h-40 place-items-center">
        <Spinner size={20} />
      </div>
    );
  }

  if (loadError || !status) {
    return (
      <IdentityStatus tone="error">
        {loadError ?? "System status could not be loaded."}
      </IdentityStatus>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-panel border-structural bg-surface border p-4">
        <div className="flex items-center gap-3">
          <span
            className={`rounded-control grid size-10 shrink-0 place-items-center border ${
              status.maintenanceMode
                ? "border-warning/30 bg-warning/10 text-warning"
                : "border-divider bg-panel text-success"
            }`}
          >
            {status.maintenanceMode ? (
              <AlertTriangle aria-hidden="true" size={18} strokeWidth={1.7} />
            ) : (
              <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.7} />
            )}
          </span>
          <div>
            <p className="text-ink-primary text-sm font-semibold">
              {status.maintenanceMode
                ? "Maintenance mode is ON"
                : "System is live"}
            </p>
            <p className="text-ink-muted mt-0.5 text-xs">
              {status.maintenanceMode
                ? "Students and teachers are signed out and blocked from signing back in."
                : "Students and teachers can sign in and use CodeForge normally."}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-panel border-structural bg-surface border p-4">
        <h3 className="font-heading text-ink-primary text-base font-semibold">
          Maintenance message
        </h3>
        <p className="text-ink-muted mt-0.5 text-xs">
          Shown to students and teachers when they&apos;re signed out for
          maintenance. Leave blank to use the default message. Administrators
          are never signed out or blocked.
        </p>
        <textarea
          value={messageDraft}
          onChange={(event) => setMessageDraft(event.target.value)}
          maxLength={500}
          rows={3}
          placeholder="CodeForge is temporarily undergoing scheduled maintenance. Please try again shortly."
          className="border-structural bg-canvas text-ink-primary rounded-control mt-3 w-full border px-3 py-2 text-sm"
        />

        {feedback ? (
          <p
            className={`mt-3 text-xs ${
              feedback.tone === "error" ? "text-danger" : "text-success"
            }`}
          >
            {feedback.message}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {status.maintenanceMode ? (
            <button
              type="button"
              disabled={saving !== null}
              onClick={() => void updateMaintenance(false)}
              className="rounded-control bg-action hover:bg-action/90 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving === "disable" ? <Spinner size={13} /> : null}
              End maintenance mode
            </button>
          ) : !confirmingEnable ? (
            <button
              type="button"
              onClick={() => setConfirmingEnable(true)}
              className="border-danger/30 text-danger hover:bg-danger/10 rounded-control flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold"
            >
              Freeze system for maintenance
            </button>
          ) : null}
        </div>

        {confirmingEnable ? (
          <div className="border-danger/30 bg-danger/5 rounded-control mt-3 border p-3">
            <p className="text-ink-primary text-xs leading-5">
              This immediately signs out every student and teacher currently
              signed in, and blocks new sign-ins until you end maintenance mode.
              Administrators are not affected.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmingEnable(false)}
                className="text-ink-muted rounded-control px-2.5 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={saving !== null}
                onClick={() => void updateMaintenance(true)}
                className="rounded-control bg-danger hover:bg-danger/90 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving === "enable" ? <Spinner size={13} /> : null}
                Freeze system now
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-panel border-structural bg-surface border p-4">
        <div className="flex items-center gap-3">
          <span className="rounded-control border-divider bg-panel text-ink-muted grid size-10 shrink-0 place-items-center border">
            <RotateCcw aria-hidden="true" size={18} strokeWidth={1.7} />
          </span>
          <div>
            <h3 className="text-ink-primary text-sm font-semibold">
              Reset activity numbers
            </h3>
            <p className="text-ink-muted mt-0.5 text-xs">
              Clears SQL run history, code run history, and finished Java GUI
              session history — the counts behind the dashboard and Top
              Contributors leaderboard.
            </p>
          </div>
        </div>

        <p className="text-ink-muted mt-3 text-xs leading-5">
          Saved SQL workspaces, code files, ERD diagrams, saved queries, and
          Java GUI workspace files are never touched. A run or session still in
          progress is skipped, never interrupted.
        </p>

        {resetSummary ? (
          <dl className="mt-3 grid grid-cols-3 gap-2">
            <ResetStat
              label="SQL runs cleared"
              value={resetSummary.sqlExecutionsCleared}
            />
            <ResetStat
              label="Code runs cleared"
              value={resetSummary.codeExecutionsCleared}
            />
            <ResetStat
              label="GUI sessions cleared"
              value={resetSummary.guiSessionsCleared}
            />
          </dl>
        ) : null}

        {resetFeedback ? (
          <p
            className={`mt-3 text-xs ${
              resetFeedback.tone === "error" ? "text-danger" : "text-success"
            }`}
          >
            {resetFeedback.message}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          {!confirmingReset ? (
            <button
              type="button"
              onClick={() => {
                setConfirmingReset(true);
                setResetFeedback(undefined);
              }}
              className="border-danger/30 text-danger hover:bg-danger/10 rounded-control flex items-center gap-1.5 border px-3 py-1.5 text-xs font-semibold"
            >
              Reset activity numbers
            </button>
          ) : null}
        </div>

        {confirmingReset ? (
          <div className="border-danger/30 bg-danger/5 rounded-control mt-3 border p-3">
            <p className="text-ink-primary text-xs leading-5">
              This permanently deletes the finished SQL/code run history and
              finished Java GUI session history for every student. It cannot be
              undone. No saved files, diagrams, or in-progress work are
              affected.
            </p>
            <label className="text-ink-muted mt-3 mb-1.5 block text-[11px]">
              Reason (at least 8 characters)
              <textarea
                value={resetReason}
                onChange={(event) => setResetReason(event.target.value)}
                rows={2}
                className="border-structural bg-canvas text-ink-primary rounded-control mt-1 w-full border px-2.5 py-1.5 text-sm"
              />
            </label>
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setConfirmingReset(false);
                  setResetReason("");
                }}
                className="text-ink-muted rounded-control px-2.5 py-1.5 text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={resetReason.trim().length < 8 || resetting}
                onClick={() => void resetActivity()}
                className="rounded-control bg-danger hover:bg-danger/90 flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {resetting ? <Spinner size={13} /> : null}
                Reset now
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ResetStat({
  label,
  value,
}: Readonly<{ label: string; value: number }>) {
  return (
    <div className="border-divider bg-panel rounded-control border p-2.5">
      <p className="text-ink-primary text-sm font-semibold tabular-nums">
        {value.toLocaleString()}
      </p>
      <p className="text-ink-muted mt-0.5 text-[10px]">{label}</p>
    </div>
  );
}
