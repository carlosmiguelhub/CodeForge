import { randomUUID } from "node:crypto";

import type { ActivityComparisonMode, CodeLanguage } from "@sqweb/contracts";
import type { Pool, RowDataPacket } from "mysql2/promise";

interface ActorRow extends RowDataPacket {
  actor_id: string;
}

type RaceStatus = "draft" | "open" | "closed";

interface RaceRow extends RowDataPacket {
  id: string;
  class_id: string;
  duration_minutes: number;
  opens_at: Date;
  closes_at: Date;
  status: RaceStatus;
}

interface ProblemRow extends RowDataPacket {
  id: string;
  language: CodeLanguage;
  comparison_mode: ActivityComparisonMode;
  numeric_tolerance: number | null;
  points: number;
}

interface TestCaseRow extends RowDataPacket {
  id: string;
  stdin: string;
  expected_stdout: string;
}

interface MembershipRow extends RowDataPacket {
  found: number;
}

type RaceAttemptStatus = "in_progress" | "submitted" | "timed_out";

interface AttemptRow extends RowDataPacket {
  id: string;
  status: RaceAttemptStatus;
  started_at: Date;
  submitted_at: Date | null;
  violation_count: number;
}

interface ViolationCountRow extends RowDataPacket {
  violation_count: number;
}

interface SubmissionRow extends RowDataPacket {
  submitted: number;
  passed_test_case_count: number;
  total_test_case_count: number;
  score: number | null;
}

interface CountRow extends RowDataPacket {
  count: number;
}

export class MySqlRaceGradingRepository {
  constructor(private readonly pool: Pool) {}

  async resolveActorId(firebaseUid: string): Promise<string | null> {
    const [rows] = await this.pool.query<ActorRow[]>(
      `SELECT id AS actor_id FROM users WHERE firebase_uid = ? AND status = 'active' LIMIT 1`,
      [firebaseUid],
    );
    return rows[0]?.actor_id ?? null;
  }

  async getRaceForGrading(raceId: string) {
    const [rows] = await this.pool.query<RaceRow[]>(
      `SELECT id, class_id, duration_minutes, opens_at, closes_at, status
         FROM races WHERE id = ? LIMIT 1`,
      [raceId],
    );
    const race = rows[0];
    if (!race) return null;
    return {
      id: race.id,
      classId: race.class_id,
      durationMinutes: race.duration_minutes,
      opensAt: race.opens_at,
      closesAt: race.closes_at,
      status: race.status,
    };
  }

  async getProblemForGrading(raceId: string, problemId: string) {
    const [rows] = await this.pool.query<ProblemRow[]>(
      `SELECT id, language, comparison_mode, numeric_tolerance, points
         FROM race_problems WHERE id = ? AND race_id = ? LIMIT 1`,
      [problemId, raceId],
    );
    const problem = rows[0];
    if (!problem) return null;
    const [testCaseRows] = await this.pool.query<TestCaseRow[]>(
      `SELECT id, stdin, expected_stdout FROM race_test_cases
        WHERE problem_id = ? ORDER BY order_index ASC`,
      [problem.id],
    );
    return {
      id: problem.id,
      language: problem.language,
      comparisonMode: problem.comparison_mode,
      numericTolerance:
        problem.numeric_tolerance === null
          ? null
          : Number(problem.numeric_tolerance),
      points: problem.points,
      testCases: testCaseRows.map((row) => ({
        id: row.id,
        stdin: row.stdin,
        expectedStdout: row.expected_stdout,
      })),
    };
  }

  async isActiveMember(classId: string, studentId: string): Promise<boolean> {
    const [rows] = await this.pool.query<MembershipRow[]>(
      `SELECT 1 AS found FROM class_members
        WHERE class_id = ? AND student_id = ? AND status = 'active' LIMIT 1`,
      [classId, studentId],
    );
    return rows.length > 0;
  }

  async getAttempt(raceId: string, studentId: string) {
    const [rows] = await this.pool.query<AttemptRow[]>(
      `SELECT id, status, started_at, submitted_at, violation_count FROM race_attempts
        WHERE race_id = ? AND student_id = ? LIMIT 1`,
      [raceId, studentId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      status: row.status,
      startedAt: row.started_at,
      submittedAt: row.submitted_at,
      violationCount: row.violation_count,
    };
  }

  async getOrCreateAttempt(raceId: string, studentId: string, startedAt: Date) {
    const existing = await this.getAttempt(raceId, studentId);
    if (existing) return existing;
    const id = randomUUID();
    await this.pool.execute(
      `INSERT INTO race_attempts (id, race_id, student_id, started_at) VALUES (?, ?, ?, ?)`,
      [id, raceId, studentId, startedAt],
    );
    return {
      id,
      status: "in_progress" as const,
      startedAt,
      submittedAt: null,
      violationCount: 0,
    };
  }

  async markAttemptTimedOut(attemptId: string) {
    await this.pool.execute(
      `UPDATE race_attempts SET status = 'timed_out' WHERE id = ? AND status = 'in_progress'`,
      [attemptId],
    );
  }

  // Used both for an explicit "Finish race" and to auto-close an attempt
  // once its last problem gets submitted (see submitProblem below and
  // race-grading-service.ts) — races don't hard-zero on violations the way
  // Activities do, since partial credit already earned from submitted
  // problems is meant to stand.
  async finishAttempt(attemptId: string, submittedAt: Date) {
    await this.pool.execute(
      `UPDATE race_attempts SET status = 'submitted', submitted_at = ? WHERE id = ? AND status = 'in_progress'`,
      [submittedAt, attemptId],
    );
  }

  // Records one lockdown violation and returns the new running total — the
  // caller decides whether that total crosses the 4-strikes threshold. No
  // per-event log for races (unlike Activities' activity_violations
  // table), just this running counter.
  async recordViolation(attemptId: string): Promise<number> {
    await this.pool.execute(
      `UPDATE race_attempts SET violation_count = violation_count + 1 WHERE id = ?`,
      [attemptId],
    );
    const [rows] = await this.pool.query<ViolationCountRow[]>(
      `SELECT violation_count FROM race_attempts WHERE id = ?`,
      [attemptId],
    );
    return rows[0]?.violation_count ?? 0;
  }

  async getProblemSubmission(attemptId: string, problemId: string) {
    const [rows] = await this.pool.query<SubmissionRow[]>(
      `SELECT submitted, passed_test_case_count, total_test_case_count, score
         FROM race_problem_submissions WHERE attempt_id = ? AND problem_id = ? LIMIT 1`,
      [attemptId, problemId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      submitted: Boolean(row.submitted),
      passedTestCaseCount: row.passed_test_case_count,
      totalTestCaseCount: row.total_test_case_count,
      score: row.score,
    };
  }

  // A free practice run — callers only reach here once they've confirmed
  // the problem isn't already submitted, so this always writes freely.
  async upsertProblemRun(input: {
    attemptId: string;
    problemId: string;
    sourceCode: string;
    passedTestCaseCount: number;
    totalTestCaseCount: number;
  }) {
    await this.pool.execute(
      `INSERT INTO race_problem_submissions
         (id, attempt_id, problem_id, source_code, passed_test_case_count, total_test_case_count)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         source_code = VALUES(source_code),
         passed_test_case_count = VALUES(passed_test_case_count),
         total_test_case_count = VALUES(total_test_case_count)`,
      [
        randomUUID(),
        input.attemptId,
        input.problemId,
        input.sourceCode,
        input.passedTestCaseCount,
        input.totalTestCaseCount,
      ],
    );
  }

  // Checked-then-written rather than a single atomic statement — same
  // small accepted race window as every other attempt/submission write in
  // this codebase (e.g. quiz-repository's submitAttempt), not worth a
  // transaction for a problem a real student submits once.
  async submitProblem(input: {
    attemptId: string;
    problemId: string;
    sourceCode: string;
    passedTestCaseCount: number;
    totalTestCaseCount: number;
    score: number;
    submittedAt: Date;
  }): Promise<boolean> {
    const existing = await this.getProblemSubmission(
      input.attemptId,
      input.problemId,
    );
    if (existing?.submitted) return false;
    await this.pool.execute(
      `INSERT INTO race_problem_submissions
         (id, attempt_id, problem_id, source_code, submitted, passed_test_case_count, total_test_case_count, score, submitted_at)
       VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         source_code = VALUES(source_code),
         submitted = 1,
         passed_test_case_count = VALUES(passed_test_case_count),
         total_test_case_count = VALUES(total_test_case_count),
         score = VALUES(score),
         submitted_at = VALUES(submitted_at)`,
      [
        randomUUID(),
        input.attemptId,
        input.problemId,
        input.sourceCode,
        input.passedTestCaseCount,
        input.totalTestCaseCount,
        input.score,
        input.submittedAt,
      ],
    );
    return true;
  }

  async countProblems(raceId: string): Promise<number> {
    const [rows] = await this.pool.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM race_problems WHERE race_id = ?`,
      [raceId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async countSubmittedProblems(attemptId: string): Promise<number> {
    const [rows] = await this.pool.query<CountRow[]>(
      `SELECT COUNT(*) AS count FROM race_problem_submissions
        WHERE attempt_id = ? AND submitted = 1`,
      [attemptId],
    );
    return Number(rows[0]?.count ?? 0);
  }
}
