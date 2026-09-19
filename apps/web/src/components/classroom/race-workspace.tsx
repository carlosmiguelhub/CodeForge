"use client";

import {
  RACE_ALLOWED_VIOLATIONS,
  RACE_VIOLATION_DEDUCTION_PERCENT,
  applyViolationDeduction,
  codeLanguageMeta,
  raceAttemptSchema,
  raceForStudentSchema,
  raceProblemRunResponseSchema,
  raceProblemSubmitResponseSchema,
  raceViolationResponseSchema,
  violationDeductionAmount,
  type ActivityTestRunResult,
  type RaceForStudent,
  type RaceViolationKind,
} from "@sqweb/contracts";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Expand,
  FileCode2,
  Flag,
  Lock,
  Play,
  Send,
  ShieldAlert,
  SquareTerminal,
  TestTube2,
  Trophy,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { CodeEditor } from "@/components/code-workbench/code-editor";
import { InteractiveConsole } from "@/components/code-workbench/interactive-console";
import { Spinner } from "@/components/ui/spinner";
import { useInteractiveRun } from "@/lib/use-interactive-run";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";
import { useStandaloneDisplayMode } from "@/lib/use-standalone-display-mode";

import { FormattedInstructions } from "./formatted-instructions";
import { RaceLeaderboard } from "./race-leaderboard";
import { SuccessCelebration } from "./success-celebration";

const VIOLATION_DEDUPE_WINDOW_MS = 1500;

const MIN_CONSOLE_HEIGHT = 120;
const MAX_CONSOLE_HEIGHT = 420;
const DEFAULT_CONSOLE_HEIGHT = 180;

const resultStatusLabel: Record<ActivityTestRunResult["status"], string> = {
  passed: "Passed",
  wrong_answer: "Wrong answer",
  compile_error: "Compile error",
  runtime_error: "Runtime error",
  time_limit_exceeded: "Time limit exceeded",
  judge_error: "Judge unavailable",
  not_run: "Not run",
};

const comparisonHelp = {
  normalized_exact:
    "Output must match the answer key. Trailing spaces, surrounding blank space, and Windows/Linux line endings are ignored.",
  token:
    "Output words and values must match in order. Spaces and line breaks between them are ignored.",
  numeric:
    "Output must contain the expected numeric values in order. Small differences within the configured tolerance are accepted.",
  suffix_exact:
    "Output must end with the answer key exactly. Anything printed before that (like an input prompt) is allowed.",
} as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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

// Student-only, structurally a merge of ActivityWorkspace's lockdown/editor/
// Tests-panel pattern with QuizWorkspace's shared countdown timer — a race
// is a single timed attempt spanning several Activity-shaped problems, so a
// problem switcher (Next/Previous) sits above the same run/submit loop.
export function RaceWorkspace({ raceId }: Readonly<{ raceId: string }>) {
  const { authorizedFetch, executionFetch } = useAuth();
  const router = useRouter();
  const [race, setRace] = useState<RaceForStudent | null>(null);
  const [status, setStatus] = useState("Loading Code Racing quiz…");
  const [problemIndex, setProblemIndex] = useState(0);
  const [sourceByProblem, setSourceByProblem] = useState<
    Readonly<Record<string, string>>
  >({});
  const [resultsByProblem, setResultsByProblem] = useState<
    Readonly<Record<string, readonly ActivityTestRunResult[]>>
  >({});
  const [starting, setStarting] = useState(false);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [lockdownActive, setLockdownActive] = useState(false);
  const [lockdownError, setLockdownError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(DEFAULT_CONSOLE_HEIGHT);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(
    null,
  );
  const interactive = useInteractiveRun();
  const isStandalone = useStandaloneDisplayMode();
  const intentionalExitRef = useRef(false);
  const lastViolationAtRef = useRef(0);
  // Problems the student has actually typed in this session. Reloads
  // (including the background poll) must never clobber that, but a
  // problem neither typed in nor ever run/submitted has nothing of the
  // student's to protect — so it keeps tracking the teacher's starter
  // code live if they edit the problem mid-race.
  const touchedProblemIdsRef = useRef<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(`/v1/races/${raceId}`);
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This Code Racing quiz doesn't exist, or you don't have access to it."
            : "The Code Racing quiz could not be loaded.",
        );
      }
      const parsed = raceForStudentSchema.parse(await response.json());
      setRace(parsed);
      setSourceByProblem((current) => {
        const next = { ...current };
        for (const problem of parsed.problems) {
          const untouched =
            !touchedProblemIdsRef.current.has(problem.id) &&
            problem.attempt?.sourceCode == null;
          if (next[problem.id] === undefined || untouched) {
            next[problem.id] =
              problem.attempt?.sourceCode ??
              problem.starterCode ??
              codeLanguageMeta[problem.language].template;
          }
        }
        return next;
      });
      setViolationCount(parsed.attempt?.violationCount ?? 0);
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

  // A student in lockdown can't tab away to manually refresh, so a
  // teacher extending the schedule mid-attempt (pushing closesAt later)
  // needs to reach the student's own countdown automatically. Scheduled
  // races poll too, so "opens in" catches an opensAt/closesAt edit as
  // well, not just an already-in-progress attempt.
  usePolling(
    () => void load(),
    DEFAULT_POLL_INTERVAL_MS,
    race?.attempt?.status === "in_progress" ||
      race?.availability === "scheduled",
  );

  useEffect(() => {
    if (
      race?.attempt?.status !== "in_progress" &&
      race?.availability !== "scheduled"
    )
      return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [race?.attempt?.status, race?.availability]);

  const remainingMs = race?.attempt
    ? new Date(race.attempt.deadlineAt).getTime() - now
    : 0;
  const attemptEnded =
    race?.attempt?.status === "submitted" ||
    race?.attempt?.status === "timed_out";
  const timeExpired =
    race?.attempt?.status === "in_progress" && remainingMs <= 0;
  const opensInMs = race ? new Date(race.opensAt).getTime() - now : 0;

  // The moment the countdown hits zero, re-fetch once so `availability`
  // flips from "scheduled" to "open" without the student needing to
  // manually refresh the page.
  const openReloadTriggeredRef = useRef(false);
  useEffect(() => {
    if (race?.availability !== "scheduled") {
      openReloadTriggeredRef.current = false;
      return;
    }
    if (opensInMs > 0 || openReloadTriggeredRef.current) return;
    openReloadTriggeredRef.current = true;
    void load();
  }, [race?.availability, opensInMs, load]);

  const exitLockdown = useCallback(() => {
    intentionalExitRef.current = true;
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    setLockdownActive(false);
  }, []);

  const reportViolation = useCallback(
    (kind: RaceViolationKind) => {
      const eventNow = Date.now();
      if (eventNow - lastViolationAtRef.current < VIOLATION_DEDUPE_WINDOW_MS)
        return;
      lastViolationAtRef.current = eventNow;
      void (async () => {
        try {
          const response = await executionFetch(
            `/v1/races/${raceId}/violations`,
            { method: "POST", body: JSON.stringify({ kind }) },
          );
          if (!response.ok) return;
          const result = raceViolationResponseSchema.parse(
            await response.json(),
          );
          setViolationCount(result.attempt.violationCount);
          setRace((current) =>
            current ? { ...current, attempt: result.attempt } : current,
          );
          if (result.attempt.status !== "in_progress") {
            // Not violation-driven anymore (violations never end the
            // attempt) — this still fires if the race's deadline passes
            // right as a tab-switch is reported.
            exitLockdown();
            setWarning(null);
          } else {
            const overAllowance =
              result.attempt.violationCount > RACE_ALLOWED_VIOLATIONS;
            setWarning(
              overAllowance
                ? `Strike ${result.attempt.violationCount} — each strike past ${RACE_ALLOWED_VIOLATIONS} deducts ${RACE_VIOLATION_DEDUCTION_PERCENT}% from your race score.`
                : `Warning ${result.attempt.violationCount}/${RACE_ALLOWED_VIOLATIONS} — strikes beyond ${RACE_ALLOWED_VIOLATIONS} will start deducting points from your race score.`,
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
    [raceId, executionFetch, exitLockdown],
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
    // button/app switcher/recent-apps gesture (a known iOS standalone-PWA
    // quirk), so window blur is a second, independent signal for the same
    // "left the screen" event. Not added outside standalone mode: on a
    // regular desktop browser tab, blur fires constantly for completely
    // benign reasons (alt-tab, clicking a second monitor) and would make
    // lockdown far more trigger-happy than intended.
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

  // Safety net for attempts that reach "every problem submitted" without
  // the attempt itself ending — normally the backend auto-finishes on the
  // last submitProblem, but this also self-heals any attempt that got
  // stuck in_progress before that existed (or from any other edge case),
  // the next time this page loads. Without it, a student who's submitted
  // everything gets stuck behind the "re-enter fullscreen to resume" gate
  // with no way to reach a read-only view, and leaving fullscreen there
  // would count as a fresh strike despite having nothing left to do.
  const autoFinishedAttemptIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!race?.attempt || race.attempt.status !== "in_progress") return;
    const submitted = race.problems.filter(
      (problem) => problem.attempt?.submitted,
    ).length;
    if (submitted < race.problems.length) return;
    if (autoFinishedAttemptIdRef.current === race.attempt.id) return;
    autoFinishedAttemptIdRef.current = race.attempt.id;
    void (async () => {
      try {
        await executionFetch(`/v1/races/${raceId}/finish`, {
          method: "POST",
        });
      } finally {
        await load();
      }
    })();
  }, [race?.attempt, race?.problems, raceId, executionFetch, load]);

  async function startRace() {
    setLockdownError(null);
    setStarting(true);
    try {
      const response = await executionFetch(
        `/v1/races/${raceId}/attempts/start`,
        { method: "POST" },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ??
            "The Code Racing quiz could not be started.",
        );
      }
      raceAttemptSchema.parse(await response.json());
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
          : "The Code Racing quiz could not be started.",
      );
    } finally {
      setStarting(false);
    }
  }

  function exitToClass() {
    if (!race) return;
    exitLockdown();
    router.push(`/student/classes/${race.classId}`);
  }

  const currentProblem = race?.problems[problemIndex] ?? null;
  const currentSource = currentProblem
    ? (sourceByProblem[currentProblem.id] ?? "")
    : "";
  const currentResults = currentProblem
    ? (resultsByProblem[currentProblem.id] ?? null)
    : null;
  const currentLocked =
    Boolean(currentProblem?.attempt?.submitted) || attemptEnded || timeExpired;
  const busy =
    starting ||
    running ||
    submitting ||
    finishing ||
    interactive.state === "connecting" ||
    interactive.state === "running";

  function runInteractively() {
    if (!currentProblem || busy || currentLocked || !currentSource.trim())
      return;
    setConsoleOpen(true);
    void interactive.run(currentProblem.language, currentSource);
  }

  function beginConsoleResize(event: PointerEvent<HTMLDivElement>) {
    const startY = event.clientY;
    const startHeight = consoleHeight;
    const move = (moveEvent: globalThis.PointerEvent) =>
      setConsoleHeight(
        Math.min(
          MAX_CONSOLE_HEIGHT,
          Math.max(
            MIN_CONSOLE_HEIGHT,
            startHeight - (moveEvent.clientY - startY),
          ),
        ),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function resizeConsoleByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      setConsoleHeight((value) =>
        Math.min(
          MAX_CONSOLE_HEIGHT,
          Math.max(
            MIN_CONSOLE_HEIGHT,
            value + (event.key === "ArrowUp" ? 16 : -16),
          ),
        ),
      );
    }
  }

  function setCurrentSource(value: string) {
    if (!currentProblem) return;
    touchedProblemIdsRef.current.add(currentProblem.id);
    setSourceByProblem((current) => ({
      ...current,
      [currentProblem.id]: value,
    }));
  }

  async function runProblem() {
    if (!currentProblem || busy || currentLocked) return;
    setRunning(true);
    setRunError(null);
    try {
      const response = await executionFetch(
        `/v1/races/${raceId}/problems/${currentProblem.id}/test-runs`,
        { method: "POST", body: JSON.stringify({ sourceCode: currentSource }) },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The test run could not be completed.",
        );
      }
      const result = raceProblemRunResponseSchema.parse(await response.json());
      setResultsByProblem((current) => ({
        ...current,
        [currentProblem.id]: result.results,
      }));
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : "The test run could not be completed.",
      );
    } finally {
      setRunning(false);
    }
  }

  async function submitProblem() {
    if (!currentProblem || busy || currentLocked || !currentSource.trim())
      return;
    setSubmitting(true);
    setRunError(null);
    try {
      const response = await executionFetch(
        `/v1/races/${raceId}/problems/${currentProblem.id}/submissions`,
        { method: "POST", body: JSON.stringify({ sourceCode: currentSource }) },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The problem could not be submitted.",
        );
      }
      const result = raceProblemSubmitResponseSchema.parse(
        await response.json(),
      );
      setResultsByProblem((current) => ({
        ...current,
        [currentProblem.id]: result.results,
      }));
      if (result.passed) {
        setCelebrationMessage(
          `Nice work! You earned ${result.score}/${currentProblem.points} points.`,
        );
      }
      await load();
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : "The problem could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function finishRace() {
    if (!race?.attempt || race.attempt.status !== "in_progress" || busy) return;
    setFinishing(true);
    try {
      const response = await executionFetch(`/v1/races/${raceId}/finish`, {
        method: "POST",
      });
      if (response.ok) exitLockdown();
      await load();
    } finally {
      setFinishing(false);
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

  const submittedCount = race.problems.filter(
    (problem) => problem.attempt?.submitted,
  ).length;
  const rawScore = race.problems.reduce(
    (total, problem) => total + (problem.attempt?.score ?? 0),
    0,
  );
  const totalScore = applyViolationDeduction(
    rawScore,
    race.totalPoints,
    race.attempt?.violationCount ?? 0,
    RACE_ALLOWED_VIOLATIONS,
    RACE_VIOLATION_DEDUCTION_PERCENT,
  );
  const excessViolations = Math.max(
    0,
    (race.attempt?.violationCount ?? 0) - RACE_ALLOWED_VIOLATIONS,
  );
  const violationDeduction = violationDeductionAmount(
    race.totalPoints,
    race.attempt?.violationCount ?? 0,
    RACE_ALLOWED_VIOLATIONS,
    RACE_VIOLATION_DEDUCTION_PERCENT,
  );
  const showWorkspace = lockdownActive || attemptEnded;

  // Shared between the always-visible left panel (desktop) and the "View
  // Problem" modal (mobile, where that panel scrolls out of view once
  // stacked above the editor) — one definition, so they can never drift.
  const problemDetails = currentProblem ? (
    <>
      <FormattedInstructions
        text={currentProblem.instructions}
        className="text-ink-secondary mt-2 space-y-2 text-sm leading-6"
      />

      <p className="border-divider bg-panel text-ink-muted rounded-control mt-3 border p-2 text-[10px] leading-4">
        {comparisonHelp[currentProblem.comparisonMode]}
        {currentProblem.comparisonMode === "numeric"
          ? ` Tolerance: ±${currentProblem.numericTolerance}.`
          : ""}
      </p>

      {currentProblem.testCases.filter((tc) => !tc.isHidden).length > 0 ? (
        <div className="mt-4">
          <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
            Visible examples
          </h3>
          <ul className="space-y-2">
            {currentProblem.testCases
              .filter((testCase) => !testCase.isHidden)
              .map((testCase, index) => (
                <li
                  key={testCase.id}
                  className="border-divider bg-panel rounded-control border p-2"
                >
                  <p className="text-ink-muted text-[10px]">
                    Example {index + 1} — input
                  </p>
                  <pre className="text-ink-primary mt-1 font-mono text-[11px] whitespace-pre-wrap">
                    {testCase.stdin || "(no input)"}
                  </pre>
                  {testCase.expectedStdout !== null ? (
                    <>
                      <p className="text-ink-muted mt-2 text-[10px]">
                        Expected output
                      </p>
                      <pre className="text-ink-primary mt-1 font-mono text-[11px] whitespace-pre-wrap">
                        {testCase.expectedStdout || "(no output)"}
                      </pre>
                    </>
                  ) : null}
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </>
  ) : null;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={exitToClass}
        className="text-action-soft text-xs hover:underline"
      >
        ← Back to class
      </button>

      <div className="border-structural bg-surface rounded-panel border p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-ink-primary text-base font-semibold tracking-[-0.02em]">
              {race.title}
            </h2>
            <p className="text-ink-muted mt-0.5 text-xs">
              {race.problems.length}{" "}
              {race.problems.length === 1 ? "problem" : "problems"} ·{" "}
              {race.totalPoints} pts · {race.durationMinutes} min
            </p>
          </div>
          <div className="flex items-center gap-2">
            {violationCount > 0 && !attemptEnded ? (
              <span className="text-danger border-danger/30 bg-danger/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <ShieldAlert aria-hidden="true" size={13} />
                {violationCount}/{RACE_ALLOWED_VIOLATIONS} strikes
              </span>
            ) : null}
            {race.attempt ? (
              <span className="text-ink-primary border-divider bg-panel flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                {submittedCount}/{race.problems.length} submitted · {totalScore}
                /{race.totalPoints} pts
              </span>
            ) : null}
            {race.attempt?.status === "in_progress" ? (
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
        {race.attempt?.status === "timed_out" ? (
          <p className="text-danger border-danger/30 bg-danger/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <X aria-hidden="true" size={13} />
            This attempt ended when its deadline passed. Any unsubmitted
            problems earned no points.
          </p>
        ) : null}
        {race.attempt?.status === "submitted" ? (
          <p className="text-success border-success/30 bg-success/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <Check aria-hidden="true" size={13} />
            Race complete — final score {totalScore}/{race.totalPoints}.
          </p>
        ) : null}
        {attemptEnded && violationDeduction > 0 ? (
          <p className="text-warning border-warning/30 bg-warning/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <ShieldAlert aria-hidden="true" size={13} />
            {race.attempt?.violationCount} distractions — {excessViolations}{" "}
            beyond the {RACE_ALLOWED_VIOLATIONS} allowed, at{" "}
            {RACE_VIOLATION_DEDUCTION_PERCENT}% of {race.totalPoints} pts each
            = −{violationDeduction} pts.
          </p>
        ) : null}
      </div>

      {!showWorkspace ? (
        <div className="border-structural bg-surface rounded-panel flex min-h-64 flex-col items-center justify-center gap-3 border p-8 text-center">
          <span className="border-divider bg-panel text-action-soft grid size-12 place-items-center rounded-full border">
            <Expand aria-hidden="true" size={20} />
          </span>
          <div>
            <p className="text-ink-primary text-sm font-semibold">
              This Code Racing quiz runs in fullscreen
            </p>
            <p className="text-ink-muted mx-auto mt-1 max-w-xs text-xs leading-5">
              {race.attempt?.status === "in_progress" ? (
                <>
                  Your attempt and everything you&apos;ve written so far are
                  saved — the browser just needs fullscreen re-confirmed before
                  showing it again.
                </>
              ) : (
                <>
                  Once started, your {race.durationMinutes}-minute timer covers
                  all {race.problems.length} problems and cannot be paused.
                  Switching tabs or leaving fullscreen counts as a strike. The
                  first {RACE_ALLOWED_VIOLATIONS} are free — every strike
                  after that deducts {RACE_VIOLATION_DEDUCTION_PERCENT}% from
                  your race score. Each problem can only be submitted once,
                  so test it first.
                </>
              )}
            </p>
          </div>
          {race.availability === "open" ? (
            <button
              type="button"
              onClick={() => void startRace()}
              disabled={starting}
              className="rounded-control bg-action hover:bg-action/90 mt-2 flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white disabled:opacity-50"
            >
              {starting ? (
                <Spinner size={14} />
              ) : (
                <Expand aria-hidden="true" size={14} />
              )}
              {starting
                ? "Resuming…"
                : race.attempt?.status === "in_progress"
                  ? "Resume Code Racing (Fullscreen)"
                  : "Start Code Racing (Fullscreen)"}
            </button>
          ) : race.availability === "scheduled" ? (
            <div className="mt-2 flex flex-col items-center gap-1.5">
              <p className="text-warning text-xs font-medium">
                Opens {formatDate(race.opensAt)}
              </p>
              <div className="border-action/30 bg-action/5 text-action-soft rounded-control flex items-center gap-2 border px-3 py-2 font-mono text-sm font-semibold">
                <Clock3 aria-hidden="true" size={15} />
                {formatRemaining(opensInMs)}
              </div>
            </div>
          ) : (
            <p className="text-warning mt-2 text-xs font-medium">
              This Code Racing quiz is closed.
            </p>
          )}
          {lockdownError ? (
            <p className="text-danger text-xs">{lockdownError}</p>
          ) : null}
        </div>
      ) : currentProblem ? (
        <div className="space-y-3">
          <div className="border-structural bg-surface rounded-panel flex flex-wrap items-center justify-between gap-2 border p-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {race.problems.map((problem, index) => {
                const problemDone = problem.attempt?.submitted ?? false;
                return (
                  <button
                    key={problem.id}
                    type="button"
                    onClick={() => setProblemIndex(index)}
                    className={`rounded-control flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ${
                      index === problemIndex
                        ? "bg-action text-white"
                        : problemDone
                          ? "bg-success/10 text-success"
                          : "text-ink-muted hover:bg-panel"
                    }`}
                  >
                    {problemDone ? (
                      <Check aria-hidden="true" size={12} />
                    ) : null}
                    Problem {index + 1}
                  </button>
                );
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                disabled={problemIndex === 0}
                onClick={() => setProblemIndex((index) => index - 1)}
                aria-label="Previous problem"
                className="border-divider text-ink-secondary hover:bg-panel rounded-control flex min-h-8 items-center gap-1 border px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft aria-hidden="true" size={14} /> Previous
              </button>
              <button
                type="button"
                disabled={problemIndex === race.problems.length - 1}
                onClick={() => setProblemIndex((index) => index + 1)}
                aria-label="Next problem"
                className="border-divider text-ink-secondary hover:bg-panel rounded-control flex min-h-8 items-center gap-1 border px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next <ChevronRight aria-hidden="true" size={14} />
              </button>
              <button
                type="button"
                onClick={() => setLeaderboardOpen(true)}
                className="border-divider text-ink-secondary hover:bg-panel rounded-control ml-1 flex min-h-8 items-center gap-1.5 border px-2.5 text-xs font-medium"
              >
                <Trophy aria-hidden="true" size={13} />
                View Leaderboard
              </button>
              {!attemptEnded ? (
                <button
                  type="button"
                  onClick={() => void finishRace()}
                  disabled={busy}
                  className="border-danger/30 text-danger hover:bg-danger/5 rounded-control ml-1 flex min-h-8 items-center gap-1.5 border px-2.5 text-xs font-medium disabled:opacity-50"
                >
                  {finishing ? (
                    <Spinner size={12} />
                  ) : (
                    <Flag aria-hidden="true" size={12} />
                  )}
                  Finish race
                </button>
              ) : null}
            </div>
          </div>

          <div className="grid gap-3 lg:h-[clamp(520px,calc(100dvh-260px),900px)] lg:grid-cols-[340px_1fr_240px]">
            <div className="border-structural bg-surface rounded-panel hidden border p-3 lg:block lg:h-full lg:overflow-y-auto">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-ink-muted text-[11px] font-semibold tracking-[0.08em] uppercase">
                  Problem {problemIndex + 1}: {currentProblem.title}
                </h3>
                <span className="text-ink-muted shrink-0 text-[11px]">
                  {currentProblem.points} pts
                </span>
              </div>
              {problemDetails}
            </div>

            <div className="border-structural bg-surface rounded-panel flex flex-col overflow-hidden border lg:h-full lg:min-h-0">
              <div className="border-divider flex shrink-0 items-center justify-between border-b px-3 py-2">
                <span className="text-ink-muted flex items-center gap-1.5 text-[11px]">
                  <FileCode2 aria-hidden="true" size={13} />
                  Main.{codeLanguageMeta[currentProblem.language].extension}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setProblemModalOpen(true)}
                    className="border-divider text-ink-secondary hover:bg-panel rounded-control flex items-center gap-1 border px-2 py-1 text-[11px] font-medium lg:hidden"
                  >
                    <BookOpen aria-hidden="true" size={12} />
                    View Problem
                  </button>
                  <span className="text-ink-muted text-[11px]">
                    {currentLocked
                      ? currentProblem.attempt?.submitted
                        ? "Locked — already submitted"
                        : "Locked"
                      : codeLanguageMeta[currentProblem.language].label}
                  </span>
                </div>
              </div>
              <div className="h-80 lg:h-auto lg:min-h-0 lg:flex-1">
                <CodeEditor
                  value={currentSource}
                  language={codeLanguageMeta[currentProblem.language].monacoId}
                  onChange={currentLocked ? () => undefined : setCurrentSource}
                  fontSize={14}
                />
              </div>

              {consoleOpen ? (
                <>
                  <div
                    role="separator"
                    aria-label="Resize console"
                    aria-orientation="horizontal"
                    aria-valuemin={MIN_CONSOLE_HEIGHT}
                    aria-valuemax={MAX_CONSOLE_HEIGHT}
                    aria-valuenow={consoleHeight}
                    tabIndex={0}
                    onPointerDown={beginConsoleResize}
                    onKeyDown={resizeConsoleByKeyboard}
                    className="bg-divider hover:bg-action relative shrink-0 cursor-row-resize touch-none before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-['']"
                  />
                  <div
                    className="flex shrink-0 flex-col overflow-hidden"
                    style={{ height: consoleHeight }}
                  >
                    <div className="border-divider flex shrink-0 items-center justify-between border-b px-3 py-1.5">
                      <span className="text-ink-muted flex items-center gap-1.5 text-[11px]">
                        <SquareTerminal aria-hidden="true" size={12} />
                        Console
                      </span>
                      <button
                        type="button"
                        onClick={() => setConsoleOpen(false)}
                        aria-label="Collapse console"
                        className="text-ink-muted hover:text-ink-primary"
                      >
                        <ChevronDown aria-hidden="true" size={14} />
                      </button>
                    </div>
                    <div className="min-h-0 flex-1">
                      <InteractiveConsole
                        entries={interactive.entries}
                        state={interactive.state}
                        onSubmit={interactive.sendInput}
                        onStop={interactive.stop}
                      />
                    </div>
                  </div>
                </>
              ) : null}

              <div className="border-divider flex shrink-0 gap-2 border-t p-2">
                <button
                  type="button"
                  disabled={busy || currentLocked || !currentSource.trim()}
                  onClick={runInteractively}
                  className="border-divider text-ink-secondary hover:bg-panel rounded-control flex min-h-9 flex-1 items-center justify-center gap-1.5 border text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {interactive.state === "connecting" ||
                  interactive.state === "running" ? (
                    <Spinner size={13} />
                  ) : (
                    <Play aria-hidden="true" size={13} />
                  )}
                  Run
                </button>
                <button
                  type="button"
                  disabled={busy || currentLocked}
                  onClick={() => void runProblem()}
                  className="border-divider text-ink-secondary hover:bg-panel rounded-control flex min-h-9 flex-1 items-center justify-center gap-1.5 border text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? (
                    <Spinner size={13} />
                  ) : (
                    <TestTube2 aria-hidden="true" size={13} />
                  )}
                  Test Code
                </button>
                <button
                  type="button"
                  disabled={busy || currentLocked || !currentSource.trim()}
                  onClick={() => void submitProblem()}
                  className="bg-success hover:bg-success/90 rounded-control flex min-h-9 flex-1 items-center justify-center gap-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? (
                    <Spinner size={13} />
                  ) : currentLocked ? (
                    <Lock aria-hidden="true" size={13} />
                  ) : (
                    <Send aria-hidden="true" size={13} />
                  )}
                  {currentLocked ? "Submitted" : "Submit problem"}
                </button>
              </div>
            </div>

            <div className="border-structural bg-surface rounded-panel border p-3 lg:h-full lg:overflow-y-auto">
              <h3 className="text-ink-primary flex items-center gap-2 text-sm font-semibold">
                <TestTube2 aria-hidden="true" size={15} />
                Tests
              </h3>
              {runError ? (
                <p className="text-danger mt-2 text-xs">{runError}</p>
              ) : null}
              <ul className="mt-2 space-y-1.5">
                {currentProblem.testCases.map((testCase, index) => {
                  const result = currentResults?.find(
                    (entry) => entry.testCaseId === testCase.id,
                  );
                  return (
                    <li
                      key={testCase.id}
                      className={`rounded-control border px-2.5 py-1.5 text-xs ${
                        result === undefined
                          ? "bg-panel text-ink-muted border-transparent"
                          : result.passed
                            ? "border-success/30 bg-success/5 text-success"
                            : "border-danger/30 bg-danger/5 text-danger"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {result === undefined ? (
                          <span
                            aria-hidden="true"
                            className="border-ink-disabled size-3 shrink-0 rounded-full border-2"
                          />
                        ) : result.passed ? (
                          <Check aria-hidden="true" size={13} />
                        ) : (
                          <X aria-hidden="true" size={13} />
                        )}
                        <span>
                          {testCase.isHidden ? "Hidden test" : "Visible test"}{" "}
                          {index + 1}
                        </span>
                        {result ? (
                          <span className="ml-auto text-[10px]">
                            {resultStatusLabel[result.status]}
                          </span>
                        ) : null}
                      </div>
                      {result && !result.passed && result.message ? (
                        <p className="mt-1 pl-5 text-[10px] leading-4">
                          {result.message}
                        </p>
                      ) : null}
                      {result?.status === "wrong_answer" &&
                      !testCase.isHidden ? (
                        <p className="mt-1 pl-5 font-mono text-[10px] leading-4 whitespace-pre-wrap">
                          Received: {result.actualStdout || "(no output)"}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
              <div className="border-divider text-ink-muted mt-3 flex items-center justify-between border-t pt-3 text-xs">
                <span>Score</span>
                <span className="text-ink-primary font-semibold">
                  {currentProblem.attempt?.submitted
                    ? `${currentProblem.attempt.score}/${currentProblem.points}`
                    : currentResults
                      ? `${currentResults.filter((r) => r.passed).length}/${currentResults.length} cases`
                      : `—/${currentProblem.testCases.length} cases`}
                </span>
              </div>
              {!currentProblem.attempt?.submitted ? (
                <p className="text-ink-muted mt-2 flex items-center gap-1.5 text-[11px]">
                  <CircleAlert aria-hidden="true" size={12} />
                  Partial credit — each passing test case earns its share of the
                  points. Submitting is final for this problem, so test first.
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

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
            <RaceLeaderboard raceId={raceId} />
          </div>
        </div>
      ) : null}

      {problemModalOpen && currentProblem ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="race-problem-title"
          className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-sm"
          onClick={() => setProblemModalOpen(false)}
        >
          <div
            className="border-structural bg-elevated rounded-panel max-h-[85vh] w-full max-w-2xl overflow-y-auto border shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-divider bg-elevated sticky top-0 flex items-center justify-between gap-4 border-b px-4 py-3">
              <h2
                id="race-problem-title"
                className="text-ink-primary flex items-center gap-2 text-sm font-semibold"
              >
                <BookOpen aria-hidden="true" size={15} />
                Problem {problemIndex + 1}: {currentProblem.title}
              </h2>
              <button
                type="button"
                onClick={() => setProblemModalOpen(false)}
                aria-label="Close"
                className="text-ink-muted hover:text-ink-primary grid size-8 shrink-0 place-items-center"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <div className="p-4">{problemDetails}</div>
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
