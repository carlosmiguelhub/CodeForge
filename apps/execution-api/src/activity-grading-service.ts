import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import {
  ACTIVITY_ALLOWED_VIOLATIONS,
  ACTIVITY_VIOLATION_DEDUCTION_PERCENT,
  applyViolationDeduction,
  type ActivityComparisonMode,
  type ActivityGenerateRequest,
  type ActivityGenerateResponse,
  type ActivityIntegrityFlagKind,
  type ActivityTestRunResult,
  type ActivityTestRunResponse,
  type ActivityVerifyReferenceRequest,
  type ActivityVerifyReferenceResponse,
  type ActivityViolationKind,
  type ActivityViolationResponse,
  type CodeLanguage,
} from "@sqweb/contracts";

import {
  AiGenerationUnavailableError,
  type AiActivityGeneratorClient,
} from "./ai-activity-generator-client";
import type { CodeJudgeClient } from "./code-judge-client";
import { normalizeOutput, runTestCases } from "./code-grading";

type AttemptStatus =
  "in_progress" | "passed" | "submitted_incomplete" | "zeroed_violation";

export interface ActivityGradingRepository {
  resolveActorId(firebaseUid: string): Promise<string | null>;
  getForGrading(activityId: string): Promise<{
    id: string;
    classId: string;
    language: CodeLanguage;
    allowRetake: boolean;
    comparisonMode: ActivityComparisonMode;
    numericTolerance: number | null;
    points: number;
    deadlineAt: Date | null;
    locked: boolean;
    testCases: readonly {
      id: string;
      stdin: string;
      expectedStdout: string;
    }[];
  } | null>;
  isActiveMember(classId: string, studentId: string): Promise<boolean>;
  getOrCreateAttempt(
    activityId: string,
    studentId: string,
  ): Promise<{
    id: string;
    status: AttemptStatus;
    violationCount: number;
    submittedAt: string | null;
    sourceCode: string | null;
  }>;
  recordTestRuns(
    attemptId: string,
    runs: readonly {
      testCaseId: string;
      passed: boolean;
      actualStdout: string | null;
    }[],
  ): Promise<void>;
  markAttemptPassed(attemptId: string): Promise<void>;
  markAttemptSubmittedIncomplete(attemptId: string): Promise<void>;
  resetAttemptToInProgress(attemptId: string): Promise<void>;
  saveAttemptSourceCode(attemptId: string, sourceCode: string): Promise<void>;
  recordViolation(
    attemptId: string,
    kind: ActivityViolationKind,
  ): Promise<number>;
  zeroAttempt(attemptId: string): Promise<void>;
  recordIntegrityFlags(
    attemptId: string,
    flags: readonly {
      kind: ActivityIntegrityFlagKind;
      testCaseId: string | null;
      message: string;
    }[],
  ): Promise<void>;
}

// A terminal-but-unsuccessful attempt (submitted incomplete, or zeroed for
// violations — legacy, no attempt reaches "zeroed_violation" anymore) earns
// a concrete zero rather than a blank score — only an attempt still in
// progress has no score at all. A passed attempt's score is reduced by the
// distraction-deduction formula once violationCount exceeds the allowance.
function scoreFor(
  status: AttemptStatus,
  points: number,
  violationCount: number,
): number | null {
  if (status === "passed")
    return applyViolationDeduction(
      points,
      points,
      violationCount,
      ACTIVITY_ALLOWED_VIOLATIONS,
      ACTIVITY_VIOLATION_DEDUCTION_PERCENT,
    );
  if (status === "submitted_incomplete" || status === "zeroed_violation")
    return 0;
  return null;
}

type IntegrityFlag = {
  kind: ActivityIntegrityFlagKind;
  testCaseId: null;
  message: string;
};

// Best-effort per-language "does this source even try to read stdin"
// check — a simple substring/regex scan, not a real parser, so it can miss
// unusual read patterns. That's an accepted trade for zero parsing cost;
// callers must treat a hit as advisory, never as a verdict.
const inputConstructPatterns: Partial<Record<CodeLanguage, RegExp>> = {
  python: /\binput\s*\(/,
  java: /\b(Scanner|System\.in|BufferedReader|DataInputStream)\b/,
  cpp: /\b(cin|scanf|gets|getline)\b/,
  c: /\b(scanf|gets|fgets|getchar)\b/,
  javascript: /\b(readline|process\.stdin|prompt\s*\()/,
};

// H1 — flags a submission where at least one test case supplies non-empty
// stdin, but the source contains no recognizable input-reading construct
// for the activity's language anywhere. One flag per submission (not one
// per test case) to avoid spamming near-identical rows.
function detectInputIgnored(
  activity: {
    language: CodeLanguage;
    testCases: readonly { stdin: string }[];
  },
  sourceCode: string,
): IntegrityFlag | null {
  const pattern = inputConstructPatterns[activity.language];
  if (!pattern || pattern.test(sourceCode)) return null;
  const stdinCaseNumbers = activity.testCases
    .map((testCase, index) => ({ testCase, number: index + 1 }))
    .filter(({ testCase }) => testCase.stdin.trim() !== "")
    .map(({ number }) => number);
  if (stdinCaseNumbers.length === 0) return null;
  return {
    kind: "input_ignored",
    testCaseId: null,
    message:
      `Test case${stdinCaseNumbers.length > 1 ? "s" : ""} ${stdinCaseNumbers.join(", ")} ` +
      `provide${stdinCaseNumbers.length > 1 ? "" : "s"} input, but no recognizable ` +
      `input-reading construct for ${activity.language} was found anywhere in the ` +
      `submitted code. The program may not be using stdin at all.`,
  };
}

// H2 — purely data-driven, no source parsing: if two test cases have
// different stdin AND different expected output (proving genuine
// input-dependent behavior is required to pass both), but the student's
// actual output was identical for both, that's a strong signal the
// program isn't processing input at all (e.g. a hardcoded print).
function detectOutputInvariant(
  activity: {
    testCases: readonly { stdin: string; expectedStdout: string }[];
  },
  results: readonly ActivityTestRunResult[],
): IntegrityFlag | null {
  const suspiciousPairs: [number, number][] = [];
  for (let i = 0; i < activity.testCases.length; i++) {
    for (let j = i + 1; j < activity.testCases.length; j++) {
      const a = activity.testCases[i]!;
      const b = activity.testCases[j]!;
      const resultA = results[i];
      const resultB = results[j];
      if (
        !resultA ||
        !resultB ||
        resultA.actualStdout === null ||
        resultB.actualStdout === null
      ) {
        continue;
      }
      if (a.stdin === b.stdin || a.expectedStdout === b.expectedStdout) {
        continue;
      }
      if (
        normalizeOutput(resultA.actualStdout) ===
        normalizeOutput(resultB.actualStdout)
      ) {
        suspiciousPairs.push([i + 1, j + 1]);
      }
    }
  }
  if (suspiciousPairs.length === 0) return null;
  const pairText = suspiciousPairs.map(([a, b]) => `${a} & ${b}`).join(", ");
  return {
    kind: "output_invariant",
    testCaseId: null,
    message:
      `Test case pairs ${pairText} have different inputs and different expected ` +
      `outputs, but the submitted program produced identical output for both — it ` +
      `may not be processing input at all.`,
  };
}

export class ActivityGradingService {
  constructor(
    private readonly dependencies: {
      codeJudge: CodeJudgeClient;
      activities: ActivityGradingRepository;
      aiGenerator: AiActivityGeneratorClient;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.dependencies.now?.() ?? new Date();
  }

  private async loadContext(identity: VerifiedIdentity, activityId: string) {
    const actorId = await this.dependencies.activities.resolveActorId(
      identity.uid,
    );
    if (!actorId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    const activity =
      await this.dependencies.activities.getForGrading(activityId);
    if (!activity) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    const isMember = await this.dependencies.activities.isActiveMember(
      activity.classId,
      actorId,
    );
    if (!isMember) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    return { actorId, activity };
  }

  // A zeroed attempt is always locked; a passed or submitted-incomplete one
  // is locked only when the activity doesn't allow retakes — both testing
  // and submitting share this same gate. The deadline/manual-lock check
  // comes first and applies regardless of attempt status — even an
  // attempt that's still in_progress must stop working the moment the
  // activity is locked, not just terminal ones.
  private assertAttemptUsable(
    attempt: { status: AttemptStatus },
    activity: {
      allowRetake: boolean;
      deadlineAt: Date | null;
      locked: boolean;
    },
  ) {
    if (
      activity.locked ||
      (activity.deadlineAt !== null &&
        this.now().getTime() >= activity.deadlineAt.getTime())
    ) {
      throw new AuthorizationError(
        "ACTIVITY_ATTEMPT_LOCKED",
        "This activity is locked. Ask your teacher to reopen it.",
        409,
      );
    }
    if (attempt.status === "zeroed_violation") {
      throw new AuthorizationError(
        "ACTIVITY_ATTEMPT_LOCKED",
        "This attempt was zeroed for too many lockdown violations. Ask your teacher to reset it.",
        409,
      );
    }
    if (
      (attempt.status === "passed" ||
        attempt.status === "submitted_incomplete") &&
      !activity.allowRetake
    ) {
      throw new AuthorizationError(
        "ACTIVITY_ATTEMPT_LOCKED",
        "This activity has already been submitted and locked. Ask your teacher to reset it for a retake.",
        409,
      );
    }
  }

  // Lets a teacher check their own reference solution against a draft's
  // test cases before posting — stateless, no repository access at all
  // (nothing belonging to a specific activity is read or written), so it
  // works identically for a brand-new draft or an existing activity being
  // edited. Test cases are keyed by their array index since a draft may not
  // have persisted test-case ids yet.
  async verifyReferenceSolution(
    request: ActivityVerifyReferenceRequest,
  ): Promise<ActivityVerifyReferenceResponse> {
    const results = await runTestCases(
      this.dependencies.codeJudge,
      {
        language: request.language,
        comparisonMode: request.comparisonMode,
        numericTolerance: request.numericTolerance,
        testCases: request.testCases.map((testCase, index) => ({
          id: String(index),
          stdin: testCase.stdin,
          expectedStdout: testCase.expectedStdout,
        })),
      },
      request.referenceSolution,
    );
    return {
      passed: results.every((result) => result.passed),
      results: results.map((result, index) => ({
        index,
        passed: result.passed,
        actualStdout: result.actualStdout,
        status: result.status,
        message: result.message,
      })),
    };
  }

  // Drafts a whole activity from a short brief, then immediately grades the
  // AI's own reference solution against its own test cases (reusing
  // verifyReferenceSolution) so a self-inconsistent draft is caught before
  // the teacher ever sees it. Never persists anything — the caller decides
  // whether to keep, edit, or discard the draft.
  async generateActivity(
    request: ActivityGenerateRequest,
  ): Promise<ActivityGenerateResponse> {
    let draft;
    try {
      draft = await this.dependencies.aiGenerator.generate(request);
    } catch (error) {
      if (error instanceof AiGenerationUnavailableError) {
        throw new AuthorizationError(
          "AI_GENERATION_UNAVAILABLE",
          error.message,
          503,
        );
      }
      throw new AuthorizationError(
        "AI_GENERATION_FAILED",
        error instanceof Error
          ? `The AI generator could not produce an activity: ${error.message}`
          : "The AI generator could not produce an activity.",
        502,
      );
    }
    // suffix_exact, not normalized_exact — the AI may or may not have
    // included an input prompt in its own output (see systemPrompt's
    // guidance), and suffix matching grades either shape correctly: it's
    // a plain exact match when there's no prompt, and tolerant of one
    // when there is. Matches the default new activities are created with
    // (see activity-service.ts) so this self-check reflects what actually
    // gets graded once the teacher saves the draft unedited.
    const verification = await this.verifyReferenceSolution({
      language: request.language,
      comparisonMode: "suffix_exact",
      numericTolerance: null,
      referenceSolution: draft.referenceSolution,
      testCases: draft.testCases.map((testCase) => ({
        stdin: testCase.stdin,
        expectedStdout: testCase.expectedStdout,
      })),
    });
    return { ...draft, testCases: [...draft.testCases], verification };
  }

  // The "Test Code" action — grades against every test case so the student
  // can see what's failing, but never finalizes the attempt. Only an
  // explicit submitAttempt() call locks it in, pass or not.
  async testCode(
    identity: VerifiedIdentity,
    activityId: string,
    sourceCode: string,
  ): Promise<ActivityTestRunResponse> {
    const { actorId, activity } = await this.loadContext(identity, activityId);
    const attempt = await this.dependencies.activities.getOrCreateAttempt(
      activityId,
      actorId,
    );
    this.assertAttemptUsable(attempt, activity);

    let violationCount = attempt.violationCount;
    if (
      attempt.status === "passed" ||
      attempt.status === "submitted_incomplete"
    ) {
      await this.dependencies.activities.resetAttemptToInProgress(attempt.id);
      violationCount = 0;
    }
    await this.dependencies.activities.saveAttemptSourceCode(
      attempt.id,
      sourceCode,
    );

    const results = await runTestCases(
      this.dependencies.codeJudge,
      activity,
      sourceCode,
    );
    await this.dependencies.activities.recordTestRuns(attempt.id, results);

    return {
      passed: results.every((result) => result.passed),
      results,
      attempt: {
        status: "in_progress",
        violationCount,
        submittedAt: null,
        score: null,
        sourceCode,
      },
    };
  }

  // The "Submit" action — grades against every test case and finalizes the
  // attempt: "passed" if every case passed, otherwise
  // "submitted_incomplete" so the teacher can see the student deliberately
  // turned in unfinished work.
  async submitAttempt(
    identity: VerifiedIdentity,
    activityId: string,
    sourceCode: string,
  ): Promise<ActivityTestRunResponse> {
    const { actorId, activity } = await this.loadContext(identity, activityId);
    const attempt = await this.dependencies.activities.getOrCreateAttempt(
      activityId,
      actorId,
    );
    this.assertAttemptUsable(attempt, activity);

    let violationCount = attempt.violationCount;
    if (
      attempt.status === "passed" ||
      attempt.status === "submitted_incomplete"
    ) {
      await this.dependencies.activities.resetAttemptToInProgress(attempt.id);
      violationCount = 0;
    }
    await this.dependencies.activities.saveAttemptSourceCode(
      attempt.id,
      sourceCode,
    );

    const results = await runTestCases(
      this.dependencies.codeJudge,
      activity,
      sourceCode,
    );
    await this.dependencies.activities.recordTestRuns(attempt.id, results);

    // Advisory-only — never affects grading. Skipped entirely when nothing
    // actually executed (broken/uncompilable code gives no meaningful
    // hardcode signal and would otherwise always trip detectInputIgnored).
    const executed = results.some(
      (result) =>
        result.status !== "not_run" && result.status !== "compile_error",
    );
    if (executed) {
      const flags = [
        detectInputIgnored(activity, sourceCode),
        detectOutputInvariant(activity, results),
      ].filter((flag): flag is IntegrityFlag => flag !== null);
      if (flags.length > 0) {
        await this.dependencies.activities.recordIntegrityFlags(
          attempt.id,
          flags,
        );
      }
    }

    const passed = results.every((result) => result.passed);
    if (passed) {
      await this.dependencies.activities.markAttemptPassed(attempt.id);
    } else {
      await this.dependencies.activities.markAttemptSubmittedIncomplete(
        attempt.id,
      );
    }

    return {
      passed,
      results,
      attempt: {
        status: passed ? "passed" : "submitted_incomplete",
        violationCount,
        submittedAt: new Date().toISOString(),
        score: scoreFor(
          passed ? "passed" : "submitted_incomplete",
          activity.points,
          violationCount,
        ),
        sourceCode,
      },
    };
  }

  // Called by the student's activity page while an attempt is in progress,
  // whenever the browser detects a tab-switch or fullscreen exit. Never
  // locks or ends the attempt — it only ever records the strike; the
  // eventual score is reduced once violationCount exceeds the allowance
  // (see scoreFor). Idempotent against an already-terminal attempt — a
  // violation reported after the attempt already ended just reports the
  // current state back rather than double-counting.
  async recordViolation(
    identity: VerifiedIdentity,
    activityId: string,
    kind: ActivityViolationKind,
  ): Promise<ActivityViolationResponse> {
    const { actorId, activity } = await this.loadContext(identity, activityId);
    const attempt = await this.dependencies.activities.getOrCreateAttempt(
      activityId,
      actorId,
    );
    if (attempt.status !== "in_progress") {
      return {
        attempt: {
          status: attempt.status,
          violationCount: attempt.violationCount,
          submittedAt: attempt.submittedAt,
          score: scoreFor(
            attempt.status,
            activity.points,
            attempt.violationCount,
          ),
          sourceCode: attempt.sourceCode,
        },
      };
    }
    const violationCount = await this.dependencies.activities.recordViolation(
      attempt.id,
      kind,
    );
    return {
      attempt: {
        status: "in_progress",
        violationCount,
        submittedAt: null,
        score: null,
        sourceCode: attempt.sourceCode,
      },
    };
  }
}
