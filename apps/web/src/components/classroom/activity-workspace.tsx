"use client";

import {
  ACTIVITY_ALLOWED_VIOLATIONS,
  ACTIVITY_VIOLATION_DEDUCTION_PERCENT,
  activityForStudentSchema,
  activityTestRunResponseSchema,
  activityViolationResponseSchema,
  codeLanguageMeta,
  violationDeductionAmount,
  type ActivityForStudent,
  type ActivityTestRunResult,
  type ActivityViolationKind,
} from "@sqweb/contracts";
import {
  BookOpen,
  Check,
  ChevronDown,
  CircleAlert,
  Clock3,
  Expand,
  FileCode2,
  Lock,
  Play,
  Send,
  ShieldAlert,
  SquareTerminal,
  TestTube2,
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
import { useStandaloneDisplayMode } from "@/lib/use-standalone-display-mode";

import { FormattedInstructions } from "./formatted-instructions";
import { SuccessCelebration } from "./success-celebration";

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// De-dupes a single alt-tab that fires both visibilitychange and
// fullscreenchange within the same gesture into one counted strike.
const VIOLATION_DEDUPE_WINDOW_MS = 1500;

const SUBMIT_CONFIRM_WINDOW_MS = 4000;

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

// Student-only — the run/grade loop only makes sense from the student's
// side. Teachers get a separate read-only view (ActivityDetailTeacher) that
// shows the answer key and every student's submission instead.
export function ActivityWorkspace({
  activityId,
}: Readonly<{ activityId: string }>) {
  const { authorizedFetch, executionFetch } = useAuth();
  const router = useRouter();
  const [activity, setActivity] = useState<ActivityForStudent | null>(null);
  const [status, setStatus] = useState("Loading activity…");
  const [sourceCode, setSourceCode] = useState("");
  const [grading, setGrading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [results, setResults] = useState<
    readonly ActivityTestRunResult[] | null
  >(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [passed, setPassed] = useState(false);
  const [submittedIncomplete, setSubmittedIncomplete] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [zeroed, setZeroed] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [violationCount, setViolationCount] = useState(0);
  const [warning, setWarning] = useState<string | null>(null);
  const [lockdownActive, setLockdownActive] = useState(false);
  const [lockdownError, setLockdownError] = useState<string | null>(null);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [consoleHeight, setConsoleHeight] = useState(DEFAULT_CONSOLE_HEIGHT);
  const [problemModalOpen, setProblemModalOpen] = useState(false);
  const interactive = useInteractiveRun();
  const isStandalone = useStandaloneDisplayMode();
  const intentionalExitRef = useRef(false);
  const lastViolationAtRef = useRef(0);
  const submitConfirmTimeoutRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(`/v1/activities/${activityId}`);
      if (!response.ok) {
        throw new Error(
          response.status === 404
            ? "This activity doesn't exist, or you don't have access to it."
            : "The activity could not be loaded.",
        );
      }
      const parsedResult = activityForStudentSchema.safeParse(
        await response.json(),
      );
      if (!parsedResult.success) {
        throw new Error(
          "The activity data is temporarily out of date. Refresh once the classroom services have restarted.",
        );
      }
      const parsed = parsedResult.data;
      setActivity(parsed);
      setSourceCode(
        parsed.attempt?.sourceCode ??
          parsed.starterCode ??
          codeLanguageMeta[parsed.language].template,
      );
      setPassed(parsed.attempt?.status === "passed");
      setSubmittedIncomplete(parsed.attempt?.status === "submitted_incomplete");
      setZeroed(parsed.attempt?.status === "zeroed_violation");
      setScore(parsed.attempt?.score ?? null);
      setViolationCount(parsed.attempt?.violationCount ?? 0);
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

  const terminal = passed || submittedIncomplete || zeroed;
  // Deadline/manual lock applies regardless of attempt status — even a
  // never-started or still-in-progress attempt must stop working the
  // moment the activity is locked. showWorkspace also turns on for this
  // case (not just lockdownActive/terminal) so a student who never even
  // started still sees the read-only locked workspace instead of being
  // stuck on the "Start Activity" splash forever.
  const deadlineLocked = activity?.isLocked ?? false;
  const locked =
    deadlineLocked || (terminal && (zeroed || !activity?.allowRetake));
  const showWorkspace = lockdownActive || terminal || deadlineLocked;
  const allTestsPassed =
    results !== null && results.length > 0 && results.every((r) => r.passed);
  const busy =
    grading ||
    submitting ||
    interactive.state === "connecting" ||
    interactive.state === "running";

  const exitLockdown = useCallback(() => {
    intentionalExitRef.current = true;
    if (document.fullscreenElement)
      void document.exitFullscreen().catch(() => undefined);
    setLockdownActive(false);
  }, []);

  const reportViolation = useCallback(
    (kind: ActivityViolationKind) => {
      const now = Date.now();
      if (now - lastViolationAtRef.current < VIOLATION_DEDUPE_WINDOW_MS) return;
      lastViolationAtRef.current = now;
      void (async () => {
        try {
          const response = await executionFetch(
            `/v1/activities/${activityId}/violations`,
            { method: "POST", body: JSON.stringify({ kind }) },
          );
          if (!response.ok) return;
          const result = activityViolationResponseSchema.parse(
            await response.json(),
          );
          setViolationCount(result.attempt.violationCount);
          setScore(result.attempt.score);
          const overAllowance =
            result.attempt.violationCount > ACTIVITY_ALLOWED_VIOLATIONS;
          setWarning(
            overAllowance
              ? `Strike ${result.attempt.violationCount} — each strike past ${ACTIVITY_ALLOWED_VIOLATIONS} deducts ${ACTIVITY_VIOLATION_DEDUCTION_PERCENT}% from this activity's score.`
              : `Warning ${result.attempt.violationCount}/${ACTIVITY_ALLOWED_VIOLATIONS} — strikes beyond ${ACTIVITY_ALLOWED_VIOLATIONS} will start deducting points from this activity's score.`,
          );
          window.setTimeout(() => setWarning(null), 6000);
        } catch {
          // Best-effort — a network hiccup on a violation report shouldn't
          // itself interrupt the student; the server is the source of
          // truth regardless of whether this particular report lands.
        }
      })();
    },
    [activityId, executionFetch],
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

  // Leaving fullscreen (browser back/refresh) shouldn't strand a violation
  // report in flight, and re-entering next time should always re-arm.
  useEffect(() => () => exitLockdown(), [exitLockdown]);

  useEffect(
    () => () => {
      if (submitConfirmTimeoutRef.current !== null)
        window.clearTimeout(submitConfirmTimeoutRef.current);
    },
    [],
  );

  async function startActivity() {
    setLockdownError(null);
    // iOS (Safari and every other iOS browser, Chrome included — Apple
    // requires them all to use WebKit) never implements the Fullscreen
    // API for arbitrary elements, and some browsers reject the call at
    // runtime too. Neither should block the student from starting —
    // tab/app-switch detection (visibilitychange, below) still works
    // without fullscreen, so lockdown just degrades gracefully instead.
    if (!document.documentElement.requestFullscreen) {
      setLockdownActive(true);
      return;
    }
    try {
      await document.documentElement.requestFullscreen();
    } catch {
      // Ignored — see the comment above.
    }
    setLockdownActive(true);
  }

  function exitToClass() {
    if (!activity) return;
    exitLockdown();
    router.push(`/student/classes/${activity.classId}`);
  }

  function runInteractively() {
    if (!activity || busy || locked || !sourceCode.trim()) return;
    setConsoleOpen(true);
    void interactive.run(activity.language, sourceCode);
  }

  async function runTestCases() {
    if (!activity || busy || locked) return;
    setGrading(true);
    setRunError(null);
    setConfirmingSubmit(false);
    try {
      const response = await executionFetch(
        `/v1/activities/${activityId}/test-runs`,
        { method: "POST", body: JSON.stringify({ sourceCode }) },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The test run could not be completed.",
        );
      }
      const result = activityTestRunResponseSchema.parse(await response.json());
      setResults(result.results);
      setViolationCount(result.attempt.violationCount);
      setScore(result.attempt.score);
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : "The test run could not be completed.",
      );
    } finally {
      setGrading(false);
    }
  }

  function requestSubmit() {
    if (!activity || busy || locked || !sourceCode.trim()) return;
    if (!allTestsPassed && !confirmingSubmit) {
      setConfirmingSubmit(true);
      if (submitConfirmTimeoutRef.current !== null)
        window.clearTimeout(submitConfirmTimeoutRef.current);
      submitConfirmTimeoutRef.current = window.setTimeout(() => {
        setConfirmingSubmit(false);
      }, SUBMIT_CONFIRM_WINDOW_MS);
      return;
    }
    void submitAttempt();
  }

  async function submitAttempt() {
    if (!activity) return;
    setConfirmingSubmit(false);
    setSubmitting(true);
    setRunError(null);
    try {
      const response = await executionFetch(
        `/v1/activities/${activityId}/submissions`,
        { method: "POST", body: JSON.stringify({ sourceCode }) },
      );
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(
          payload?.error?.message ?? "The activity could not be submitted.",
        );
      }
      const result = activityTestRunResponseSchema.parse(await response.json());
      setResults(result.results);
      setViolationCount(result.attempt.violationCount);
      setScore(result.attempt.score);
      setPassed(result.attempt.status === "passed");
      setSubmittedIncomplete(result.attempt.status === "submitted_incomplete");
      if (result.attempt.status === "passed") setCelebrating(true);
      if (result.attempt.status !== "in_progress") exitLockdown();
    } catch (error) {
      setRunError(
        error instanceof Error
          ? error.message
          : "The activity could not be submitted.",
      );
    } finally {
      setSubmitting(false);
    }
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

  if (!activity) {
    return (
      <div className="border-structural bg-surface rounded-panel flex items-center gap-3 border p-4">
        <Spinner size={16} />
        <p className="text-ink-muted text-xs">{status}</p>
      </div>
    );
  }

  const visibleTestCases = activity.testCases.filter(
    (testCase) => !testCase.isHidden,
  );

  const excessViolations = Math.max(
    0,
    violationCount - ACTIVITY_ALLOWED_VIOLATIONS,
  );
  const violationDeduction = violationDeductionAmount(
    activity.points,
    violationCount,
    ACTIVITY_ALLOWED_VIOLATIONS,
    ACTIVITY_VIOLATION_DEDUCTION_PERCENT,
  );

  // Shared between the always-visible left panel (desktop) and the "View
  // Problem" modal (mobile, where that panel scrolls out of view once
  // stacked above the editor) — one definition, so they can never drift.
  const problemDetails = (
    <>
      <FormattedInstructions
        text={activity.instructions}
        className="text-ink-secondary space-y-2 text-sm leading-6"
      />

      <p className="border-divider bg-panel text-ink-muted rounded-control mt-3 border p-2 text-[10px] leading-4">
        {comparisonHelp[activity.comparisonMode]}
        {activity.comparisonMode === "numeric"
          ? ` Tolerance: ±${activity.numericTolerance}.`
          : ""}
      </p>

      {visibleTestCases.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
            Visible example{visibleTestCases.length > 1 ? "s" : ""}
          </h3>
          <ul className="space-y-2">
            {visibleTestCases.map((testCase, index) => (
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
  );

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
              {activity.title}
            </h2>
            <p className="text-ink-muted mt-0.5 text-xs">
              {codeLanguageMeta[activity.language].label} · {activity.points}{" "}
              {activity.points === 1 ? "point" : "points"}
            </p>
            <p className="text-ink-muted mt-0.5 flex items-center gap-1.5 text-xs">
              <Clock3 aria-hidden="true" size={13} />
              {activity.deadlineAt
                ? `Deadline ${formatDate(activity.deadlineAt)}`
                : "No deadline"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {deadlineLocked ? (
              <span className="text-danger border-danger/30 bg-danger/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <Lock aria-hidden="true" size={13} />
                Locked
              </span>
            ) : null}
            {violationCount > 0 && !terminal ? (
              <span className="text-danger border-danger/30 bg-danger/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <ShieldAlert aria-hidden="true" size={13} />
                {violationCount}/{ACTIVITY_ALLOWED_VIOLATIONS} strikes
              </span>
            ) : null}
            {passed ? (
              <span className="text-success border-success/30 bg-success/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <Check aria-hidden="true" size={13} />
                Passed{score !== null ? ` · ${score}/${activity.points}` : ""}
              </span>
            ) : null}
            {submittedIncomplete ? (
              <span className="text-warning border-warning/30 bg-warning/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <CircleAlert aria-hidden="true" size={13} />
                Submitted (incomplete)
              </span>
            ) : null}
            {zeroed ? (
              <span className="text-danger border-danger/30 bg-danger/5 flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium">
                <X aria-hidden="true" size={13} />
                Zeroed
              </span>
            ) : null}
          </div>
        </div>
        {warning ? (
          <p className="text-warning border-warning/30 bg-warning/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <ShieldAlert aria-hidden="true" size={13} />
            {warning}
          </p>
        ) : null}
        {deadlineLocked ? (
          <p className="text-danger border-danger/30 bg-danger/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <Lock aria-hidden="true" size={13} />
            This activity is locked
            {activity.deadlineAt ? " — its deadline has passed" : ""}. Ask your
            teacher to extend the deadline or reopen it.
          </p>
        ) : null}
        {zeroed ? (
          <p className="text-danger border-danger/30 bg-danger/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <X aria-hidden="true" size={13} />
            This attempt was zeroed for leaving the activity screen too many
            times. Ask your teacher to reset it if you believe this was a
            mistake.
          </p>
        ) : null}
        {submittedIncomplete ? (
          <p className="text-warning border-warning/30 bg-warning/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <CircleAlert aria-hidden="true" size={13} />
            You submitted this without passing every test case. Your teacher can
            see that and may deduct points — ask them to reset this attempt if
            you&apos;d like another try.
          </p>
        ) : null}
        {passed && violationDeduction > 0 ? (
          <p className="text-warning border-warning/30 bg-warning/5 rounded-control mt-2 flex items-center gap-1.5 border px-3 py-1.5 text-xs">
            <ShieldAlert aria-hidden="true" size={13} />
            {violationCount} distractions — {excessViolations} beyond the{" "}
            {ACTIVITY_ALLOWED_VIOLATIONS} allowed, at{" "}
            {ACTIVITY_VIOLATION_DEDUCTION_PERCENT}% of {activity.points} pts
            each = −{violationDeduction} pts.
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 lg:h-[clamp(520px,calc(100dvh-210px),900px)] lg:grid-cols-[380px_1fr_260px]">
        {showWorkspace ? (
          <div className="border-structural bg-surface rounded-panel hidden border p-3 lg:block lg:h-full lg:overflow-y-auto">
            <h3 className="text-ink-muted mb-2 text-[11px] font-semibold tracking-[0.08em] uppercase">
              Problem
            </h3>
            {problemDetails}
          </div>
        ) : null}

        {!showWorkspace ? (
          <div className="border-structural bg-surface rounded-panel flex min-h-64 flex-col items-center justify-center gap-3 border p-8 text-center lg:col-span-3 lg:h-full">
            <span className="border-divider bg-panel text-action-soft grid size-12 place-items-center rounded-full border">
              <Expand aria-hidden="true" size={20} />
            </span>
            <div>
              <p className="text-ink-primary text-sm font-semibold">
                This activity runs in fullscreen
              </p>
              <p className="text-ink-muted mt-1 max-w-xs text-xs leading-5">
                Once started, switching tabs or leaving fullscreen counts as a
                strike. The first {ACTIVITY_ALLOWED_VIOLATIONS} are free — every
                strike after that deducts {ACTIVITY_VIOLATION_DEDUCTION_PERCENT}
                % from this activity&apos;s score. You&apos;re never locked out
                for strikes alone.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void startActivity()}
              className="rounded-control bg-action hover:bg-action/90 mt-2 flex min-h-9 items-center gap-2 px-4 text-xs font-semibold text-white"
            >
              <Expand aria-hidden="true" size={14} />
              Start Activity (Fullscreen)
            </button>
            {lockdownError ? (
              <p className="text-danger text-xs">{lockdownError}</p>
            ) : null}
          </div>
        ) : (
          <>
            <div className="border-structural bg-surface rounded-panel flex flex-col overflow-hidden border lg:h-full lg:min-h-0">
              <div className="border-divider flex shrink-0 items-center justify-between border-b px-3 py-2">
                <span className="text-ink-muted flex items-center gap-1.5 text-[11px]">
                  <FileCode2 aria-hidden="true" size={13} />
                  Main.{codeLanguageMeta[activity.language].extension}
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
                  <span
                    className={`flex items-center gap-1 text-[11px] ${
                      locked ? "text-danger font-medium" : "text-ink-muted"
                    }`}
                  >
                    {locked ? <Lock aria-hidden="true" size={11} /> : null}
                    {zeroed
                      ? "Locked — zeroed for violations"
                      : locked && passed
                        ? "Locked — already passed"
                        : locked && submittedIncomplete
                          ? "Locked — already submitted"
                          : deadlineLocked
                            ? "Locked — deadline passed"
                            : codeLanguageMeta[activity.language].label}
                  </span>
                </div>
              </div>
              <div className="h-80 lg:h-auto lg:min-h-0 lg:flex-1">
                <CodeEditor
                  value={sourceCode}
                  language={codeLanguageMeta[activity.language].monacoId}
                  onChange={locked ? () => undefined : setSourceCode}
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

              <div className="border-divider flex shrink-0 flex-col gap-2 border-t p-2">
                {confirmingSubmit ? (
                  <p className="text-warning border-warning/30 bg-warning/5 rounded-control flex items-center gap-1.5 border px-2.5 py-1.5 text-[11px]">
                    <CircleAlert aria-hidden="true" size={13} />
                    You haven&apos;t passed all test cases yet — submitting now
                    may get you deducted. Click Submit again to confirm.
                  </p>
                ) : null}
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy || locked || !sourceCode.trim()}
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
                    disabled={busy || locked}
                    onClick={() => void runTestCases()}
                    className="bg-action hover:bg-action/90 rounded-control flex min-h-9 flex-1 items-center justify-center gap-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {grading ? (
                      <Spinner size={13} />
                    ) : locked ? (
                      <Lock aria-hidden="true" size={13} />
                    ) : (
                      <TestTube2 aria-hidden="true" size={13} />
                    )}
                    Test Code
                  </button>
                  <button
                    type="button"
                    disabled={busy || locked || !sourceCode.trim()}
                    onClick={requestSubmit}
                    className={`rounded-control flex min-h-9 flex-1 items-center justify-center gap-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                      confirmingSubmit
                        ? "bg-warning hover:bg-warning/90"
                        : "bg-success hover:bg-success/90"
                    }`}
                  >
                    {submitting ? (
                      <Spinner size={13} />
                    ) : locked ? (
                      <Lock aria-hidden="true" size={13} />
                    ) : (
                      <Send aria-hidden="true" size={13} />
                    )}
                    {confirmingSubmit ? "Confirm submit?" : "Submit"}
                  </button>
                </div>
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
                {activity.testCases.map((testCase, index) => {
                  const result = results?.find(
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
                  {results
                    ? `${results.filter((result) => result.passed).length}/${results.length}`
                    : `—/${activity.testCases.length}`}
                </span>
              </div>
              {results && !results.every((result) => result.passed) ? (
                <p className="text-ink-muted mt-2 flex items-center gap-1.5 text-[11px]">
                  <CircleAlert aria-hidden="true" size={12} />
                  Fix your solution and test again — as many times as you need —
                  or submit anyway once you&apos;re ready.
                </p>
              ) : results ? (
                <p className="text-success mt-2 flex items-center gap-1.5 text-[11px]">
                  <Check aria-hidden="true" size={12} />
                  All test cases passed — click Submit to turn this in.
                </p>
              ) : null}
            </div>
          </>
        )}
      </div>

      {celebrating ? (
        <SuccessCelebration
          message={`Nice work! You earned ${activity.points}/${activity.points} points.`}
          onDone={() => setCelebrating(false)}
        />
      ) : null}

      {problemModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="activity-problem-title"
          className="bg-canvas/80 fixed inset-0 z-[70] grid place-items-center p-4 backdrop-blur-sm"
          onClick={() => setProblemModalOpen(false)}
        >
          <div
            className="border-structural bg-elevated rounded-panel max-h-[85vh] w-full max-w-2xl overflow-y-auto border shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="border-divider bg-elevated sticky top-0 flex items-center justify-between gap-4 border-b px-4 py-3">
              <h2
                id="activity-problem-title"
                className="text-ink-primary flex items-center gap-2 text-sm font-semibold"
              >
                <BookOpen aria-hidden="true" size={15} />
                Problem
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
    </div>
  );
}
