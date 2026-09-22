"use client";

import {
  QUIZ_ALLOWED_VIOLATIONS,
  QUIZ_VIOLATION_DEDUCTION_PERCENT,
  codeLanguageMeta,
  quizForTeacherSchema,
  quizSubmissionSchema,
  violationDeductionAmount,
  type QuizForTeacher,
  type QuizSubmission,
} from "@sqweb/contracts";
import {
  Check,
  CircleDashed,
  ClipboardList,
  Clock3,
  Eye,
  ListChecks,
  Pencil,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

import { CodeSnippet } from "./code-snippet";
import { FormattedInstructions } from "./formatted-instructions";
import { QuizFormDialog } from "./quiz-form-dialog";
import { QuizLeaderboard } from "./quiz-leaderboard";
import { QuizPreviewModal } from "./quiz-preview-modal";

const RESET_CONFIRM_WINDOW_MS = 4000;

type Tab = "questions" | "leaderboard" | "submissions";

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

function optionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

const submissionLabel: Record<
  QuizSubmission["status"],
  { label: string; className: string; icon: typeof Check }
> = {
  submitted: {
    label: "Submitted",
    className: "border-success/30 bg-success/5 text-success",
    icon: Check,
  },
  in_progress: {
    label: "In progress",
    className: "border-warning/30 bg-warning/5 text-warning",
    icon: CircleDashed,
  },
  timed_out: {
    label: "Timed out",
    className: "border-danger/30 bg-danger/5 text-danger",
    icon: Clock3,
  },
  not_started: {
    label: "Not started",
    className: "border-divider bg-panel text-ink-muted",
    icon: CircleDashed,
  },
};

export function QuizDetailTeacher({ quizId }: Readonly<{ quizId: string }>) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizForTeacher | null>(null);
  const [submissions, setSubmissions] = useState<readonly QuizSubmission[]>([]);
  const [status, setStatus] = useState("Loading quiz…");
  const [tab, setTab] = useState<Tab>("questions");
  const [closesAt, setClosesAt] = useState("");
  const [extending, setExtending] = useState(false);
  const [extendError, setExtendError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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
  const deleteConfirmTimeoutRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (deleteConfirmTimeoutRef.current !== null)
        window.clearTimeout(deleteConfirmTimeoutRef.current);
    },
    [],
  );

  const load = useCallback(async () => {
    try {
      const [quizResponse, submissionsResponse] = await Promise.all([
        authorizedFetch(`/v1/quizzes/${quizId}`),
        authorizedFetch(`/v1/quizzes/${quizId}/submissions`),
      ]);
      if (!quizResponse.ok) {
        throw new Error(
          quizResponse.status === 404
            ? "This quiz doesn't exist, or you don't have access to it."
            : "The quiz could not be loaded.",
        );
      }
      const parsedQuiz = quizForTeacherSchema.parse(await quizResponse.json());
      setQuiz(parsedQuiz);
      setClosesAt((current) =>
        current === ""
          ? localDateTimeValue(new Date(parsedQuiz.closesAt))
          : current,
      );
      if (submissionsResponse.ok) {
        setSubmissions(
          quizSubmissionSchema.array().parse(await submissionsResponse.json()),
        );
      }
      setStatus("");
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "The quiz could not be loaded.",
      );
    }
  }, [authorizedFetch, quizId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  async function extendSchedule() {
    setExtending(true);
    setExtendError(null);
    try {
      const response = await authorizedFetch(`/v1/quizzes/${quizId}/schedule`, {
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
    void deleteQuiz();
  }

  async function deleteQuiz() {
    if (!quiz) return;
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      const response = await authorizedFetch(`/v1/quizzes/${quizId}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("The quiz could not be deleted.");
      router.push(`/teacher/classes/${quiz.classId}`);
    } catch {
      setDeleting(false);
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
    void resetAttempt(studentId);
  }

  async function resetAttempt(studentId: string) {
    setConfirmingResetId(null);
    setResettingId(studentId);
    setResetError(null);
    try {
      const response = await authorizedFetch(
        `/v1/quizzes/${quizId}/submissions/${studentId}/reset`,
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
        `/v1/quizzes/${quizId}/submissions/bulk-reset`,
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

  if (!quiz) {
    return (
      <div className="border-structural bg-surface rounded-panel flex items-center gap-3 border p-4">
        <Spinner size={16} />
        <p className="text-ink-muted text-xs">{status}</p>
      </div>
    );
  }

  const tabs: readonly { id: Tab; label: string; icon: typeof ListChecks }[] = [
    {
      id: "questions",
      label: `Questions · ${quiz.questions.length}`,
      icon: ListChecks,
    },
    { id: "leaderboard", label: "Leaderboard", icon: Trophy },
    {
      id: "submissions",
      label: `Submissions · ${submissions.length}`,
      icon: Users,
    },
  ];

  return (
    <div className="space-y-4">
      <Link
        href={`/teacher/classes/${quiz.classId}`}
        className="text-action-soft inline-block text-xs hover:underline"
      >
        ← Back to class
      </Link>

      <section className="border-structural bg-surface rounded-panel border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="rounded-control border-divider bg-panel text-action-soft grid size-9 place-items-center border">
              <ClipboardList aria-hidden="true" size={17} />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-heading text-ink-primary text-lg font-semibold">
                  {quiz.title}
                </h2>
                <span className="text-ink-muted border-divider bg-panel rounded-full border px-1.5 py-0.5 text-[9px] font-medium tracking-[0.06em] uppercase">
                  {quiz.quizType === "code" ? "Code" : "Lecture"}
                </span>
              </div>
              <p className="text-ink-muted text-xs">
                {quiz.questions.length}{" "}
                {quiz.questions.length === 1 ? "question" : "questions"} ·{" "}
                {quiz.totalPoints} pts · {quiz.durationMinutes} min ·{" "}
                {quiz.memberCount} students
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
          Opens {formatDate(quiz.opensAt)} · Closes {formatDate(quiz.closesAt)}{" "}
          ({quiz.availability}) · {quiz.submittedCount} submitted
        </p>

        <div className="border-divider mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
          <label className="text-ink-muted text-[11px]">
            {quiz.availability === "closed" ? "Reopen until" : "Extend to"}
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
            {quiz.availability === "closed" ? "Reopen quiz" : "Extend time"}
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
          {tab === "questions" ? (
            <div className="space-y-3">
              {quiz.questions.map((question, index) => (
                <div
                  key={question.id}
                  className="border-structural bg-surface rounded-panel border p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="bg-action font-heading grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold text-white">
                        {index + 1}
                      </span>
                      <p className="text-ink-primary text-sm font-semibold">
                        {quiz.quizType === "code" && question.language
                          ? codeLanguageMeta[question.language].label
                          : "Question"}
                      </p>
                    </div>
                    <span className="text-ink-muted shrink-0 text-[11px]">
                      {question.points} pts
                    </span>
                  </div>
                  {quiz.quizType === "code" ? (
                    <>
                      <CodeSnippet
                        code={question.questionText}
                        language={
                          question.language
                            ? codeLanguageMeta[question.language].monacoId
                            : "plaintext"
                        }
                        className="border-divider bg-deep rounded-control mt-2 overflow-x-auto border p-3 font-mono text-[11px] leading-5 whitespace-pre"
                      />
                      <ul className="mt-3 space-y-1.5">
                        {(question.options ?? []).map((option, optionIndex) => {
                          const correct = option === question.correctAnswer;
                          return (
                            <li
                              key={option}
                              className={`rounded-control flex items-center gap-1.5 border p-2 ${
                                correct
                                  ? "border-success/30 bg-success/5"
                                  : "border-divider bg-panel"
                              }`}
                            >
                              <span
                                className={`grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold ${
                                  correct
                                    ? "border-success/40 text-success"
                                    : "border-divider text-ink-muted"
                                }`}
                              >
                                {optionLetter(optionIndex)}
                              </span>
                              {correct ? (
                                <Check
                                  aria-hidden="true"
                                  size={12}
                                  className="text-success shrink-0"
                                />
                              ) : (
                                <span className="size-3 shrink-0" />
                              )}
                              <CodeSnippet
                                code={option}
                                language={
                                  question.language
                                    ? codeLanguageMeta[question.language]
                                        .monacoId
                                    : "plaintext"
                                }
                                className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-5 whitespace-pre"
                              />
                            </li>
                          );
                        })}
                      </ul>
                    </>
                  ) : (
                    <>
                      <FormattedInstructions
                        text={question.questionText}
                        className="text-ink-primary mt-2 space-y-2 text-sm leading-6"
                      />
                      {question.options ? (
                        <ul className="mt-2 space-y-1">
                          {question.options.map((option, optionIndex) => (
                            <li
                              key={option}
                              className={`text-xs ${option === question.correctAnswer ? "text-success font-medium" : "text-ink-muted"}`}
                            >
                              {option === question.correctAnswer ? "✓" : "·"}{" "}
                              {optionLetter(optionIndex)}. {option}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-success mt-2 text-xs font-medium">
                          Exact answer: {question.correctAnswer}
                        </p>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>
          ) : tab === "leaderboard" ? (
            <QuizLeaderboard quizId={quizId} />
          ) : (
            <div className="space-y-3">
              {submissions.length > 0 ? (
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
              {submissions.length === 0 ? (
                <p className="text-ink-muted text-xs">
                  No students are enrolled.
                </p>
              ) : (
                <ul className="divide-divider divide-y">
                  {submissions.map((submission) => {
                    const badge = submissionLabel[submission.status];
                    const Icon = badge.icon;
                    const resettable = submission.status !== "not_started";
                    const excessViolations = Math.max(
                      0,
                      submission.violationCount - QUIZ_ALLOWED_VIOLATIONS,
                    );
                    const deduction = violationDeductionAmount(
                      submission.totalPoints,
                      submission.violationCount,
                      QUIZ_ALLOWED_VIOLATIONS,
                      QUIZ_VIOLATION_DEDUCTION_PERCENT,
                    );
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
                        <div className="min-w-0 flex-1">
                          <p className="text-ink-primary truncate text-sm font-medium">
                            {submission.studentName}
                          </p>
                          <p className="text-ink-muted mt-0.5 flex items-center gap-1 text-[10px]">
                            <Clock3 aria-hidden="true" size={11} />
                            {submission.submittedAt
                              ? `Submitted ${formatDate(submission.submittedAt)}`
                              : submission.startedAt
                                ? `Started ${formatDate(submission.startedAt)}`
                                : "No attempt"}
                          </p>
                          {deduction > 0 ? (
                            <p className="text-warning mt-0.5 text-[10px]">
                              {submission.violationCount} distractions —{" "}
                              {excessViolations} beyond the{" "}
                              {QUIZ_ALLOWED_VIOLATIONS} allowed: −{deduction}{" "}
                              pts
                            </p>
                          ) : null}
                        </div>
                        {submission.violationCount > 0 ? (
                          <span className="text-danger border-danger/30 bg-danger/5 rounded-control flex shrink-0 items-center gap-1 border px-2 py-0.5 text-[11px] font-medium">
                            <ShieldAlert aria-hidden="true" size={11} />
                            {submission.violationCount}/
                            {QUIZ_ALLOWED_VIOLATIONS}
                          </span>
                        ) : null}
                        {submission.score !== null ? (
                          <span className="text-ink-primary shrink-0 text-sm font-semibold tabular-nums">
                            {submission.score}/{submission.totalPoints}
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
        <QuizFormDialog
          classId={quiz.classId}
          quiz={quiz}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            void load();
          }}
        />
      ) : null}

      {previewing ? (
        <QuizPreviewModal quiz={quiz} onClose={() => setPreviewing(false)} />
      ) : null}
    </div>
  );
}
