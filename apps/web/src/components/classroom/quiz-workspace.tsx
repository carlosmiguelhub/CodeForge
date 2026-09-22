"use client";

import {
  QUIZ_ALLOWED_VIOLATIONS,
  QUIZ_VIOLATION_DEDUCTION_PERCENT,
  codeLanguageMeta,
  quizAttemptSchema,
  quizForStudentSchema,
  quizSubmissionResultSchema,
  quizViolationResponseSchema,
  violationDeductionAmount,
  type QuizForStudent,
  type QuizViolationKind,
} from "@sqweb/contracts";
import {
  CheckCircle2,
  Clock3,
  Expand,
  Send,
  ShieldAlert,
  Trophy,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { useStandaloneDisplayMode } from "@/lib/use-standalone-display-mode";

import { CodeSnippet } from "./code-snippet";
import { FormattedInstructions } from "./formatted-instructions";
import { QuizLeaderboard } from "./quiz-leaderboard";
import { SuccessCelebration } from "./success-celebration";

// De-dupes a single alt-tab that fires both visibilitychange and
// fullscreenchange within the same gesture into one counted strike — same
// pattern as Activity/Race.
const VIOLATION_DEDUPE_WINDOW_MS = 1500;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function optionLetter(index: number) {
  return String.fromCharCode(65 + index);
}

function formatRemaining(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function QuizWorkspace({ quizId }: Readonly<{ quizId: string }>) {
  const { authorizedFetch } = useAuth();
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizForStudent | null>(null);
  const [answers, setAnswers] = useState<Readonly<Record<string, string>>>({});
  const [status, setStatus] = useState("Loading quiz…");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [violationCount, setViolationCount] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [lockdownActive, setLockdownActive] = useState(false);
  const [lockdownError, setLockdownError] = useState<string | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(
    null,
  );
  const isStandalone = useStandaloneDisplayMode();
  const intentionalExitRef = useRef(false);
  const lastViolationAtRef = useRef(0);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(`/v1/quizzes/${quizId}`);
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This quiz doesn't exist, or you don't have access to it."
            : "The quiz could not be loaded.",
        );
      }
      const parsed = quizForStudentSchema.parse(await response.json());
      setQuiz(parsed);
      setViolationCount(parsed.attempt?.violationCount ?? 0);
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

  useEffect(() => {
    if (quiz?.attempt?.status !== "in_progress") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [quiz?.attempt?.status]);

  const remainingMs = quiz?.attempt
    ? new Date(quiz.attempt.deadlineAt).getTime() - now
    : 0;
  const answerResults = useMemo(
    () =>
      new Map(
        quiz?.answerResults?.map((answer) => [answer.questionId, answer]),
      ),
    [quiz?.answerResults],
  );
  const quizViolationCount = quiz?.attempt?.violationCount ?? 0;
  const excessViolations = Math.max(
    0,
    quizViolationCount - QUIZ_ALLOWED_VIOLATIONS,
  );
  const quizViolationDeduction = quiz
    ? violationDeductionAmount(
        quiz.totalPoints,
        quizViolationCount,
        QUIZ_ALLOWED_VIOLATIONS,
        QUIZ_VIOLATION_DEDUCTION_PERCENT,
      )
    : 0;

  const attemptEnded =
    quiz?.attempt?.status === "submitted" ||
    quiz?.attempt?.status === "timed_out";
  const showWorkspace = lockdownActive || attemptEnded;

  const exitLockdown = useCallback(() => {
    intentionalExitRef.current = true;
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    setLockdownActive(false);
  }, []);

  function exitToClass() {
    if (!quiz) return;
    exitLockdown();
    router.push(`/student/classes/${quiz.classId}`);
  }

  const reportViolation = useCallback(
    (kind: QuizViolationKind) => {
      const eventNow = Date.now();
      if (eventNow - lastViolationAtRef.current < VIOLATION_DEDUPE_WINDOW_MS)
        return;
      lastViolationAtRef.current = eventNow;
      void (async () => {
        try {
          const response = await authorizedFetch(
            `/v1/quizzes/${quizId}/violations`,
            { method: "POST", body: JSON.stringify({ kind }) },
          );
          if (!response.ok) return;
          const result = quizViolationResponseSchema.parse(
            await response.json(),
          );
          setViolationCount(result.attempt.violationCount);
          setQuiz((current) =>
            current ? { ...current, attempt: result.attempt } : current,
          );
          if (result.attempt.status !== "in_progress") {
            // Not violation-driven anymore (violations never end the
            // attempt) — this still fires if the quiz's deadline passes
            // right as a tab-switch is reported.
            exitLockdown();
            setWarning(null);
          } else {
            const overAllowance =
              result.attempt.violationCount > QUIZ_ALLOWED_VIOLATIONS;
            setWarning(
              overAllowance
                ? `Strike ${result.attempt.violationCount} — each strike past ${QUIZ_ALLOWED_VIOLATIONS} deducts ${QUIZ_VIOLATION_DEDUCTION_PERCENT}% from your quiz score.`
                : `Warning ${result.attempt.violationCount}/${QUIZ_ALLOWED_VIOLATIONS} — strikes beyond ${QUIZ_ALLOWED_VIOLATIONS} will start deducting points from your quiz score.`,
            );
            window.setTimeout(() => setWarning(null), 6000);
          }
        } catch {
          // Best-effort — a network hiccup on a violation report shouldn't
          // itself interrupt the student; the server is the source of
          // truth regardless of whether this particular report lands.
        }
      })();
    },
    [quizId, authorizedFetch, exitLockdown],
  );

  useEffect(() => {
    if (!lockdownActive) return;
    function onVisibilityChange() {
      if (document.hidden) reportViolation("tab_switch");
    }
    function onFullscreenChange() {
      if (!document.fullscreenElement && !intentionalExitRef.current) {
        reportViolation("fullscreen_exit");
        setLockdownActive(false);
      }
      intentionalExitRef.current = false;
    }
    // Installed PWA (standalone) only — some mobile WebViews don't fire
    // visibilitychange reliably when the app is backgrounded via the home
    // button/app switcher/recent-apps gesture, so window blur is a second,
    // independent signal for the same "left the screen" event. Not added
    // outside standalone mode: on a regular desktop browser tab, blur
    // fires constantly for benign reasons and would make lockdown far
    // more trigger-happy than intended.
    function onWindowBlur() {
      reportViolation("tab_switch");
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    if (isStandalone) window.addEventListener("blur", onWindowBlur);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (isStandalone) window.removeEventListener("blur", onWindowBlur);
    };
  }, [lockdownActive, reportViolation, isStandalone]);

  useEffect(() => () => exitLockdown(), [exitLockdown]);

  async function startQuiz() {
    setLockdownError(null);
    setBusy(true);
    setStatus("");
    try {
      const response = await authorizedFetch(
        `/v1/quizzes/${quizId}/attempts/start`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The quiz could not be started.",
        );
      }
      quizAttemptSchema.parse(await response.json());
      // iOS (Safari and every other iOS browser, Chrome included — Apple
      // requires them all to use WebKit) never implements the Fullscreen
      // API for arbitrary elements, and some browsers reject the call at
      // runtime too. Neither should strand the student after their
      // attempt has already started server-side — tab/app-switch
      // detection (visibilitychange, below) still works without
      // fullscreen, so lockdown just degrades gracefully instead.
      if (document.documentElement.requestFullscreen) {
        try {
          await document.documentElement.requestFullscreen();
        } catch {
          // Ignored — see the comment above.
        }
      }
      setLockdownActive(true);
      setNow(Date.now());
      await load();
    } catch (startError) {
      setLockdownError(
        startError instanceof Error
          ? startError.message
          : "The quiz could not be started.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function submit() {
    if (!quiz?.attempt || quiz.attempt.status !== "in_progress") return;
    setBusy(true);
    setStatus("");
    try {
      const response = await authorizedFetch(
        `/v1/quizzes/${quizId}/submissions`,
        {
          method: "POST",
          body: JSON.stringify({
            answers: quiz.questions.map((question) => ({
              questionId: question.id,
              response: answers[question.id] ?? "",
            })),
          }),
        },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The quiz could not be submitted.",
        );
      }
      const submitted = quizSubmissionResultSchema.parse(await response.json());
      setQuiz((current) =>
        current
          ? {
              ...current,
              attempt: submitted.attempt,
              answerResults: submitted.answers,
            }
          : current,
      );
      // Matches Activity's "only celebrate an actual pass" rule — a quiz
      // has no pass/fail state of its own, so "perfect score" is the
      // closest equivalent. Confetti for a 2/5 reads as mocking, not
      // encouraging.
      if (submitted.attempt.score === quiz.totalPoints) {
        setCelebrationMessage(
          `Perfect score! You earned ${submitted.attempt.score ?? 0}/${quiz.totalPoints} points.`,
        );
      }
      exitLockdown();
    } catch (submitError) {
      setStatus(
        submitError instanceof Error
          ? submitError.message
          : "The quiz could not be submitted.",
      );
      await load();
    } finally {
      setBusy(false);
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

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <button
        type="button"
        onClick={exitToClass}
        className="text-action-soft text-xs hover:underline"
      >
        ← Back to class
      </button>

      <section className="border-structural bg-surface rounded-panel border p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-ink-muted text-xs">
              {quiz.durationMinutes} minutes · {quiz.totalPoints} points
            </p>
            <h2 className="font-heading text-ink-primary mt-1 text-xl font-semibold">
              {quiz.title}
            </h2>
            <p className="text-ink-muted mt-2 text-xs">
              Opens {formatDate(quiz.opensAt)} · Closes{" "}
              {formatDate(quiz.closesAt)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {violationCount > 0 && !attemptEnded ? (
              <span className="text-danger border-danger/30 bg-danger/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <ShieldAlert aria-hidden="true" size={13} />
                {violationCount}/{QUIZ_ALLOWED_VIOLATIONS} strikes
              </span>
            ) : null}
            {quiz.attempt?.status === "in_progress" ? (
              <div
                className={`rounded-control flex items-center gap-2 border px-3 py-2 font-mono text-sm font-semibold ${
                  remainingMs <= 60_000
                    ? "border-danger/30 bg-danger/5 text-danger"
                    : "border-action/30 bg-action/5 text-action-soft"
                }`}
              >
                <Clock3 aria-hidden="true" size={15} />
                {formatRemaining(remainingMs)}
              </div>
            ) : null}
          </div>
        </div>
        {warning ? (
          <p className="text-warning border-warning/30 bg-warning/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <ShieldAlert aria-hidden="true" size={13} />
            {warning}
          </p>
        ) : null}
      </section>

      {quiz.attempt?.status === "submitted" ? (
        <div className="border-structural bg-surface rounded-panel space-y-2 border p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <IdentityStatus tone="success">
              {`Submitted. Score: ${quiz.attempt.score ?? 0}/${quiz.totalPoints}`}
            </IdentityStatus>
            <button
              type="button"
              onClick={() => setLeaderboardOpen(true)}
              className="border-divider text-ink-secondary hover:bg-panel rounded-control flex min-h-8 items-center gap-1.5 border px-2.5 text-xs font-medium"
            >
              <Trophy aria-hidden="true" size={13} />
              View Leaderboard
            </button>
          </div>
          {quizViolationDeduction > 0 ? (
            <p className="text-warning border-warning/30 bg-warning/5 rounded-control flex items-center gap-1.5 border px-3 py-1.5 text-xs">
              <ShieldAlert aria-hidden="true" size={13} />
              {quizViolationCount} distractions — {excessViolations} beyond the{" "}
              {QUIZ_ALLOWED_VIOLATIONS} allowed, at{" "}
              {QUIZ_VIOLATION_DEDUCTION_PERCENT}% of {quiz.totalPoints} pts each
              = −{quizViolationDeduction} pts.
            </p>
          ) : null}
        </div>
      ) : quiz.attempt?.status === "timed_out" ? (
        <div className="border-structural bg-surface rounded-panel flex flex-wrap items-center justify-between gap-3 border p-4">
          <IdentityStatus tone="error">
            This attempt ended when its deadline passed.
          </IdentityStatus>
          <button
            type="button"
            onClick={() => setLeaderboardOpen(true)}
            className="border-divider text-ink-secondary hover:bg-panel rounded-control flex min-h-8 items-center gap-1.5 border px-2.5 text-xs font-medium"
          >
            <Trophy aria-hidden="true" size={13} />
            View Leaderboard
          </button>
        </div>
      ) : null}

      {!showWorkspace ? (
        <section className="border-structural bg-surface rounded-panel border p-6 text-center">
          <Expand
            aria-hidden="true"
            className="text-action-soft mx-auto"
            size={28}
          />
          <h3 className="text-ink-primary mt-3 font-semibold">
            This quiz runs in fullscreen
          </h3>
          <p className="text-ink-muted mx-auto mt-2 max-w-md text-xs leading-5">
            {quiz.attempt?.status === "in_progress" ? (
              <>
                Your attempt and everything you&apos;ve answered so far are
                saved — the browser just needs fullscreen re-confirmed before
                showing it again.
              </>
            ) : (
              <>
                Once started, your {quiz.durationMinutes}-minute timer cannot be
                paused, and the class close time still applies. Switching tabs
                or leaving fullscreen counts as a strike. The first{" "}
                {QUIZ_ALLOWED_VIOLATIONS} are free — every strike after that
                deducts {QUIZ_VIOLATION_DEDUCTION_PERCENT}% from your quiz
                score. You&apos;re never locked out for strikes alone.
              </>
            )}
          </p>
          {quiz.availability === "open" ? (
            <button
              type="button"
              onClick={() => void startQuiz()}
              disabled={busy}
              className="rounded-control bg-action hover:bg-action/90 mt-4 inline-flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {busy ? (
                <Spinner size={14} />
              ) : (
                <Expand aria-hidden="true" size={14} />
              )}
              {busy
                ? "Starting…"
                : quiz.attempt?.status === "in_progress"
                  ? "Resume Quiz (Fullscreen)"
                  : "Start Quiz (Fullscreen)"}
            </button>
          ) : (
            <p className="text-warning mt-4 text-xs font-medium">
              {quiz.availability === "scheduled"
                ? "This quiz has not opened yet."
                : "This quiz is closed."}
            </p>
          )}
          {lockdownError ? (
            <p className="text-danger mt-2 text-xs">{lockdownError}</p>
          ) : null}
        </section>
      ) : (
        <div className="space-y-3">
          {quiz.questions.map((question, index) => {
            const answerResult = answerResults.get(question.id);
            return (
              <fieldset
                key={question.id}
                disabled={attemptEnded || busy || remainingMs <= 0}
                className="border-structural bg-surface rounded-panel min-w-0 border p-4 disabled:opacity-80"
              >
                <legend className="sr-only">Question {index + 1}</legend>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="bg-action font-heading grid size-7 shrink-0 place-items-center rounded-full text-sm font-semibold text-white">
                      {index + 1}
                    </span>
                    <p className="text-ink-primary text-sm leading-6 font-semibold">
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
                  <CodeSnippet
                    code={question.questionText}
                    language={
                      question.language
                        ? codeLanguageMeta[question.language].monacoId
                        : "plaintext"
                    }
                    className="border-divider bg-deep rounded-control mt-2 overflow-x-auto border p-3 font-mono text-[11px] leading-5 whitespace-pre"
                  />
                ) : (
                  <FormattedInstructions
                    text={question.questionText}
                    className="text-ink-primary mt-1 space-y-2 text-sm leading-6"
                  />
                )}

                {quiz.quizType === "code" ? (
                  <div className="mt-3 space-y-2">
                    {question.options?.map((option, optionIndex) => (
                      <label
                        key={optionIndex}
                        className="border-divider bg-panel rounded-control flex items-start gap-2 border p-2"
                      >
                        <span className="border-divider bg-elevated text-ink-secondary mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold">
                          {optionLetter(optionIndex)}
                        </span>
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: event.target.value,
                            }))
                          }
                          className="mt-2"
                        />
                        <CodeSnippet
                          code={option}
                          language={
                            question.language
                              ? codeLanguageMeta[question.language].monacoId
                              : "plaintext"
                          }
                          className="min-w-0 flex-1 overflow-x-auto font-mono text-[11px] leading-5 whitespace-pre"
                        />
                      </label>
                    ))}
                  </div>
                ) : question.questionType === "mcq" ? (
                  <div className="mt-3 space-y-2">
                    {question.options?.map((option, optionIndex) => (
                      <label
                        key={option}
                        className="border-divider bg-panel rounded-control flex items-center gap-2 border px-3 py-2 text-xs"
                      >
                        <span className="border-divider bg-elevated text-ink-secondary grid size-5 shrink-0 place-items-center rounded-full border text-[10px] font-semibold">
                          {optionLetter(optionIndex)}
                        </span>
                        <input
                          type="radio"
                          name={question.id}
                          value={option}
                          checked={answers[question.id] === option}
                          onChange={(event) =>
                            setAnswers((current) => ({
                              ...current,
                              [question.id]: event.target.value,
                            }))
                          }
                        />
                        <span className="text-ink-secondary">{option}</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <input
                    type="text"
                    maxLength={10000}
                    value={answers[question.id] ?? ""}
                    onChange={(event) =>
                      setAnswers((current) => ({
                        ...current,
                        [question.id]: event.target.value,
                      }))
                    }
                    placeholder="Type your exact answer"
                    className="border-structural bg-canvas text-ink-primary rounded-control mt-3 w-full border px-3 py-2 text-sm"
                  />
                )}

                {answerResult ? (
                  <div className="mt-3">
                    <p
                      className={`flex items-center gap-1.5 text-xs font-medium ${answerResult.isCorrect ? "text-success" : "text-danger"}`}
                    >
                      {answerResult.isCorrect ? (
                        <CheckCircle2 aria-hidden="true" size={14} />
                      ) : (
                        <XCircle aria-hidden="true" size={14} />
                      )}
                      {answerResult.isCorrect ? "Correct" : "Incorrect"} ·{" "}
                      {answerResult.pointsAwarded}/{question.points} pts
                    </p>
                    {!answerResult.isCorrect ? (
                      <div className="border-success/40 bg-success/10 rounded-control mt-1.5 border p-2.5">
                        <p className="text-success flex items-center gap-1 text-[10px] font-bold tracking-[0.06em] uppercase">
                          <CheckCircle2 aria-hidden="true" size={11} />
                          Correct answer
                        </p>
                        {quiz.quizType === "code" ? (
                          <CodeSnippet
                            code={answerResult.correctAnswer}
                            language={
                              question.language
                                ? codeLanguageMeta[question.language].monacoId
                                : "plaintext"
                            }
                            className="border-divider bg-deep rounded-control mt-1.5 overflow-x-auto border p-2 font-mono text-[11px] leading-5 whitespace-pre"
                          />
                        ) : (
                          <p className="text-ink-primary bg-deep border-divider rounded-control mt-1.5 border px-2.5 py-1.5 text-xs leading-5 font-medium">
                            {answerResult.correctAnswer}
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </fieldset>
            );
          })}
        </div>
      )}

      {quiz.attempt?.status === "in_progress" ? (
        <div className="border-structural bg-surface rounded-panel flex flex-wrap items-center justify-between gap-3 border p-4">
          <p className="text-ink-muted text-xs">
            Unanswered questions receive zero points.
          </p>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="rounded-control bg-success hover:bg-success/90 flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? (
              <Spinner size={14} />
            ) : (
              <Send aria-hidden="true" size={14} />
            )}
            {busy
              ? "Submitting…"
              : remainingMs <= 0
                ? "End expired attempt"
                : "Submit quiz"}
          </button>
        </div>
      ) : null}

      {status ? <IdentityStatus tone="error">{status}</IdentityStatus> : null}

      {leaderboardOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Leaderboard"
          className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-sm"
          onClick={() => setLeaderboardOpen(false)}
        >
          <div
            className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setLeaderboardOpen(false)}
              aria-label="Close"
              className="border-structural bg-elevated text-ink-muted hover:text-ink-primary absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full border shadow"
            >
              <X aria-hidden="true" size={16} />
            </button>
            <QuizLeaderboard quizId={quizId} />
          </div>
        </div>
      ) : null}

      {celebrationMessage ? (
        <SuccessCelebration
          message={celebrationMessage}
          onDone={() => setCelebrationMessage(null)}
        />
      ) : null}
    </div>
  );
}
