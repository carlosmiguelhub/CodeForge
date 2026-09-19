"use client";

import {
  ACTIVITY_ALLOWED_VIOLATIONS,
  ACTIVITY_VIOLATION_DEDUCTION_PERCENT,
  activitySchema,
  activitySubmissionSchema,
  codeLanguageMeta,
  violationDeductionAmount,
  type Activity,
  type ActivitySubmission,
} from "@sqweb/contracts";
import {
  Check,
  CircleAlert,
  CircleDashed,
  Clock3,
  Code2,
  Eye,
  FileText,
  ListChecks,
  Lock,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

import { ActivityFormDialog } from "./activity-form-dialog";
import { ActivityPreviewModal } from "./activity-preview-modal";
import { FormattedInstructions } from "./formatted-instructions";

const RESET_CONFIRM_WINDOW_MS = 4000;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const violationLabel: Record<string, string> = {
  tab_switch: "Switched tabs / apps",
  fullscreen_exit: "Exited fullscreen",
};

// Advisory only — these describe a pattern the heuristics noticed, not a
// verdict. A teacher should read the message and judge for themselves.
const integrityFlagLabel: Record<string, string> = {
  input_ignored: "Possible unused input",
  output_invariant: "Output didn't vary with input",
};

const comparisonLabel = {
  normalized_exact: "Normalized exact output",
  token: "Whitespace-insensitive tokens",
  numeric: "Numeric tolerance",
  suffix_exact: "Output ends with (prompts allowed)",
} as const;

type Tab = "instructions" | "testCases" | "submissions";

// Every terminal status — passed, submitted-incomplete, or zeroed — is
// eligible for a teacher-initiated reset back to in_progress.
function isResettable(status: ActivitySubmission["status"]): boolean {
  return (
    status === "passed" ||
    status === "submitted_incomplete" ||
    status === "zeroed_violation"
  );
}

function submittedAtLabel(status: ActivitySubmission["status"]): string {
  if (status === "zeroed_violation") return "Zeroed";
  if (status === "submitted_incomplete") return "Submitted";
  return "Passed";
}

const statusBadge: Record<
  ActivitySubmission["status"],
  { label: string; className: string; icon: typeof Check }
> = {
  passed: {
    label: "Passed",
    className: "text-success bg-success/5 border-success/30",
    icon: Check,
  },
  submitted_incomplete: {
    label: "Submitted (incomplete)",
    className: "text-warning bg-warning/5 border-warning/30",
    icon: CircleAlert,
  },
  in_progress: {
    label: "In progress",
    className: "text-warning bg-warning/5 border-warning/30",
    icon: CircleDashed,
  },
  zeroed_violation: {
    label: "Zeroed",
    className: "text-danger bg-danger/5 border-danger/30",
    icon: X,
  },
  not_started: {
    label: "Not started",
    className: "text-ink-muted bg-panel border-divider",
    icon: CircleDashed,
  },
};

export function ActivityDetailTeacher({
  activityId,
}: Readonly<{ activityId: string }>) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const [activity, setActivity] = useState<Activity | null>(null);
  const [status, setStatus] = useState("Loading activity…");
  const [submissions, setSubmissions] = useState<readonly ActivitySubmission[]>(
    [],
  );
  const [tab, setTab] = useState<Tab>("instructions");
  const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(
    null,
  );
  const [confirmingResetId, setConfirmingResetId] = useState<string | null>(
    null,
  );
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [selectedResetIds, setSelectedResetIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [confirmingBulkReset, setConfirmingBulkReset] = useState(false);
  const [bulkResetting, setBulkResetting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [scheduleDeadlineAt, setScheduleDeadlineAt] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<number | null>(null);
  const bulkConfirmTimeoutRef = useRef<number | null>(null);
  const deleteConfirmTimeoutRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const [activityRes, submissionsRes] = await Promise.all([
        authorizedFetch(`/v1/activities/${activityId}`),
        authorizedFetch(`/v1/activities/${activityId}/submissions`),
      ]);
      if (!activityRes.ok || !submissionsRes.ok) {
        throw new Error(
          activityRes.status === 404
            ? "This activity doesn't exist, or you don't have access to it."
            : "The activity could not be loaded.",
        );
      }
      const parsedActivity = activitySchema.safeParse(await activityRes.json());
      if (!parsedActivity.success) {
        throw new Error(
          "The activity data is temporarily out of date. Refresh once the classroom services have restarted.",
        );
      }
      setActivity(parsedActivity.data);
      setScheduleDeadlineAt((current) =>
        current === ""
          ? localDateTimeValue(
              parsedActivity.data.deadlineAt
                ? new Date(parsedActivity.data.deadlineAt)
                : new Date(),
            )
          : current,
      );
      setSubmissions(
        activitySubmissionSchema.array().parse(await submissionsRes.json()),
      );
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "The activity could not be loaded.",
      );
    }
  }, [authorizedFetch, activityId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  useEffect(
    () => () => {
      if (confirmTimeoutRef.current !== null)
        window.clearTimeout(confirmTimeoutRef.current);
      if (bulkConfirmTimeoutRef.current !== null)
        window.clearTimeout(bulkConfirmTimeoutRef.current);
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
    },
    [],
  );

  function requestDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      deleteConfirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingDelete(false);
      }, RESET_CONFIRM_WINDOW_MS);
      return;
    }
    void deleteActivity();
  }

  async function deleteActivity() {
    if (!activity) return;
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      const response = await authorizedFetch(`/v1/activities/${activityId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("The activity could not be deleted.");
      router.push(`/teacher/classes/${activity.classId}`);
    } catch {
      setDeleting(false);
    }
  }

  // Serves both "extend the deadline" and "reopen a locked activity" in
  // one action — setting a new deadline also unconditionally clears the
  // manual lock, same precedent as Code Racing's schedule control.
  async function extendSchedule() {
    setExtending(true);
    setExtendError(null);
    try {
      const response = await authorizedFetch(
        `/v1/activities/${activityId}/schedule`,
        {
          method: "PATCH",
          body: JSON.stringify({
            deadlineAt: new Date(scheduleDeadlineAt).toISOString(),
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The schedule could not be updated.",
        );
      }
      await load();
    } catch (error) {
      setExtendError(
        error instanceof Error
          ? error.message
          : "The schedule could not be updated.",
      );
    } finally {
      setExtending(false);
    }
  }

  async function removeDeadline() {
    setExtending(true);
    setExtendError(null);
    try {
      const response = await authorizedFetch(
        `/v1/activities/${activityId}/schedule`,
        { method: "PATCH", body: JSON.stringify({ deadlineAt: null }) },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The schedule could not be updated.",
        );
      }
      await load();
    } catch (error) {
      setExtendError(
        error instanceof Error
          ? error.message
          : "The schedule could not be updated.",
      );
    } finally {
      setExtending(false);
    }
  }

  // Independent of the deadline — takes effect immediately even if no
  // deadline is set at all. The only way to undo it is Extend/Reopen.
  async function lockNow() {
    setLocking(true);
    setLockError(null);
    try {
      const response = await authorizedFetch(
        `/v1/activities/${activityId}/lock`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("The activity could not be locked.");
      await load();
    } catch (error) {
      setLockError(
        error instanceof Error
          ? error.message
          : "The activity could not be locked.",
      );
    } finally {
      setLocking(false);
    }
  }

  function toggleSelected(studentId: string) {
    setSelectedResetIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
    setConfirmingBulkReset(false);
  }

  function requestBulkReset() {
    if (!confirmingBulkReset) {
      setConfirmingBulkReset(true);
      if (bulkConfirmTimeoutRef.current !== null)
        window.clearTimeout(bulkConfirmTimeoutRef.current);
      bulkConfirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingBulkReset(false);
      }, RESET_CONFIRM_WINDOW_MS);
      return;
    }
    void resetSelectedAttempts();
  }

  async function resetSelectedAttempts() {
    if (selectedResetIds.size === 0) return;
    setConfirmingBulkReset(false);
    setBulkResetting(true);
    try {
      const response = await authorizedFetch(
        `/v1/activities/${activityId}/submissions/bulk-reset`,
        {
          method: "POST",
          body: JSON.stringify({ studentIds: [...selectedResetIds] }),
        },
      );
      if (!response.ok)
        throw new Error("The selected attempts could not be reset.");
      setSelectedResetIds(new Set());
      await load();
    } catch {
      // Keep the selection so the teacher can retry the same batch.
    } finally {
      setBulkResetting(false);
    }
  }

  function requestReset(studentId: string) {
    if (confirmingResetId !== studentId) {
      setConfirmingResetId(studentId);
      if (confirmTimeoutRef.current !== null)
        window.clearTimeout(confirmTimeoutRef.current);
      confirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingResetId(null);
      }, RESET_CONFIRM_WINDOW_MS);
      return;
    }
    void resetAttempt(studentId);
  }

  async function resetAttempt(studentId: string) {
    setConfirmingResetId(null);
    setResettingId(studentId);
    try {
      const response = await authorizedFetch(
        `/v1/activities/${activityId}/submissions/${studentId}/reset`,
        { method: "POST" },
      );
      if (!response.ok) throw new Error("The attempt could not be reset.");
      await load();
    } catch {
      // The submissions list still shows the pre-reset state on failure —
      // no separate error banner, the button just stops spinning and the
      // teacher can try again.
    } finally {
      setResettingId(null);
    }
  }

  const viewingSubmission =
    submissions.find(
      (submission) => submission.studentId === viewingSubmissionId,
    ) ?? null;

  if (!activity) {
    return (
      <div className="border-structural bg-surface rounded-panel flex items-center gap-3 border p-4">
        <Spinner size={16} />
        <p className="text-ink-muted text-xs">{status}</p>
      </div>
    );
  }

  const tabs: readonly { id: Tab; label: string; icon: typeof FileText }[] = [
    { id: "instructions", label: "Instructions", icon: FileText },
    {
      id: "testCases",
      label: `Test Cases · ${activity.testCases.length}`,
      icon: ListChecks,
    },
    {
      id: "submissions",
      label: `Submissions · ${submissions.length}`,
      icon: Code2,
    },
  ];

  return (
    <div className="space-y-4">
      <Link
        href={`/teacher/classes/${activity.classId}`}
        className="text-action-soft inline-block text-xs hover:underline"
      >
        ← Back to class
      </Link>

      <div className="border-structural bg-surface rounded-panel border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
              {activity.title}
            </h2>
            <p className="text-ink-muted mt-1 text-xs">
              {codeLanguageMeta[activity.language].label} · {activity.points}{" "}
              {activity.points === 1 ? "point" : "points"}
              {activity.allowRetake ? " · Retakes allowed" : " · One attempt"}
              {` · ${comparisonLabel[activity.comparisonMode]}`}
              {activity.comparisonMode === "numeric"
                ? ` (±${activity.numericTolerance})`
                : ""}
            </p>
            <p className="text-ink-muted mt-1 flex items-center gap-1.5 text-xs">
              <Clock3 aria-hidden="true" size={13} />
              {activity.deadlineAt
                ? `Deadline ${formatDate(activity.deadlineAt)}`
                : "No deadline"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-success border-success/30 bg-success/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
              <Users aria-hidden="true" size={13} />
              {activity.passedCount}/{activity.memberCount} passed
            </span>
            {activity.zeroedCount > 0 ? (
              <span className="text-danger border-danger/30 bg-danger/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs">
                <ShieldAlert aria-hidden="true" size={13} />
                {activity.zeroedCount} zeroed
              </span>
            ) : null}
            {activity.isLocked ? (
              <span className="text-danger border-danger/30 bg-danger/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <Lock aria-hidden="true" size={13} />
                Locked
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setPreviewing(true)}
              className="border-divider text-ink-muted hover:text-ink-primary rounded-control flex items-center gap-1 border px-2.5 py-1 text-[11px] font-medium"
            >
              <Eye aria-hidden="true" size={11} />
              Preview
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="border-divider text-ink-muted hover:text-ink-primary rounded-control flex items-center gap-1 border px-2.5 py-1 text-[11px] font-medium"
            >
              <Pencil aria-hidden="true" size={11} />
              Edit
            </button>
            {!activity.isLocked ? (
              <button
                type="button"
                disabled={locking}
                onClick={() => void lockNow()}
                className="border-divider text-ink-muted hover:text-danger rounded-control flex items-center gap-1 border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50"
              >
                {locking ? (
                  <Spinner size={11} />
                ) : (
                  <Lock aria-hidden="true" size={11} />
                )}
                Lock now
              </button>
            ) : null}
            <button
              type="button"
              disabled={deleting}
              onClick={requestDelete}
              className={`rounded-control flex items-center gap-1 border px-2.5 py-1 text-[11px] font-medium disabled:opacity-50 ${
                confirmingDelete
                  ? "border-danger bg-danger/10 text-danger"
                  : "border-divider text-ink-muted hover:text-danger"
              }`}
            >
              {deleting ? (
                <Spinner size={11} />
              ) : (
                <Trash2 aria-hidden="true" size={11} />
              )}
              {confirmingDelete ? "Confirm delete?" : "Delete"}
            </button>
          </div>
        </div>

        <div className="border-divider mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="text-ink-muted text-[11px]">
            {activity.isLocked ? "Reopen until" : "Extend/set deadline"}
            <input
              type="datetime-local"
              value={scheduleDeadlineAt}
              onChange={(event) => setScheduleDeadlineAt(event.target.value)}
              className="border-structural bg-canvas text-ink-primary rounded-control mt-1 block w-full border px-2.5 py-1.5 text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void extendSchedule()}
            disabled={extending}
            className="border-divider text-ink-secondary hover:bg-panel rounded-control flex min-h-9 items-center gap-1.5 border px-3 text-xs font-medium disabled:opacity-50"
          >
            {extending ? <Spinner size={12} /> : null}
            {activity.isLocked ? "Reopen activity" : "Save deadline"}
          </button>
          {activity.deadlineAt ? (
            <button
              type="button"
              onClick={() => void removeDeadline()}
              disabled={extending}
              className="text-action-soft text-xs hover:underline disabled:opacity-50"
            >
              Remove deadline
            </button>
          ) : null}
        </div>
        {extendError ? (
          <p className="text-danger mt-2 text-xs">{extendError}</p>
        ) : null}
        {lockError ? (
          <p className="text-danger mt-2 text-xs">{lockError}</p>
        ) : null}
      </div>

      <div className="border-structural bg-surface rounded-panel overflow-hidden border">
        <div className="border-divider flex overflow-x-auto border-b px-2">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex shrink-0 items-center gap-1.5 px-3 py-2.5 text-xs font-medium whitespace-nowrap ${
                tab === id
                  ? "text-action-soft border-action border-b-2"
                  : "text-ink-muted hover:text-ink-secondary"
              }`}
            >
              <Icon aria-hidden="true" size={14} />
              {label}
            </button>
          ))}
        </div>

        <div className="p-4">
          {tab === "instructions" ? (
            <FormattedInstructions
              text={activity.instructions}
              className="text-ink-secondary space-y-2 text-sm leading-6"
            />
          ) : tab === "testCases" ? (
            <ul className="space-y-2">
              {activity.testCases.map((testCase, index) => (
                <li
                  key={testCase.id}
                  className="border-divider bg-panel rounded-control grid grid-cols-2 gap-3 border p-2.5"
                >
                  <div>
                    <p className="text-ink-muted flex items-center gap-1.5 text-[10px]">
                      Test case {index + 1} — stdin
                      <span
                        className={`rounded-full px-1.5 py-0.5 ${
                          testCase.isHidden
                            ? "bg-danger/10 text-danger"
                            : testCase.showExpectedOutput
                              ? "bg-success/10 text-success"
                              : "bg-action/10 text-action-soft"
                        }`}
                      >
                        {testCase.isHidden
                          ? "Hidden"
                          : testCase.showExpectedOutput
                            ? "Sample"
                            : "Input visible"}
                      </span>
                    </p>
                    <pre className="text-ink-primary mt-1 font-mono text-[11px] whitespace-pre-wrap">
                      {testCase.stdin || "(no input)"}
                    </pre>
                  </div>
                  <div>
                    <p className="text-ink-muted text-[10px]">
                      Expected stdout
                    </p>
                    <pre className="text-ink-primary mt-1 font-mono text-[11px] whitespace-pre-wrap">
                      {testCase.expectedStdout || "(no output)"}
                    </pre>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div>
              {submissions.some((submission) =>
                isResettable(submission.status),
              ) ? (
                <div className="flex items-center justify-end gap-2 pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      const resettable = submissions
                        .filter((submission) => isResettable(submission.status))
                        .map((submission) => submission.studentId);
                      setSelectedResetIds(
                        selectedResetIds.size === resettable.length
                          ? new Set()
                          : new Set(resettable),
                      );
                      setConfirmingBulkReset(false);
                    }}
                    className="text-action-soft text-[11px]"
                  >
                    {selectedResetIds.size > 0
                      ? "Clear selection"
                      : "Select locked"}
                  </button>
                  <button
                    type="button"
                    disabled={selectedResetIds.size === 0 || bulkResetting}
                    onClick={requestBulkReset}
                    className={`rounded-control flex items-center gap-1 border px-2.5 py-1 text-[11px] font-medium disabled:opacity-40 ${
                      confirmingBulkReset
                        ? "border-action bg-action/10 text-action-soft"
                        : "border-divider text-ink-muted"
                    }`}
                  >
                    {bulkResetting ? (
                      <Spinner size={11} />
                    ) : (
                      <RotateCcw aria-hidden="true" size={11} />
                    )}
                    {confirmingBulkReset
                      ? `Confirm ${selectedResetIds.size} resets?`
                      : `Reset selected (${selectedResetIds.size})`}
                  </button>
                </div>
              ) : null}
              <ul className="divide-divider divide-y">
                {submissions.map((submission) => {
                  const badge = statusBadge[submission.status];
                  const Icon = badge.icon;
                  const canReset = isResettable(submission.status);
                  return (
                    <li key={submission.studentId} className="py-2">
                      <div className="flex items-center justify-between gap-3">
                        {canReset ? (
                          <input
                            type="checkbox"
                            checked={selectedResetIds.has(submission.studentId)}
                            onChange={() =>
                              toggleSelected(submission.studentId)
                            }
                            aria-label={`Select ${submission.studentName} for reset`}
                            className="size-3.5 shrink-0"
                          />
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setViewingSubmissionId(submission.studentId)
                          }
                          className="hover:text-action-soft flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <span className="text-ink-primary truncate text-sm">
                            {submission.studentName}
                          </span>
                        </button>
                        <span className="flex shrink-0 items-center gap-2">
                          {submission.violationCount > 0 ? (
                            <span className="text-danger border-danger/30 bg-danger/5 rounded-control flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium">
                              <ShieldAlert aria-hidden="true" size={11} />
                              {submission.violationCount}/{ACTIVITY_ALLOWED_VIOLATIONS}
                            </span>
                          ) : null}
                          {submission.integrityFlags.length > 0 ? (
                            <span
                              title="Possible integrity flags — open to review"
                              className="text-warning border-warning/30 bg-warning/5 rounded-control flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium"
                            >
                              <CircleAlert aria-hidden="true" size={11} />
                              {submission.integrityFlags.length}
                            </span>
                          ) : null}
                          {submission.score !== null ? (
                            <span className="text-ink-primary text-[11px] font-semibold tabular-nums">
                              {submission.score}/{submission.totalPoints}
                            </span>
                          ) : null}
                          <span
                            className={`rounded-control flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium ${badge.className}`}
                          >
                            <Icon aria-hidden="true" size={11} />
                            {badge.label}
                          </span>
                        </span>
                      </div>
                      {submission.submittedAt ? (
                        <p className="text-ink-muted mt-0.5 text-[10px]">
                          {submittedAtLabel(submission.status)}{" "}
                          {formatDate(submission.submittedAt)}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      {editing ? (
        <ActivityFormDialog
          classId={activity.classId}
          activity={activity}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      ) : null}

      {previewing ? (
        <ActivityPreviewModal
          activity={activity}
          onClose={() => setPreviewing(false)}
        />
      ) : null}

      {viewingSubmission ? (
        <StudentSubmissionModal
          submission={viewingSubmission}
          onClose={() => setViewingSubmissionId(null)}
          isResetting={resettingId === viewingSubmission.studentId}
          isConfirmingReset={confirmingResetId === viewingSubmission.studentId}
          onRequestReset={() => requestReset(viewingSubmission.studentId)}
        />
      ) : null}
    </div>
  );
}

function StudentSubmissionModal({
  submission,
  onClose,
  isResetting,
  isConfirmingReset,
  onRequestReset,
}: Readonly<{
  submission: ActivitySubmission;
  onClose: () => void;
  isResetting: boolean;
  isConfirmingReset: boolean;
  onRequestReset: () => void;
}>) {
  const badge = statusBadge[submission.status];
  const Icon = badge.icon;
  const canReset = isResettable(submission.status);
  const excessViolations = Math.max(
    0,
    submission.violationCount - ACTIVITY_ALLOWED_VIOLATIONS,
  );
  const deduction = violationDeductionAmount(
    submission.totalPoints,
    submission.violationCount,
    ACTIVITY_ALLOWED_VIOLATIONS,
    ACTIVITY_VIOLATION_DEDUCTION_PERCENT,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-submission-title"
      className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-end p-0 backdrop-blur-sm sm:place-items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="border-structural bg-elevated rounded-panel flex max-h-[90vh] w-full max-w-4xl flex-col border shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-divider flex items-center justify-between gap-4 border-b px-5 py-4">
          <div className="min-w-0">
            <h2
              id="student-submission-title"
              className="font-heading text-ink-primary truncate text-base font-semibold"
            >
              {submission.studentName}
            </h2>
            <p className="text-ink-muted mt-0.5 text-xs">
              {submission.submittedAt
                ? `${submittedAtLabel(submission.status)} ${formatDate(submission.submittedAt)}`
                : submission.status === "in_progress"
                  ? "In progress"
                  : "No attempt yet"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {submission.score !== null ? (
              <span className="text-ink-primary text-sm font-semibold tabular-nums">
                {submission.score}/{submission.totalPoints}
              </span>
            ) : null}
            <span
              className={`rounded-control flex items-center gap-1 border px-2.5 py-1 text-xs font-medium ${badge.className}`}
            >
              <Icon aria-hidden="true" size={13} />
              {badge.label}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-ink-muted hover:bg-elevated-high hover:text-ink-primary rounded-control grid size-8 shrink-0 place-items-center"
            >
              <X aria-hidden="true" size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          {deduction > 0 ? (
            <div className="border-warning/30 bg-warning/5 rounded-control border p-3">
              <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
                <ShieldAlert aria-hidden="true" size={13} />
                Score reduced for distractions
              </p>
              <p className="text-ink-secondary mt-1 text-[11px] leading-4">
                {submission.violationCount} distractions — {excessViolations}{" "}
                beyond the {ACTIVITY_ALLOWED_VIOLATIONS} allowed, at{" "}
                {ACTIVITY_VIOLATION_DEDUCTION_PERCENT}% of{" "}
                {submission.totalPoints} pts each = −{deduction} pts.
              </p>
            </div>
          ) : null}
          {submission.violations.length > 0 ? (
            <div>
              <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                Violations ({submission.violationCount}/
                {ACTIVITY_ALLOWED_VIOLATIONS})
              </h3>
              <ul className="border-danger/20 bg-danger/5 rounded-control space-y-1 border p-2">
                {submission.violations.map((violation) => (
                  <li
                    key={violation.id}
                    className="text-danger flex items-center justify-between text-[11px]"
                  >
                    <span>
                      {violationLabel[violation.kind] ?? violation.kind}
                    </span>
                    <span>{formatDate(violation.occurredAt)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {submission.integrityFlags.length > 0 ? (
            <div>
              <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
                Integrity flags ({submission.integrityFlags.length})
              </h3>
              <ul className="border-warning/20 bg-warning/5 rounded-control space-y-1.5 border p-2">
                {submission.integrityFlags.map((flag) => (
                  <li key={flag.id} className="text-warning text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        {integrityFlagLabel[flag.kind] ?? flag.kind}
                      </span>
                      <span>{formatDate(flag.detectedAt)}</span>
                    </div>
                    <p className="text-ink-secondary mt-0.5 leading-4">
                      {flag.message}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="text-ink-muted mt-1.5 text-[10px] leading-4">
                Advisory only — these are heuristics, not proof of cheating.
                Review the submitted code before acting on them.
              </p>
            </div>
          ) : null}

          <div>
            <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
              Submitted code
            </h3>
            {submission.sourceCode ? (
              <pre className="border-divider bg-deep text-ink-primary rounded-control max-h-[50vh] overflow-auto border p-3 font-mono text-[11px] whitespace-pre-wrap">
                {submission.sourceCode}
              </pre>
            ) : (
              <p className="text-ink-muted text-xs">
                This student hasn&apos;t submitted any code yet.
              </p>
            )}
          </div>
        </div>

        {canReset ? (
          <div className="border-divider flex justify-end border-t px-5 py-3">
            <button
              type="button"
              disabled={isResetting}
              onClick={onRequestReset}
              title="Reset this student's attempt so they can retake it"
              className={`rounded-control flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
                isConfirmingReset
                  ? "border-action bg-action/10 text-action-soft"
                  : "border-divider text-ink-muted hover:text-ink-primary"
              }`}
            >
              {isResetting ? (
                <Spinner size={12} />
              ) : (
                <RotateCcw aria-hidden="true" size={12} />
              )}
              {isConfirmingReset ? "Confirm reset?" : "Reset attempt"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
