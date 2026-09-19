import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import {
  type ActivityComparisonMode,
  type ActivityTestRunResult,
  type CodeLanguage,
  type RaceProblemRunResponse,
  type RaceProblemSubmitResponse,
  type RaceViolationResponse,
} from "@sqweb/contracts";

import { runTestCases } from "./code-grading";
import type { CodeJudgeClient } from "./code-judge-client";

type RaceAttemptStatus = "in_progress" | "submitted" | "timed_out";

export interface RaceGradingRepository {
  resolveActorId(firebaseUid: string): Promise<string | null>;
  getRaceForGrading(raceId: string): Promise<{
    id: string;
    classId: string;
    durationMinutes: number;
    opensAt: Date;
    closesAt: Date;
    status: "draft" | "open" | "closed";
  } | null>;
  getProblemForGrading(
    raceId: string,
    problemId: string,
  ): Promise<{
    id: string;
    language: CodeLanguage;
    comparisonMode: ActivityComparisonMode;
    numericTolerance: number | null;
    points: number;
    testCases: readonly {
      id: string;
      stdin: string;
      expectedStdout: string;
    }[];
  } | null>;
  isActiveMember(classId: string, studentId: string): Promise<boolean>;
  getAttempt(
    raceId: string,
    studentId: string,
  ): Promise<{
    id: string;
    status: RaceAttemptStatus;
    startedAt: Date;
    submittedAt: Date | null;
    violationCount: number;
  } | null>;
  getOrCreateAttempt(
    raceId: string,
    studentId: string,
    startedAt: Date,
  ): Promise<{
    id: string;
    status: RaceAttemptStatus;
    startedAt: Date;
    submittedAt: Date | null;
    violationCount: number;
  }>;
  markAttemptTimedOut(attemptId: string): Promise<void>;
  finishAttempt(attemptId: string, submittedAt: Date): Promise<void>;
  // No per-event violation log for races (unlike Activities'
  // activity_violations table) — just a running counter, so there's
  // nothing for the repository to do with which kind occurred.
  recordViolation(attemptId: string): Promise<number>;
  getProblemSubmission(
    attemptId: string,
    problemId: string,
  ): Promise<{
    submitted: boolean;
    passedTestCaseCount: number;
    totalTestCaseCount: number;
    score: number | null;
  } | null>;
  upsertProblemRun(input: {
    attemptId: string;
    problemId: string;
    sourceCode: string;
    passedTestCaseCount: number;
    totalTestCaseCount: number;
  }): Promise<void>;
  // Returns false when the problem was already submitted for this attempt
  // — the caller (submitProblem) turns that into a 409, never silently
  // overwrites an earlier submission's score.
  submitProblem(input: {
    attemptId: string;
    problemId: string;
    sourceCode: string;
    passedTestCaseCount: number;
    totalTestCaseCount: number;
    score: number;
    submittedAt: Date;
  }): Promise<boolean>;
  countProblems(raceId: string): Promise<number>;
  countSubmittedProblems(attemptId: string): Promise<number>;
}

// Every student shares one synchronized deadline — the race's closesAt.
// A late joiner gets correspondingly less time (never a fresh full
// duration from their own startedAt), and a teacher's "Extend time"
// schedule update (which only ever moves closesAt) takes effect for
// everyone immediately, with nothing capping it back down.
// durationMinutes is purely nominal/display, not a second ceiling here.
function toAttempt(
  attempt: {
    id: string;
    status: RaceAttemptStatus;
    startedAt: Date;
    submittedAt: Date | null;
    violationCount: number;
  },
  race: { closesAt: Date },
) {
  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    deadlineAt: race.closesAt.toISOString(),
    violationCount: attempt.violationCount,
  };
}

export class RaceGradingService {
  constructor(
    private readonly dependencies: {
      codeJudge: CodeJudgeClient;
      races: RaceGradingRepository;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.dependencies.now?.() ?? new Date();
  }

  private async loadContext(identity: VerifiedIdentity, raceId: string) {
    const actorId = await this.dependencies.races.resolveActorId(identity.uid);
    if (!actorId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    const race = await this.dependencies.races.getRaceForGrading(raceId);
    if (!race) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Code Racing quiz not found.",
        404,
      );
    }
    const isMember = await this.dependencies.races.isActiveMember(
      race.classId,
      actorId,
    );
    if (!isMember) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Code Racing quiz not found.",
        404,
      );
    }
    return { actorId, race };
  }

  async startAttempt(identity: VerifiedIdentity, raceId: string) {
    const { actorId, race } = await this.loadContext(identity, raceId);
    const now = this.now();
    if (
      race.status !== "open" ||
      now.getTime() < race.opensAt.getTime() ||
      now.getTime() >= race.closesAt.getTime()
    ) {
      throw new AuthorizationError(
        "RACE_NOT_AVAILABLE",
        now.getTime() < race.opensAt.getTime()
          ? "This Code Racing quiz has not opened yet."
          : "This Code Racing quiz is closed.",
        409,
      );
    }
    const existing = await this.dependencies.races.getAttempt(raceId, actorId);
    if (existing && existing.status !== "in_progress") {
      throw new AuthorizationError(
        "RACE_ATTEMPT_LOCKED",
        "This attempt has already ended.",
        409,
      );
    }
    const attempt = await this.dependencies.races.getOrCreateAttempt(
      raceId,
      actorId,
      now,
    );
    return toAttempt(attempt, race);
  }

  // Shared by runProblem/submitProblem/finishAttempt/recordViolation — all
  // require an attempt that's already been started (startAttempt is the
  // only method that creates one), still in progress, and within its
  // deadline. Marks the attempt timed_out and reports RACE_TIME_EXPIRED
  // the moment a request arrives after the clock has run out, mirroring
  // quiz-service's submitAttempt.
  private async requireActiveAttempt(
    actorId: string,
    raceId: string,
    race: {
      closesAt: Date;
      status: "draft" | "open" | "closed";
    },
  ) {
    const attempt = await this.dependencies.races.getAttempt(raceId, actorId);
    if (!attempt) {
      throw new AuthorizationError(
        "RACE_NOT_AVAILABLE",
        "Start the race before attempting a problem.",
        409,
      );
    }
    if (attempt.status !== "in_progress") {
      throw new AuthorizationError(
        "RACE_ATTEMPT_LOCKED",
        "This attempt has already ended.",
        409,
      );
    }
    const now = this.now();
    if (race.status !== "open" || now.getTime() >= race.closesAt.getTime()) {
      await this.dependencies.races.markAttemptTimedOut(attempt.id);
      throw new AuthorizationError(
        "RACE_TIME_EXPIRED",
        "The submission deadline has passed.",
        409,
      );
    }
    return attempt;
  }

  private async loadProblem(raceId: string, problemId: string) {
    const problem = await this.dependencies.races.getProblemForGrading(
      raceId,
      problemId,
    );
    if (!problem) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Problem not found.",
        404,
      );
    }
    return problem;
  }

  // Free, unlimited practice run against a problem's test cases (visible
  // and hidden alike get graded, same as Activity's testCode) — never
  // finalizes anything. Rejects once that problem has already been
  // submitted for this attempt, since there's nothing meaningful left to
  // practice against a locked answer.
  async runProblem(
    identity: VerifiedIdentity,
    raceId: string,
    problemId: string,
    sourceCode: string,
  ): Promise<RaceProblemRunResponse> {
    const { actorId, race } = await this.loadContext(identity, raceId);
    const attempt = await this.requireActiveAttempt(actorId, raceId, race);
    const problem = await this.loadProblem(raceId, problemId);
    const submission = await this.dependencies.races.getProblemSubmission(
      attempt.id,
      problem.id,
    );
    if (submission?.submitted) {
      throw new AuthorizationError(
        "RACE_PROBLEM_LOCKED",
        "This problem has already been submitted and locked.",
        409,
      );
    }
    const results = await runTestCases(
      this.dependencies.codeJudge,
      problem,
      sourceCode,
    );
    const passedTestCaseCount = results.filter(
      (result) => result.passed,
    ).length;
    await this.dependencies.races.upsertProblemRun({
      attemptId: attempt.id,
      problemId: problem.id,
      sourceCode,
      passedTestCaseCount,
      totalTestCaseCount: results.length,
    });
    return {
      passed: results.every((result) => result.passed),
      results,
    };
  }

  // The one-shot final submission for a single problem — partial credit,
  // proportional to the fraction of test cases passed, per the product
  // decision to reward partial progress in a timed contest. Never
  // resubmittable once it succeeds. Once this was the last unsubmitted
  // problem, the attempt is auto-finished the same way an explicit
  // "Finish race" click would — a student who submits everything
  // shouldn't have to re-enter fullscreen just to end an attempt that has
  // nothing left to do, and it closes off recordViolation ever counting a
  // strike against an attempt with no remaining work.
  async submitProblem(
    identity: VerifiedIdentity,
    raceId: string,
    problemId: string,
    sourceCode: string,
  ): Promise<RaceProblemSubmitResponse> {
    const { actorId, race } = await this.loadContext(identity, raceId);
    const attempt = await this.requireActiveAttempt(actorId, raceId, race);
    const problem = await this.loadProblem(raceId, problemId);
    const submission = await this.dependencies.races.getProblemSubmission(
      attempt.id,
      problem.id,
    );
    if (submission?.submitted) {
      throw new AuthorizationError(
        "RACE_PROBLEM_LOCKED",
        "This problem has already been submitted and locked.",
        409,
      );
    }
    const results: ActivityTestRunResult[] = await runTestCases(
      this.dependencies.codeJudge,
      problem,
      sourceCode,
    );
    const passedTestCaseCount = results.filter(
      (result) => result.passed,
    ).length;
    const totalTestCaseCount = results.length;
    const score = Math.round(
      (problem.points * passedTestCaseCount) / totalTestCaseCount,
    );
    const submitted = await this.dependencies.races.submitProblem({
      attemptId: attempt.id,
      problemId: problem.id,
      sourceCode,
      passedTestCaseCount,
      totalTestCaseCount,
      score,
      submittedAt: this.now(),
    });
    if (!submitted) {
      throw new AuthorizationError(
        "RACE_PROBLEM_LOCKED",
        "This problem has already been submitted and locked.",
        409,
      );
    }
    const [totalProblems, submittedProblems] = await Promise.all([
      this.dependencies.races.countProblems(raceId),
      this.dependencies.races.countSubmittedProblems(attempt.id),
    ]);
    if (submittedProblems >= totalProblems) {
      await this.dependencies.races.finishAttempt(attempt.id, this.now());
    }
    return {
      passed: results.every((result) => result.passed),
      results,
      passedTestCaseCount,
      totalTestCaseCount,
      score,
    };
  }

  // An explicit "I'm done" before the clock runs out — locks every
  // not-yet-submitted problem out (finishAttempt just flips the attempt's
  // own status; individual problems already reject once the attempt isn't
  // in_progress, via requireActiveAttempt).
  async finishAttempt(
    identity: VerifiedIdentity,
    raceId: string,
  ): Promise<{ attempt: ReturnType<typeof toAttempt> }> {
    const { actorId, race } = await this.loadContext(identity, raceId);
    const attempt = await this.requireActiveAttempt(actorId, raceId, race);
    const now = this.now();
    await this.dependencies.races.finishAttempt(attempt.id, now);
    return {
      attempt: toAttempt(
        { ...attempt, status: "submitted", submittedAt: now },
        race,
      ),
    };
  }

  // Same strike-recording shape as Activity's recordViolation. Never locks
  // or force-ends the attempt — partial credit already earned from
  // submitted problems stands, and the student keeps working regardless of
  // strike count. The eventual score is reduced once violationCount
  // exceeds the allowance; that deduction is applied downstream wherever a
  // race's total score is aggregated (packages/database-platform's
  // race-repository.ts), not here.
  async recordViolation(
    identity: VerifiedIdentity,
    raceId: string,
  ): Promise<RaceViolationResponse> {
    const { actorId, race } = await this.loadContext(identity, raceId);
    const attempt = await this.dependencies.races.getAttempt(raceId, actorId);
    if (!attempt) {
      throw new AuthorizationError(
        "RACE_NOT_AVAILABLE",
        "Start the race before reporting a violation.",
        409,
      );
    }
    if (attempt.status !== "in_progress") {
      return { attempt: toAttempt(attempt, race) };
    }
    const violationCount = await this.dependencies.races.recordViolation(
      attempt.id,
    );
    return {
      attempt: toAttempt({ ...attempt, violationCount }, race),
    };
  }
}
