import { randomUUID } from "node:crypto";

import {
  ACTIVITY_ALLOWED_VIOLATIONS,
  ACTIVITY_VIOLATION_DEDUCTION_PERCENT,
  applyViolationDeduction,
} from "@sqweb/contracts";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import {
  activities,
  activityAttempts,
  activityIntegrityFlags,
  activityTestCases,
  activityTestRuns,
  activityViolations,
  classMembers,
  platformSchema,
  users,
} from "./schema";

type Database = MySql2Database<typeof platformSchema>;

// These correlate to the outer `activities` row by id. They're written with
// explicit table-qualified raw SQL rather than interpolated Column objects
// (e.g. `${activities.id}`) on purpose: when the outer query has no JOIN,
// Drizzle renders such a bare column reference unqualified, and MySQL then
// resolves it against the subquery's OWN table first — silently comparing
// e.g. activity_test_cases.activity_id to its own id instead of the outer
// activities.id, which is always false. Whether that miscompile happens
// depends on whether the outer select happens to already have a join, which
// makes it a landmine for any query built from this file. Raw qualified
// text sidesteps it entirely — don't revert to Column interpolation here.
const testCaseCountSql = sql<number>`(
  SELECT COUNT(*) FROM activity_test_cases
  WHERE activity_test_cases.activity_id = activities.id
)`;

const memberCountSql = sql<number>`(
  SELECT COUNT(*) FROM class_members
  WHERE class_members.class_id = activities.class_id AND class_members.status = 'active'
)`;

const passedCountSql = sql<number>`(
  SELECT COUNT(*) FROM activity_attempts
  WHERE activity_attempts.activity_id = activities.id AND activity_attempts.status = 'passed'
)`;

const zeroedCountSql = sql<number>`(
  SELECT COUNT(*) FROM activity_attempts
  WHERE activity_attempts.activity_id = activities.id AND activity_attempts.status = 'zeroed_violation'
)`;

function toTestCase(row: typeof activityTestCases.$inferSelect) {
  return {
    id: row.id,
    stdin: row.stdin,
    expectedStdout: row.expectedStdout,
    isHidden: row.isHidden,
    showExpectedOutput: row.showExpectedOutput,
    orderIndex: row.orderIndex,
  };
}

function toTestCasePreview(row: typeof activityTestCases.$inferSelect) {
  return {
    id: row.id,
    stdin: row.isHidden ? null : row.stdin,
    expectedStdout:
      !row.isHidden && row.showExpectedOutput ? row.expectedStdout : null,
    isHidden: row.isHidden,
    orderIndex: row.orderIndex,
  };
}

// The single source of truth for "is this activity effectively locked" —
// a manual teacher lock OR a deadline that has passed. Every read path
// (getForTeacher/getForStudent/listForTeacher/listForStudent) computes
// this the same way so the client never has to re-derive it from its own
// clock.
function isLockedFor(
  row: { deadlineAt: Date | null; locked: boolean },
  now: Date,
): boolean {
  return (
    row.locked ||
    (row.deadlineAt !== null && now.getTime() >= row.deadlineAt.getTime())
  );
}

// A terminal-but-unsuccessful attempt (submitted incomplete, or zeroed for
// violations — legacy, no attempt reaches "zeroed_violation" anymore)
// still earns a concrete zero rather than leaving the score blank — only
// an attempt that hasn't ended yet has no score at all. A passed attempt's
// score is reduced by the distraction-deduction formula once
// violationCount exceeds the allowance. Kept as a separate function from
// execution-api's own scoreFor (different package, different status-type
// ownership — read path here vs. write path there) but both delegate to
// the one shared applyViolationDeduction so the actual math can't drift.
function scoreFor(
  status: typeof activityAttempts.$inferSelect.status | "not_started",
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

export class MySqlActivityRepository {
  constructor(private readonly database: Database) {}

  async findClassId(activityId: string) {
    const [row] = await this.database
      .select({ classId: activities.classId })
      .from(activities)
      .where(eq(activities.id, activityId));
    return row?.classId ?? null;
  }

  async create(
    input: {
      classId: string;
      title: string;
      instructions: string;
      language: (typeof activities.$inferInsert)["language"];
      starterCode: string | null;
      referenceSolution: string | null;
      allowRetake: boolean;
      comparisonMode: (typeof activities.$inferInsert)["comparisonMode"];
      numericTolerance: number | null;
      points: number;
      deadlineAt: Date | null;
      testCases: readonly {
        stdin: string;
        expectedStdout: string;
        isHidden: boolean;
        showExpectedOutput: boolean;
      }[];
    },
    now: Date,
  ) {
    const id = randomUUID();
    await this.database.insert(activities).values({
      id,
      classId: input.classId,
      title: input.title,
      instructions: input.instructions,
      language: input.language,
      starterCode: input.starterCode,
      referenceSolution: input.referenceSolution,
      allowRetake: input.allowRetake,
      comparisonMode: input.comparisonMode,
      numericTolerance: input.numericTolerance,
      points: input.points,
      deadlineAt: input.deadlineAt,
    });
    await this.database.insert(activityTestCases).values(
      input.testCases.map((testCase, index) => ({
        id: randomUUID(),
        activityId: id,
        stdin: testCase.stdin,
        expectedStdout: testCase.expectedStdout,
        isHidden: testCase.isHidden,
        showExpectedOutput: testCase.showExpectedOutput,
        orderIndex: index,
      })),
    );
    const created = await this.getForTeacher(id, now);
    if (!created) throw new Error("Activity could not be reloaded.");
    return created;
  }

  // A full replace of the answer key: existing test cases are dropped and
  // reinserted rather than diffed. Historical free-run results tied to the
  // old test cases are cleared along with them, since they no longer refer
  // to anything real — submitted attempts (status/sourceCode/violations)
  // are untouched, so a teacher who wants students to redo the activity
  // still uses the separate reset action.
  async update(
    activityId: string,
    input: {
      title: string;
      instructions: string;
      language: (typeof activities.$inferInsert)["language"];
      starterCode: string | null;
      referenceSolution: string | null;
      allowRetake: boolean;
      comparisonMode: (typeof activities.$inferInsert)["comparisonMode"];
      numericTolerance: number | null;
      points: number;
      deadlineAt: Date | null;
      testCases: readonly {
        stdin: string;
        expectedStdout: string;
        isHidden: boolean;
        showExpectedOutput: boolean;
      }[];
    },
    now: Date,
  ) {
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(activities)
        .set({
          title: input.title,
          instructions: input.instructions,
          language: input.language,
          starterCode: input.starterCode,
          referenceSolution: input.referenceSolution,
          allowRetake: input.allowRetake,
          comparisonMode: input.comparisonMode,
          numericTolerance: input.numericTolerance,
          points: input.points,
          deadlineAt: input.deadlineAt,
        })
        .where(eq(activities.id, activityId));

      const existingTestCases = await transaction
        .select({ id: activityTestCases.id })
        .from(activityTestCases)
        .where(eq(activityTestCases.activityId, activityId));
      const existingTestCaseIds = existingTestCases.map((row) => row.id);
      if (existingTestCaseIds.length > 0) {
        await transaction
          .delete(activityTestRuns)
          .where(inArray(activityTestRuns.testCaseId, existingTestCaseIds));
      }
      await transaction
        .delete(activityTestCases)
        .where(eq(activityTestCases.activityId, activityId));
      await transaction.insert(activityTestCases).values(
        input.testCases.map((testCase, index) => ({
          id: randomUUID(),
          activityId,
          stdin: testCase.stdin,
          expectedStdout: testCase.expectedStdout,
          isHidden: testCase.isHidden,
          showExpectedOutput: testCase.showExpectedOutput,
          orderIndex: index,
        })),
      );
    });
    const updated = await this.getForTeacher(activityId, now);
    if (!updated) throw new Error("Activity could not be reloaded.");
    return updated;
  }

  // The teacher's quick deadline control — sets a new deadline (or clears
  // it with null) and unconditionally clears the manual `locked` flag,
  // same "one action serves extend AND reopen" precedent as Race's
  // updateSchedule.
  async updateSchedule(activityId: string, deadlineAt: Date | null) {
    await this.database
      .update(activities)
      .set({ deadlineAt, locked: false })
      .where(eq(activities.id, activityId));
  }

  // The teacher's manual "lock now" action — independent of the deadline,
  // takes effect immediately regardless of whether a deadline is even set.
  async lock(activityId: string) {
    await this.database
      .update(activities)
      .set({ locked: true })
      .where(eq(activities.id, activityId));
  }

  // Children are FK-restricted, so they're removed deepest-first inside one
  // transaction rather than relying on cascade delete.
  async remove(activityId: string) {
    await this.database.transaction(async (transaction) => {
      const attempts = await transaction
        .select({ id: activityAttempts.id })
        .from(activityAttempts)
        .where(eq(activityAttempts.activityId, activityId));
      const attemptIds = attempts.map((row) => row.id);
      if (attemptIds.length > 0) {
        await transaction
          .delete(activityTestRuns)
          .where(inArray(activityTestRuns.attemptId, attemptIds));
        await transaction
          .delete(activityViolations)
          .where(inArray(activityViolations.attemptId, attemptIds));
        await transaction
          .delete(activityIntegrityFlags)
          .where(inArray(activityIntegrityFlags.attemptId, attemptIds));
        await transaction
          .delete(activityAttempts)
          .where(eq(activityAttempts.activityId, activityId));
      }
      await transaction
        .delete(activityTestCases)
        .where(eq(activityTestCases.activityId, activityId));
      await transaction.delete(activities).where(eq(activities.id, activityId));
    });
  }

  async listForTeacher(classId: string, now: Date) {
    const rows = await this.database
      .select({
        activity: activities,
        testCaseCount: testCaseCountSql,
        memberCount: memberCountSql,
        passedCount: passedCountSql,
        zeroedCount: zeroedCountSql,
      })
      .from(activities)
      .where(eq(activities.classId, classId))
      .orderBy(desc(activities.createdAt));
    return rows.map((row) => ({
      id: row.activity.id,
      title: row.activity.title,
      language: row.activity.language,
      testCaseCount: Number(row.testCaseCount),
      points: row.activity.points,
      deadlineAt: row.activity.deadlineAt?.toISOString() ?? null,
      isLocked: isLockedFor(row.activity, now),
      createdAt: row.activity.createdAt.toISOString(),
      memberCount: Number(row.memberCount),
      passedCount: Number(row.passedCount),
      zeroedCount: Number(row.zeroedCount),
    }));
  }

  async listForStudent(classId: string, studentId: string, now: Date) {
    const rows = await this.database
      .select({
        activity: activities,
        testCaseCount: testCaseCountSql,
        attemptStatus: activityAttempts.status,
        submittedAt: activityAttempts.submittedAt,
        violationCount: activityAttempts.violationCount,
      })
      .from(activities)
      .leftJoin(
        activityAttempts,
        and(
          eq(activityAttempts.activityId, activities.id),
          eq(activityAttempts.studentId, studentId),
        ),
      )
      .where(eq(activities.classId, classId))
      .orderBy(desc(activities.createdAt));
    return rows.map((row) => ({
      id: row.activity.id,
      title: row.activity.title,
      language: row.activity.language,
      testCaseCount: Number(row.testCaseCount),
      points: row.activity.points,
      deadlineAt: row.activity.deadlineAt?.toISOString() ?? null,
      isLocked: isLockedFor(row.activity, now),
      createdAt: row.activity.createdAt.toISOString(),
      attemptStatus: row.attemptStatus ?? null,
      score: scoreFor(
        row.attemptStatus ?? "not_started",
        row.activity.points,
        row.violationCount ?? 0,
      ),
      submittedAt: row.submittedAt?.toISOString() ?? null,
    }));
  }

  async getForTeacher(activityId: string, now: Date) {
    const [row] = await this.database
      .select({
        activity: activities,
        memberCount: memberCountSql,
        passedCount: passedCountSql,
        zeroedCount: zeroedCountSql,
      })
      .from(activities)
      .where(eq(activities.id, activityId));
    if (!row) return null;
    const testCases = await this.database
      .select()
      .from(activityTestCases)
      .where(eq(activityTestCases.activityId, activityId))
      .orderBy(asc(activityTestCases.orderIndex));
    return {
      id: row.activity.id,
      classId: row.activity.classId,
      title: row.activity.title,
      instructions: row.activity.instructions,
      language: row.activity.language,
      starterCode: row.activity.starterCode,
      referenceSolution: row.activity.referenceSolution,
      allowRetake: row.activity.allowRetake,
      comparisonMode: row.activity.comparisonMode,
      numericTolerance: row.activity.numericTolerance,
      points: row.activity.points,
      deadlineAt: row.activity.deadlineAt?.toISOString() ?? null,
      locked: row.activity.locked,
      isLocked: isLockedFor(row.activity, now),
      createdAt: row.activity.createdAt.toISOString(),
      testCases: testCases.map(toTestCase),
      memberCount: Number(row.memberCount),
      passedCount: Number(row.passedCount),
      zeroedCount: Number(row.zeroedCount),
    };
  }

  async getForStudent(activityId: string, studentId: string, now: Date) {
    const [row] = await this.database
      .select()
      .from(activities)
      .where(eq(activities.id, activityId));
    if (!row) return null;
    const testCases = await this.database
      .select()
      .from(activityTestCases)
      .where(eq(activityTestCases.activityId, activityId))
      .orderBy(asc(activityTestCases.orderIndex));
    const [attempt] = await this.database
      .select()
      .from(activityAttempts)
      .where(
        and(
          eq(activityAttempts.activityId, activityId),
          eq(activityAttempts.studentId, studentId),
        ),
      );
    return {
      id: row.id,
      classId: row.classId,
      title: row.title,
      instructions: row.instructions,
      language: row.language,
      starterCode: row.starterCode,
      allowRetake: row.allowRetake,
      comparisonMode: row.comparisonMode,
      numericTolerance: row.numericTolerance,
      points: row.points,
      deadlineAt: row.deadlineAt?.toISOString() ?? null,
      isLocked: isLockedFor(row, now),
      createdAt: row.createdAt.toISOString(),
      testCases: testCases.map(toTestCasePreview),
      attempt: attempt
        ? {
            status: attempt.status,
            violationCount: attempt.violationCount,
            submittedAt: attempt.submittedAt?.toISOString() ?? null,
            score: scoreFor(attempt.status, row.points, attempt.violationCount),
            sourceCode: attempt.sourceCode,
          }
        : null,
    };
  }

  async listSubmissions(activityId: string, classId: string) {
    const [activityRow] = await this.database
      .select({ points: activities.points })
      .from(activities)
      .where(eq(activities.id, activityId));
    const totalPoints = activityRow?.points ?? 0;
    const rows = await this.database
      .select({
        studentId: users.id,
        studentName: users.displayName,
        attemptId: activityAttempts.id,
        status: activityAttempts.status,
        sourceCode: activityAttempts.sourceCode,
        violationCount: activityAttempts.violationCount,
        submittedAt: activityAttempts.submittedAt,
      })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.studentId))
      .leftJoin(
        activityAttempts,
        and(
          eq(activityAttempts.activityId, activityId),
          eq(activityAttempts.studentId, classMembers.studentId),
        ),
      )
      .where(
        and(
          eq(classMembers.classId, classId),
          eq(classMembers.status, "active"),
        ),
      )
      .orderBy(asc(users.displayName));

    const attemptIds = rows
      .map((row) => row.attemptId)
      .filter((id): id is string => id !== null);
    const violationRows =
      attemptIds.length > 0
        ? await this.database
            .select()
            .from(activityViolations)
            .where(inArray(activityViolations.attemptId, attemptIds))
            .orderBy(asc(activityViolations.occurredAt))
        : [];
    const violationsByAttempt = new Map<
      string,
      {
        id: string;
        kind: "tab_switch" | "fullscreen_exit";
        occurredAt: string;
      }[]
    >();
    for (const violation of violationRows) {
      const list = violationsByAttempt.get(violation.attemptId) ?? [];
      list.push({
        id: violation.id,
        kind: violation.kind,
        occurredAt: violation.occurredAt.toISOString(),
      });
      violationsByAttempt.set(violation.attemptId, list);
    }

    const integrityFlagRows =
      attemptIds.length > 0
        ? await this.database
            .select()
            .from(activityIntegrityFlags)
            .where(inArray(activityIntegrityFlags.attemptId, attemptIds))
            .orderBy(asc(activityIntegrityFlags.detectedAt))
        : [];
    const integrityFlagsByAttempt = new Map<
      string,
      {
        id: string;
        kind: "input_ignored" | "output_invariant";
        testCaseId: string | null;
        message: string;
        detectedAt: string;
      }[]
    >();
    for (const flag of integrityFlagRows) {
      const list = integrityFlagsByAttempt.get(flag.attemptId) ?? [];
      list.push({
        id: flag.id,
        kind: flag.kind,
        testCaseId: flag.testCaseId,
        message: flag.message,
        detectedAt: flag.detectedAt.toISOString(),
      });
      integrityFlagsByAttempt.set(flag.attemptId, list);
    }

    return rows.map((row) => {
      const status = row.status ?? ("not_started" as const);
      return {
        studentId: row.studentId,
        studentName: row.studentName,
        status,
        sourceCode: row.sourceCode,
        violationCount: row.violationCount ?? 0,
        violations: row.attemptId
          ? (violationsByAttempt.get(row.attemptId) ?? [])
          : [],
        submittedAt: row.submittedAt?.toISOString() ?? null,
        score: scoreFor(status, totalPoints, row.violationCount ?? 0),
        totalPoints,
        integrityFlags: row.attemptId
          ? (integrityFlagsByAttempt.get(row.attemptId) ?? [])
          : [],
      };
    });
  }

  // Teacher-initiated unlock — the only way out of "passed and locked" (no
  // allowRetake) or "zeroed_violation". Clears the lock and strike count
  // but keeps their last submitted code and the historical violation log
  // (an audit trail, not something a reset should erase).
  async resetAttempt(activityId: string, studentId: string) {
    await this.database
      .update(activityAttempts)
      .set({ status: "in_progress", violationCount: 0, submittedAt: null })
      .where(
        and(
          eq(activityAttempts.activityId, activityId),
          eq(activityAttempts.studentId, studentId),
        ),
      );
  }

  async resetAttempts(activityId: string, studentIds: readonly string[]) {
    if (studentIds.length === 0) return;
    await this.database
      .update(activityAttempts)
      .set({ status: "in_progress", violationCount: 0, submittedAt: null })
      .where(
        and(
          eq(activityAttempts.activityId, activityId),
          inArray(activityAttempts.studentId, [...studentIds]),
        ),
      );
  }
}
