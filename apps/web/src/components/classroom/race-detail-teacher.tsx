"use client";

import {
  RACE_ALLOWED_VIOLATIONS,
  RACE_VIOLATION_DEDUCTION_PERCENT,
  codeLanguageMeta,
  raceForTeacherSchema,
  raceSubmissionSchema,
  violationDeductionAmount,
  type RaceForTeacher,
  type RaceSubmission,
} from "@sqweb/contracts";
import {
  Check,
  CircleDashed,
  Clock3,
  Eye,
  Flag,
  ListChecks,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

import { FormattedInstructions } from "./formatted-instructions";
import { RaceFormDialog } from "./race-form-dialog";
import { RaceLeaderboard } from "./race-leaderboard";
import { RacePreviewModal } from "./race-preview-modal";

const RESET_CONFIRM_WINDOW_MS = 4000;

type Tab = "problems" | "leaderboard" | "submissions";

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

const statusBadge: Record<
  NonNullable<RaceSubmission["attemptStatus"]> | "not_started",
  { label: string; className: string; icon: typeof Check }
> = {
  submitted: {
    label: "Finished",
    className: "text-success bg-success/5 border-success/30",
    icon: Check,
  },
  in_progress: {
    label: "In progress",
    className: "text-warning bg-warning/5 border-warning/30",
    icon: CircleDashed,
  },
  timed_out: {
    label: "Timed out",
    className: "text-danger bg-danger/5 border-danger/30",
    icon: Clock3,
  },
  not_started: {
    label: "Not started",
    className: "text-ink-muted bg-panel border-divider",
    icon: CircleDashed,
  },
};

export function RaceDetailTeacher({ raceId }: Readonly<{ raceId: string }>) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const [race, setRace] = useState<RaceForTeacher | null>(null);
  const [submissions, setSubmissions] = useState<
    readonly RaceSubmission[] | null
  >(null);
  const [status, setStatus] = useState("Loading Code Racing quiz…");
  const [tab, setTab] = useState<Tab>("problems");
  const [problemIndex, setProblemIndex] = useState(0);
  const [closesAt, setClosesAt] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [confirmingResetId, setConfirmingResetId] = useState<string | null>(
    null,
  );
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [selectedResetIds, setSelectedResetIds] = useState<ReadonlySet<string>>(
    new Set(),
  );
  const [confirmingBulkReset, setConfirmingBulkReset] = useState(false);
  const [bulkResetting, setBulkResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [viewingSubmissionId, setViewingSubmissionId] = useState<string | null>(
    null,
  );
  // Keyed "studentId:problemId" — the scoped alternative to resetting a
  // student's whole attempt, for "they aced problem 1, let them redo
  // problem 2" without wiping problem 1's already-earned score.
  const [confirmingResetProblemKey, setConfirmingResetProblemKey] = useState<
    string | null
  >(null);
  const [resettingProblemKey, setResettingProblemKey] = useState<string | null>(
    null,
  );
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteConfirmTimeoutRef = useRef<number | null>(null);
  const resetProblemConfirmTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
      if (resetProblemConfirmTimeoutRef.current !== null)
        window.clearTimeout(resetProblemConfirmTimeoutRef.current);
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const [raceResponse, submissionsResponse] = await Promise.all([
        authorizedFetch(`/v1/races/${raceId}`),
        authorizedFetch(`/v1/races/${raceId}/submissions`),
      ]);
      if (!raceResponse.ok) {
        throw new Error(
          raceResponse.status === 404
            ? "This Code Racing quiz doesn't exist, or you don't have access to it."
            : "The Code Racing quiz could not be loaded.",
        );
      }
      const parsedRace = raceForTeacherSchema.parse(await raceResponse.json());
      setRace(parsedRace);
      setClosesAt((current) =>
        current === ""
          ? localDateTimeValue(new Date(parsedRace.closesAt))
          : current,
      );
      if (submissionsResponse.ok) {
        setSubmissions(
          raceSubmissionSchema.array().parse(await submissionsResponse.json()),
        );
      }
      setStatus("");
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "The Code Racing quiz could not be loaded.",
      );
    }
  }, [authorizedFetch, raceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  async function extendSchedule() {
    setExtending(true);
    setExtendError(null);
    try {
      const response = await authorizedFetch(`/v1/races/${raceId}/schedule`, {
        method: "PATCH",
        body: JSON.stringify({
          closesAt: new Date(closesAt).toISOString(),
        }),
      });
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

  function requestReset(studentId: string) {
    if (confirmingResetId !== studentId) {
      setConfirmingResetId(studentId);
      window.setTimeout(() => {
        setConfirmingResetId((current) =>
          current === studentId ? null : current,
        );
      }, RESET_CONFIRM_WINDOW_MS);
      return;
    }
    void resetStudent(studentId);
  }

  async function resetStudent(studentId: string) {
    setConfirmingResetId(null);
    setResettingId(studentId);
    setResetError(null);
    try {
      const response = await authorizedFetch(
        `/v1/races/${raceId}/submissions/${studentId}/reset`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "This student could not be reset.",
        );
      }
      await load();
    } catch (error) {
      setResetError(
        error instanceof Error
          ? error.message
          : "This student could not be reset.",
      );
    } finally {
      setResettingId(null);
    }
  }

  function requestResetProblem(studentId: string, problemId: string) {
    const key = `${studentId}:${problemId}`;
    if (confirmingResetProblemKey !== key) {
      setConfirmingResetProblemKey(key);
      if (resetProblemConfirmTimeoutRef.current !== null)
        window.clearTimeout(resetProblemConfirmTimeoutRef.current);
      resetProblemConfirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingResetProblemKey((current) =>
          current === key ? null : current,
        );
      }, RESET_CONFIRM_WINDOW_MS);
      return;
    }
    void resetProblem(studentId, problemId);
  }

  async function resetProblem(studentId: string, problemId: string) {
    const key = `${studentId}:${problemId}`;
    setConfirmingResetProblemKey(null);
    setResettingProblemKey(key);
    setResetError(null);
    try {
      const response = await authorizedFetch(
        `/v1/races/${raceId}/submissions/${studentId}/problems/${problemId}/reset`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "This problem could not be reset.",
        );
      }
      await load();
    } catch (error) {
      setResetError(
        error instanceof Error
          ? error.message
          : "This problem could not be reset.",
      );
    } finally {
      setResettingProblemKey(null);
    }
  }

  function requestBulkReset() {
    if (!confirmingBulkReset) {
      setConfirmingBulkReset(true);
      window.setTimeout(
        () => setConfirmingBulkReset(false),
        RESET_CONFIRM_WINDOW_MS,
      );
      return;
    }
    void bulkReset();
  }

  async function bulkReset() {
    if (selectedResetIds.size === 0) return;
    setConfirmingBulkReset(false);
    setBulkResetting(true);
    setResetError(null);
    try {
      const response = await authorizedFetch(
        `/v1/races/${raceId}/submissions/bulk-reset`,
        {
          method: "POST",
          body: JSON.stringify({ studentIds: [...selectedResetIds] }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ??
            "The selected students could not be reset.",
        );
      }
      setSelectedResetIds(new Set());
      await load();
    } catch (error) {
      setResetError(
        error instanceof Error
          ? error.message
          : "The selected students could not be reset.",
      );
    } finally {
      setBulkResetting(false);
    }
  }

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
    void deleteRace();
  }

  async function deleteRace() {
    if (!race) return;
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      const response = await authorizedFetch(`/v1/races/${raceId}`, {
        method: "DELETE",
      });
      if (!response.ok)
        throw new Error("The Code Racing quiz could not be deleted.");
      router.push(`/teacher/classes/${race.classId}`);
    } catch {
      setDeleting(false);
    }
  }

  if (!race) {
    return (
      <div className="border-structural bg-surface rounded-panel flex items-center gap-3 border p-4">
        <Spinner size={16} />
        <p className="text-ink-muted text-xs">{status}</p>
      </div>
    );
  }

  const currentProblem = race.problems[problemIndex] ?? null;
  const viewingSubmission =
    submissions?.find(
      (submission) => submission.studentId === viewingSubmissionId,
    ) ?? null;

  const tabs: readonly { id: Tab; label: string; icon: typeof ListChecks }[] = [
    {
      id: "problems",
      label: `Problems · ${race.problems.length}`,
      icon: ListChecks,
    },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
    {
      id: "submissions",
      label: `Submissions · ${submissions?.length ?? 0}`,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-4">
      <Link
        href={`/teacher/classes/${race.classId}`}
        className="text-action-soft inline-block text-xs hover:underline"
      >
        ← Back to class
      </Link>

      <section className="border-structural bg-surface rounded-panel border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-control border-divider bg-panel text-action-soft grid size-9 place-items-center border">
              <Flag aria-hidden="true" size={17} />
            </span>
            <div>
              <h2 className="font-heading text-ink-primary text-lg font-semibold">
                {race.title}
              </h2>
              <p className="text-ink-muted text-xs">
                {race.problems.length}{" "}
                {race.problems.length === 1 ? "problem" : "problems"} ·{" "}
                {race.totalPoints} pts · {race.durationMinutes} min ·{" "}
                {race.memberCount} students
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
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
              <Trash2 aria-hidden="true" size={11} />
              {confirmingDelete ? "Confirm delete?" : "Delete"}
            </button>
          </div>
        </div>
        <p className="text-ink-muted mt-3 text-xs">
          Opens {formatDate(race.opensAt)} · Closes {formatDate(race.closesAt)}{" "}
          ({race.availability}) · {race.submittedCount} finished
        </p>

        <div className="border-divider mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="text-ink-muted text-[11px]">
            {race.availability === "closed" ? "Reopen until" : "Extend to"}
            <input
              type="datetime-local"
              value={closesAt}
              onChange={(event) => setClosesAt(event.target.value)}
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
            {race.availability === "closed" ? "Reopen quiz" : "Extend time"}
          </button>
        </div>
        {extendError ? (
          <p className="text-danger mt-2 text-xs">{extendError}</p>
        ) : null}
      </section>

      <section className="border-structural bg-surface rounded-panel overflow-hidden border">
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
          {tab === "problems" ? (
            <div className="grid gap-3 lg:grid-cols-[220px_1fr] lg:items-start">
              <div className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
                {race.problems.map((problem, index) => (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => setProblemIndex(index)}
                    className={`rounded-control flex shrink-0 flex-col items-start gap-0.5 px-3 py-2 text-left text-xs font-medium lg:shrink ${
                      index === problemIndex
                        ? "bg-action text-white"
                        : "border-divider bg-surface text-ink-secondary hover:bg-panel border lg:border-transparent"
                    }`}
                  >
                    <span>Problem {index + 1}</span>
                    <span
                      className={`max-w-[220px] truncate text-[10px] font-normal ${
                        index === problemIndex
                          ? "text-white/80"
                          : "text-ink-muted"
                      }`}
                    >
                      {problem.title}
                    </span>
                  </button>
                ))}
              </div>
              {currentProblem ? (
                <div className="border-divider bg-panel rounded-control border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-ink-primary text-sm font-medium">
                      {currentProblem.title}
                    </p>
                    <span className="text-ink-muted shrink-0 text-[11px]">
                      {codeLanguageMeta[currentProblem.language].label} ·{" "}
                      {currentProblem.points} pts ·{" "}
                      {currentProblem.testCases.length} test cases
                    </span>
                  </div>
                  <FormattedInstructions
                    text={currentProblem.instructions}
                    className="text-ink-secondary mt-2 max-w-3xl space-y-2 text-sm leading-6"
                  />
                  {currentProblem.testCases.length > 0 ? (
                    <ul className="mt-4 grid grid-cols-1 gap-2.5 md:grid-cols-2 2xl:grid-cols-3">
                      {currentProblem.testCases.map((testCase, index) => (
                        <li
                          key={testCase.id}
                          className="border-divider bg-elevated rounded-control space-y-2 border p-2.5"
                        >
                          <p className="text-ink-muted text-[10px]">
                            Test case {index + 1}
                            {testCase.isHidden ? " · Hidden" : ""}
                          </p>
                          <div>
                            <p className="text-ink-muted text-[10px]">Stdin</p>
                            <pre className="text-ink-primary mt-0.5 font-mono text-[11px] whitespace-pre-wrap">
                              {testCase.stdin || "(no input)"}
                            </pre>
                          </div>
                          <div>
                            <p className="text-ink-muted text-[10px]">
                              Expected stdout
                            </p>
                            <pre className="text-ink-primary mt-0.5 font-mono text-[11px] whitespace-pre-wrap">
                              {testCase.expectedStdout || "(no output)"}
                            </pre>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : tab === "leaderboard" ? (
            <RaceLeaderboard raceId={raceId} />
          ) : (
            <div className="space-y-3">
              {submissions && submissions.length > 0 ? (
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedResetIds((current) =>
                        current.size === submissions.length
                          ? new Set()
                          : new Set(submissions.map((s) => s.studentId)),
                      )
                    }
                    className="text-action-soft text-[11px]"
                  >
                    {selectedResetIds.size === submissions.length
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                  <button
                    type="button"
                    disabled={selectedResetIds.size === 0 || bulkResetting}
                    onClick={requestBulkReset}
                    className={`rounded-control flex min-h-8 items-center gap-1.5 border px-3 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-50 ${
                      confirmingBulkReset
                        ? "border-danger/30 bg-danger/5 text-danger"
                        : "border-divider text-ink-secondary hover:bg-panel"
                    }`}
                  >
                    {bulkResetting ? (
                      <Spinner size={12} />
                    ) : (
                      <RotateCcw aria-hidden="true" size={12} />
                    )}
                    {confirmingBulkReset
                      ? `Confirm ${selectedResetIds.size} resets?`
                      : `Reset selected (${selectedResetIds.size})`}
                  </button>
                </div>
              ) : null}
              {resetError ? (
                <IdentityStatus tone="error">{resetError}</IdentityStatus>
              ) : null}
              {!submissions || submissions.length === 0 ? (
                <p className="text-ink-muted text-xs">
                  No students have started yet.
                </p>
              ) : (
                <ul className="divide-divider divide-y">
                  {submissions.map((submission) => {
                    const badge =
                      statusBadge[submission.attemptStatus ?? "not_started"];
                    const Icon = badge.icon;
                    const submittedCount = submission.problems.filter(
                      (p) => p.submitted,
                    ).length;
                    const resettable = submission.attemptStatus !== null;
                    return (
                      <li
                        key={submission.studentId}
                        className="flex items-center gap-3 py-3"
                      >
                        {resettable ? (
                          <input
                            type="checkbox"
                            checked={selectedResetIds.has(submission.studentId)}
                            onChange={(event) =>
                              setSelectedResetIds((current) => {
                                const next = new Set(current);
                                if (event.target.checked)
                                  next.add(submission.studentId);
                                else next.delete(submission.studentId);
                                return next;
                              })
                            }
                            aria-label={`Select ${submission.studentName} for bulk reset`}
                          />
                        ) : (
                          <span className="w-[13px]" />
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setViewingSubmissionId(submission.studentId)
                          }
                          className="hover:text-action-soft min-w-0 flex-1 text-left"
                        >
                          <p className="text-ink-primary truncate text-sm font-medium">
                            {submission.studentName}
                          </p>
                          <p className="text-ink-muted mt-0.5 text-[11px]">
                            {submittedCount}/{submission.problems.length}{" "}
                            problems · {submission.totalScore}/
                            {submission.totalPoints} pts
                          </p>
                        </button>
                        {submission.violationCount > 0 ? (
                          <span className="text-danger border-danger/30 bg-danger/5 rounded-control flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium">
                            <ShieldAlert aria-hidden="true" size={11} />
                            {submission.violationCount}/{RACE_ALLOWED_VIOLATIONS}
                          </span>
                        ) : null}
                        <span
                          className={`rounded-control flex shrink-0 items-center gap-1.5 border px-2.5 py-1 text-[11px] font-medium ${badge.className}`}
                        >
                          <Icon aria-hidden="true" size={12} />
                          {badge.label}
                        </span>
                        {resettable ? (
                          <button
                            type="button"
                            disabled={resettingId === submission.studentId}
                            onClick={() => requestReset(submission.studentId)}
                            className={`rounded-control flex min-h-8 shrink-0 items-center gap-1.5 border px-2.5 text-[11px] font-medium disabled:opacity-50 ${
                              confirmingResetId === submission.studentId
                                ? "border-danger/30 bg-danger/5 text-danger"
                                : "border-divider text-ink-secondary hover:bg-panel"
                            }`}
                          >
                            {resettingId === submission.studentId ? (
                              <Spinner size={11} />
                            ) : (
                              <RotateCcw aria-hidden="true" size={11} />
                            )}
                            {confirmingResetId === submission.studentId
                              ? "Confirm?"
                              : "Reset"}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>

      {editing ? (
        <RaceFormDialog
          classId={race.classId}
          race={race}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      ) : null}

      {previewing ? (
        <RacePreviewModal race={race} onClose={() => setPreviewing(false)} />
      ) : null}

      {viewingSubmission ? (
        <RaceSubmissionModal
          submission={viewingSubmission}
          problems={race.problems}
          onClose={() => setViewingSubmissionId(null)}
          confirmingResetProblemKey={confirmingResetProblemKey}
          resettingProblemKey={resettingProblemKey}
          resetError={resetError}
          onRequestResetProblem={requestResetProblem}
        />
      ) : null}
    </div>
  );
}

function RaceSubmissionModal({
  submission,
  problems,
  onClose,
  confirmingResetProblemKey,
  resettingProblemKey,
  resetError,
  onRequestResetProblem,
}: Readonly<{
  submission: RaceSubmission;
  problems: RaceForTeacher["problems"];
  onClose: () => void;
  confirmingResetProblemKey: string | null;
  resettingProblemKey: string | null;
  resetError: string | null;
  onRequestResetProblem: (studentId: string, problemId: string) => void;
}>) {
  const badge = statusBadge[submission.attemptStatus ?? "not_started"];
  const Icon = badge.icon;
  const resettable = submission.attemptStatus !== null;
  const excessViolations = Math.max(
    0,
    submission.violationCount - RACE_ALLOWED_VIOLATIONS,
  );
  const deduction = violationDeductionAmount(
    submission.totalPoints,
    submission.violationCount,
    RACE_ALLOWED_VIOLATIONS,
    RACE_VIOLATION_DEDUCTION_PERCENT,
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="race-submission-title"
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
              id="race-submission-title"
              className="font-heading text-ink-primary truncate text-base font-semibold"
            >
              {submission.studentName}
            </h2>
            <p className="text-ink-muted mt-0.5 text-xs">
              {submission.submittedAt
                ? `Finished ${formatDate(submission.submittedAt)}`
                : submission.startedAt
                  ? `Started ${formatDate(submission.startedAt)}`
                  : "No attempt yet"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-ink-primary text-sm font-semibold tabular-nums">
              {submission.totalScore}/{submission.totalPoints}
            </span>
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
          {resetError ? (
            <IdentityStatus tone="error">{resetError}</IdentityStatus>
          ) : null}
          {deduction > 0 ? (
            <div className="border-warning/30 bg-warning/5 rounded-control border p-3">
              <p className="text-warning flex items-center gap-1.5 text-xs font-medium">
                <ShieldAlert aria-hidden="true" size={13} />
                Score reduced for distractions
              </p>
              <p className="text-ink-secondary mt-1 text-[11px] leading-4">
                {submission.violationCount} distractions — {excessViolations}{" "}
                beyond the {RACE_ALLOWED_VIOLATIONS} allowed, at{" "}
                {RACE_VIOLATION_DEDUCTION_PERCENT}% of{" "}
                {submission.totalPoints} pts each = −{deduction} pts. Each
                problem&apos;s score below is shown before this deduction.
              </p>
            </div>
          ) : null}
          {problems.map((problem, index) => {
            const summary = submission.problems.find(
              (entry) => entry.problemId === problem.id,
            );
            const key = `${submission.studentId}:${problem.id}`;
            const confirming = confirmingResetProblemKey === key;
            const resetting = resettingProblemKey === key;
            return (
              <div key={problem.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-ink-primary text-sm font-medium">
                    Problem {index + 1}: {problem.title}
                  </h3>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="text-ink-muted text-[11px]">
                      {summary?.submitted
                        ? `Submitted · ${summary.score}/${problem.points} pts (${summary.passedTestCaseCount}/${summary.totalTestCaseCount} cases)`
                        : summary?.sourceCode
                          ? `Tested, not submitted (${summary.passedTestCaseCount}/${summary.totalTestCaseCount} cases)`
                          : "Not attempted"}
                    </span>
                    {resettable ? (
                      <button
                        type="button"
                        disabled={resetting}
                        onClick={() =>
                          onRequestResetProblem(
                            submission.studentId,
                            problem.id,
                          )
                        }
                        title="Wipe just this problem's submission — other problems' scores stay untouched, and reopens the attempt if it had already ended."
                        className={`rounded-control flex min-h-7 shrink-0 items-center gap-1 border px-2 text-[11px] font-medium disabled:opacity-50 ${
                          confirming
                            ? "border-danger/30 bg-danger/5 text-danger"
                            : "border-divider text-ink-secondary hover:bg-panel"
                        }`}
                      >
                        {resetting ? (
                          <Spinner size={10} />
                        ) : (
                          <RotateCcw aria-hidden="true" size={10} />
                        )}
                        {confirming ? "Confirm?" : "Reset this problem"}
                      </button>
                    ) : null}
                  </div>
                </div>
                {summary?.sourceCode ? (
                  <pre className="border-divider bg-deep text-ink-primary rounded-control mt-2 max-h-80 overflow-auto border p-3 font-mono text-[11px] whitespace-pre-wrap">
                    {summary.sourceCode}
                  </pre>
                ) : (
                  <p className="text-ink-muted mt-2 text-xs">
                    This student hasn&apos;t run or submitted any code for this
                    problem yet.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
