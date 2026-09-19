import { randomUUID } from "node:crypto";

import type {
  ActivityComparisonMode,
  ActivityIntegrityFlagKind,
  ActivityViolationKind,
  CodeLanguage,
} from "@sqweb/contracts";
import type { Pool, RowDataPacket } from "mysql2/promise";

interface ActorRow extends RowDataPacket {
  actor_id: string;
}

interface ActivityRow extends RowDataPacket {
  id: string;
  class_id: string;
  language: CodeLanguage;
  allow_retake: number;
  comparison_mode: ActivityComparisonMode;
  numeric_tolerance: number | null;
  points: number;
  deadline_at: Date | null;
  locked: number;
}

interface TestCaseRow extends RowDataPacket {
  id: string;
  stdin: string;
  expected_stdout: string;
}

interface MembershipRow extends RowDataPacket {
  found: number;
}

type AttemptStatus =
  "in_progress" | "passed" | "submitted_incomplete" | "zeroed_violation";

interface AttemptRow extends RowDataPacket {
  id: string;
  status: AttemptStatus;
  violation_count: number;
  submitted_at: Date | null;
  source_code: string | null;
}

interface ViolationCountRow extends RowDataPacket {
  violation_count: number;
}

export class MySqlActivityGradingRepository {
  constructor(private readonly pool: Pool) {}

  async resolveActorId(firebaseUid: string): Promise<string | null> {
    const [rows] = await this.pool.query<ActorRow[]>(
      `SELECT id AS actor_id FROM users WHERE firebase_uid = ? AND status = 'active' LIMIT 1`,
      [firebaseUid],
    );
    return rows[0]?.actor_id ?? null;
  }

  async getForGrading(activityId: string) {
    const [activityRows] = await this.pool.query<ActivityRow[]>(
      `SELECT id, class_id, language, allow_retake, comparison_mode, numeric_tolerance, points, deadline_at, locked
         FROM activities WHERE id = ? LIMIT 1`,
      [activityId],
    );
    const activity = activityRows[0];
    if (!activity) return null;
    const [testCaseRows] = await this.pool.query<TestCaseRow[]>(
      `SELECT id, stdin, expected_stdout FROM activity_test_cases
        WHERE activity_id = ? ORDER BY order_index ASC`,
      [activityId],
    );
    return {
      id: activity.id,
      classId: activity.class_id,
      language: activity.language,
      allowRetake: Boolean(activity.allow_retake),
      comparisonMode: activity.comparison_mode,
      numericTolerance:
        activity.numeric_tolerance === null
          ? null
          : Number(activity.numeric_tolerance),
      points: activity.points,
      deadlineAt: activity.deadline_at,
      locked: Boolean(activity.locked),
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

  async getOrCreateAttempt(activityId: string, studentId: string) {
    const [existingRows] = await this.pool.query<AttemptRow[]>(
      `SELECT id, status, violation_count, submitted_at, source_code FROM activity_attempts
        WHERE activity_id = ? AND student_id = ? LIMIT 1`,
      [activityId, studentId],
    );
    const existing = existingRows[0];
    if (existing)
      return {
        id: existing.id,
        status: existing.status,
        violationCount: existing.violation_count,
        submittedAt: existing.submitted_at?.toISOString() ?? null,
        sourceCode: existing.source_code,
      };
    const id = randomUUID();
    await this.pool.execute(
      `INSERT INTO activity_attempts (id, activity_id, student_id) VALUES (?, ?, ?)`,
      [id, activityId, studentId],
    );
    return {
      id,
      status: "in_progress" as const,
      violationCount: 0,
      submittedAt: null,
      sourceCode: null,
    };
  }

  async recordTestRuns(
    attemptId: string,
    runs: readonly {
      testCaseId: string;
      passed: boolean;
      actualStdout: string | null;
    }[],
  ) {
    for (const run of runs) {
      await this.pool.execute(
        `INSERT INTO activity_test_runs (id, attempt_id, test_case_id, passed, actual_stdout)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), attemptId, run.testCaseId, run.passed, run.actualStdout],
      );
    }
  }

  async markAttemptPassed(attemptId: string) {
    await this.pool.execute(
      `UPDATE activity_attempts SET status = 'passed', submitted_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [attemptId],
    );
  }

  // Set when a student explicitly submits an attempt that didn't pass every
  // test case — a deliberate, terminal choice distinct from just leaving an
  // attempt "in_progress" after an unsuccessful test run.
  async markAttemptSubmittedIncomplete(attemptId: string) {
    await this.pool.execute(
      `UPDATE activity_attempts SET status = 'submitted_incomplete', submitted_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [attemptId],
    );
  }

  // Lets a passed attempt with allowRetake go back to in_progress for a new
  // round of test runs, instead of accumulating runs against a closed
  // attempt. Resets the strike count too — a fresh retake gets a fresh
  // 4-strikes budget, not whatever was left over from the pass.
  async resetAttemptToInProgress(attemptId: string) {
    await this.pool.execute(
      `UPDATE activity_attempts SET status = 'in_progress', submitted_at = NULL, violation_count = 0 WHERE id = ?`,
      [attemptId],
    );
  }

  // Saved on every run (pass or fail) — a teacher reviewing a submission
  // should see what was actually last submitted, not only the code that
  // happened to pass.
  async saveAttemptSourceCode(attemptId: string, sourceCode: string) {
    await this.pool.execute(
      `UPDATE activity_attempts SET source_code = ? WHERE id = ?`,
      [sourceCode, attemptId],
    );
  }

  // Records one lockdown violation and returns the new running total —
  // the caller decides whether that total crosses the 4-strikes threshold.
  // Two round trips rather than one multi-statement query — this pool
  // isn't configured with multipleStatements, same as every other
  // repository in this file.
  async recordViolation(
    attemptId: string,
    kind: ActivityViolationKind,
  ): Promise<number> {
    await this.pool.execute(
      `INSERT INTO activity_violations (id, attempt_id, kind) VALUES (?, ?, ?)`,
      [randomUUID(), attemptId, kind],
    );
    await this.pool.execute(
      `UPDATE activity_attempts SET violation_count = violation_count + 1 WHERE id = ?`,
      [attemptId],
    );
    const [rows] = await this.pool.query<ViolationCountRow[]>(
      `SELECT violation_count FROM activity_attempts WHERE id = ?`,
      [attemptId],
    );
    return rows[0]?.violation_count ?? 0;
  }

  async zeroAttempt(attemptId: string) {
    await this.pool.execute(
      `UPDATE activity_attempts SET status = 'zeroed_violation', submitted_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
      [attemptId],
    );
  }

  // Advisory-only integrity signals from submitAttempt's heuristics — never
  // affects grading. One row per flag, not deduped against prior
  // submissions of the same attempt.
  async recordIntegrityFlags(
    attemptId: string,
    flags: readonly {
      kind: ActivityIntegrityFlagKind;
      testCaseId: string | null;
      message: string;
    }[],
  ) {
    for (const flag of flags) {
      await this.pool.execute(
        `INSERT INTO activity_integrity_flags (id, attempt_id, kind, test_case_id, message)
         VALUES (?, ?, ?, ?, ?)`,
        [randomUUID(), attemptId, flag.kind, flag.testCaseId, flag.message],
      );
    }
  }
}
