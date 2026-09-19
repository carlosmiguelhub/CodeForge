import { randomUUID } from "node:crypto";

import {
  RACE_ALLOWED_VIOLATIONS,
  RACE_VIOLATION_DEDUCTION_PERCENT,
  applyViolationDeduction,
} from "@sqweb/contracts";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import {
  classMembers,
  platformSchema,
  raceAttempts,
  raceProblems,
  raceProblemSubmissions,
  races,
  raceTestCases,
  users,
} from "./schema";

type Database = MySql2Database<typeof platformSchema>;

// Table-qualified raw SQL, not interpolated Column objects — see the
// matching comment in activity-repository.ts/quiz-repository.ts.
// Interpolating e.g. `${races.id}` renders unqualified whenever the outer
// select has no JOIN, and MySQL then silently resolves it against the
// subquery's own table instead of the outer one, making the correlation
// always false.
const problemCountSql = sql<number>`(
  SELECT COUNT(*) FROM race_problems
  WHERE race_problems.race_id = races.id
)`;

const totalPointsSql = sql<number>`(
  SELECT COALESCE(SUM(race_problems.points), 0) FROM race_problems
  WHERE race_problems.race_id = races.id
)`;

const memberCountSql = sql<number>`(
  SELECT COUNT(*) FROM class_members
  WHERE class_members.class_id = races.class_id AND class_members.status = 'active'
)`;

const submittedCountSql = sql<number>`(
  SELECT COUNT(*) FROM race_attempts
  WHERE race_attempts.race_id = races.id AND race_attempts.status = 'submitted'
)`;

function availabilityFor(
  status: "draft" | "open" | "closed",
  opensAt: Date,
  closesAt: Date,
  now: Date,
) {
  if (status === "closed" || now.getTime() >= closesAt.getTime()) {
    return "closed" as const;
  }
  if (status === "draft" || now.getTime() < opensAt.getTime()) {
    return "scheduled" as const;
  }
  return "open" as const;
}

// Mirrors quiz-repository.ts's toAttempt — the race attempt's own status/
// clock, distinct from each problem's own attempt (submitted/score/
// sourceCode), which is nested per-problem in toProblemForStudent instead.
//
// The deadline is simply the race's closesAt — every student shares one
// synchronized end time (a late joiner gets correspondingly less time,
// never a fresh full duration), and a teacher's "Extend time" schedule
// update (which only ever moves closesAt) takes effect for everyone
// immediately, with nothing left capping it back down. durationMinutes is
// purely nominal/display — the teacher's stated intent for how long the
// contest runs, not a second ceiling on the actual deadline.
function toAttempt(
  row: typeof raceAttempts.$inferSelect,
  race: { closesAt: Date },
) {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    deadlineAt: race.closesAt.toISOString(),
    violationCount: row.violationCount,
  };
}

function toTestCase(row: typeof raceTestCases.$inferSelect) {
  return {
    id: row.id,
    stdin: row.stdin,
    expectedStdout: row.expectedStdout,
    isHidden: row.isHidden,
    showExpectedOutput: row.showExpectedOutput,
    orderIndex: row.orderIndex,
  };
}

function toTestCasePreview(row: typeof raceTestCases.$inferSelect) {
  return {
    id: row.id,
    stdin: row.isHidden ? null : row.stdin,
    expectedStdout:
      !row.isHidden && row.showExpectedOutput ? row.expectedStdout : null,
    isHidden: row.isHidden,
    orderIndex: row.orderIndex,
  };
}

function toProblemForTeacher(
  row: typeof raceProblems.$inferSelect,
  testCases: readonly (typeof raceTestCases.$inferSelect)[],
) {
  return {
    id: row.id,
    orderIndex: row.orderIndex,
    title: row.title,
    instructions: row.instructions,
    language: row.language,
    starterCode: row.starterCode,
    referenceSolution: row.referenceSolution,
    comparisonMode: row.comparisonMode,
    numericTolerance: row.numericTolerance,
    points: row.points,
    testCases: testCases.map(toTestCase),
  };
}

function toProblemForStudent(
  row: typeof raceProblems.$inferSelect,
  testCases: readonly (typeof raceTestCases.$inferSelect)[],
  submission: typeof raceProblemSubmissions.$inferSelect | undefined,
) {
  return {
    id: row.id,
    orderIndex: row.orderIndex,
    title: row.title,
    instructions: row.instructions,
    language: row.language,
    starterCode: row.starterCode,
    comparisonMode: row.comparisonMode,
    numericTolerance: row.numericTolerance,
    points: row.points,
    testCases: testCases.map(toTestCasePreview),
    attempt: submission
      ? {
          submitted: submission.submitted,
          passedTestCaseCount: submission.passedTestCaseCount,
          totalTestCaseCount: submission.totalTestCaseCount,
          score: submission.score,
          sourceCode: submission.sourceCode,
        }
      : null,
  };
}

export class MySqlRaceRepository {
  constructor(private readonly database: Database) {}

  async findClassId(raceId: string) {
    const [row] = await this.database
      .select({ classId: races.classId })
      .from(races)
      .where(eq(races.id, raceId));
    return row?.classId ?? null;
  }

  async create(
    input: {
      classId: string;
      title: string;
      durationMinutes: number;
      opensAt: Date;
      closesAt: Date;
      problems: readonly {
        title: string;
        instructions: string;
        language: (typeof raceProblems.$inferInsert)["language"];
        starterCode: string | null;
        referenceSolution: string | null;
        comparisonMode: (typeof raceProblems.$inferInsert)["comparisonMode"];
        numericTolerance: number | null;
        points: number;
        testCases: readonly {
          stdin: string;
          expectedStdout: string;
          isHidden: boolean;
          showExpectedOutput: boolean;
        }[];
      }[];
    },
    now: Date,
  ) {
    const raceId = randomUUID();
    await this.database.transaction(async (transaction) => {
      await transaction.insert(races).values({
        id: raceId,
        classId: input.classId,
        title: input.title,
        durationMinutes: input.durationMinutes,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        status: "open",
      });
      for (const [index, problem] of input.problems.entries()) {
        const problemId = randomUUID();
        await transaction.insert(raceProblems).values({
          id: problemId,
          raceId,
          orderIndex: index,
          title: problem.title,
          instructions: problem.instructions,
          language: problem.language,
          starterCode: problem.starterCode,
          referenceSolution: problem.referenceSolution,
          comparisonMode: problem.comparisonMode,
          numericTolerance: problem.numericTolerance,
          points: problem.points,
        });
        await transaction.insert(raceTestCases).values(
          problem.testCases.map((testCase, testCaseIndex) => ({
            id: randomUUID(),
            problemId,
            stdin: testCase.stdin,
            expectedStdout: testCase.expectedStdout,
            isHidden: testCase.isHidden,
            showExpectedOutput: testCase.showExpectedOutput,
            orderIndex: testCaseIndex,
          })),
        );
      }
    });
    const created = await this.getForTeacher(raceId, now);
    if (!created) throw new Error("Race could not be reloaded.");
    return created;
  }

  // Children are FK-restricted, so they're removed deepest-first inside one
  // transaction rather than relying on cascade delete — same precedent as
  // ActivityRepository.remove. Submissions are cleared by attemptId (every
  // submission belongs to an attempt of this race, so that alone covers
  // every row regardless of which problem it's for) before problems, which
  // themselves can't go until their test cases are gone.
  async remove(raceId: string) {
    await this.database.transaction(async (transaction) => {
      const attempts = await transaction
        .select({ id: raceAttempts.id })
        .from(raceAttempts)
        .where(eq(raceAttempts.raceId, raceId));
      const attemptIds = attempts.map((row) => row.id);
      if (attemptIds.length > 0) {
        await transaction
          .delete(raceProblemSubmissions)
          .where(inArray(raceProblemSubmissions.attemptId, attemptIds));
        await transaction
          .delete(raceAttempts)
          .where(eq(raceAttempts.raceId, raceId));
      }
      const problems = await transaction
        .select({ id: raceProblems.id })
        .from(raceProblems)
        .where(eq(raceProblems.raceId, raceId));
      const problemIds = problems.map((row) => row.id);
      if (problemIds.length > 0) {
        await transaction
          .delete(raceTestCases)
          .where(inArray(raceTestCases.problemId, problemIds));
        await transaction
          .delete(raceProblems)
          .where(eq(raceProblems.raceId, raceId));
      }
      await transaction.delete(races).where(eq(races.id, raceId));
    });
  }

  // Full edit — mirrors ActivityRepository.update's tear-down-and-rebuild
  // of test cases (nothing references race_test_cases by FK, so they're
  // freely replaceable), but problems themselves are matched by position
  // and updated in place rather than replaced, since race_problem_
  // submissions.problem_id is FK-restricted to race_problems.id: replacing
  // a problem's id would orphan any student's existing submission for it.
  // A problem dropped from the new list (fewer problems than before) has
  // its submissions deleted first so the FK restrict doesn't block removal
  // — the teacher explicitly chose to remove that problem, so its
  // submissions going with it is expected, not a silent surprise.
  async update(
    raceId: string,
    input: {
      title: string;
      durationMinutes: number;
      problems: readonly {
        title: string;
        instructions: string;
        language: (typeof raceProblems.$inferInsert)["language"];
        starterCode: string | null;
        referenceSolution: string | null;
        comparisonMode: (typeof raceProblems.$inferInsert)["comparisonMode"];
        numericTolerance: number | null;
        points: number;
        testCases: readonly {
          stdin: string;
          expectedStdout: string;
          isHidden: boolean;
          showExpectedOutput: boolean;
        }[];
      }[];
    },
    now: Date,
  ) {
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(races)
        .set({
          title: input.title,
          durationMinutes: input.durationMinutes,
        })
        .where(eq(races.id, raceId));

      const existingProblems = await transaction
        .select({ id: raceProblems.id })
        .from(raceProblems)
        .where(eq(raceProblems.raceId, raceId))
        .orderBy(asc(raceProblems.orderIndex));

      for (const [index, problem] of input.problems.entries()) {
        const existing = existingProblems[index];
        const problemId = existing?.id ?? randomUUID();
        if (existing) {
          await transaction
            .update(raceProblems)
            .set({
              orderIndex: index,
              title: problem.title,
              instructions: problem.instructions,
              language: problem.language,
              starterCode: problem.starterCode,
              referenceSolution: problem.referenceSolution,
              comparisonMode: problem.comparisonMode,
              numericTolerance: problem.numericTolerance,
              points: problem.points,
            })
            .where(eq(raceProblems.id, problemId));
          await transaction
            .delete(raceTestCases)
            .where(eq(raceTestCases.problemId, problemId));
        } else {
          await transaction.insert(raceProblems).values({
            id: problemId,
            raceId,
            orderIndex: index,
            title: problem.title,
            instructions: problem.instructions,
            language: problem.language,
            starterCode: problem.starterCode,
            referenceSolution: problem.referenceSolution,
            comparisonMode: problem.comparisonMode,
            numericTolerance: problem.numericTolerance,
            points: problem.points,
          });
        }
        await transaction.insert(raceTestCases).values(
          problem.testCases.map((testCase, testCaseIndex) => ({
            id: randomUUID(),
            problemId,
            stdin: testCase.stdin,
            expectedStdout: testCase.expectedStdout,
            isHidden: testCase.isHidden,
            showExpectedOutput: testCase.showExpectedOutput,
            orderIndex: testCaseIndex,
          })),
        );
      }

      const removedProblems = existingProblems.slice(input.problems.length);
      if (removedProblems.length > 0) {
        const removedIds = removedProblems.map((problem) => problem.id);
        const removedAttempts = await transaction
          .select({ id: raceProblemSubmissions.id })
          .from(raceProblemSubmissions)
          .where(inArray(raceProblemSubmissions.problemId, removedIds));
        if (removedAttempts.length > 0) {
          await transaction.delete(raceProblemSubmissions).where(
            inArray(
              raceProblemSubmissions.id,
              removedAttempts.map((row) => row.id),
            ),
          );
        }
        await transaction
          .delete(raceTestCases)
          .where(inArray(raceTestCases.problemId, removedIds));
        await transaction
          .delete(raceProblems)
          .where(inArray(raceProblems.id, removedIds));
      }
    });
    const updated = await this.getForTeacher(raceId, now);
    if (!updated) throw new Error("Race could not be reloaded.");
    return updated;
  }

  async listForTeacher(classId: string, now: Date) {
    const rows = await this.database
      .select({
        race: races,
        problemCount: problemCountSql,
        totalPoints: totalPointsSql,
        memberCount: memberCountSql,
        submittedCount: submittedCountSql,
      })
      .from(races)
      .where(eq(races.classId, classId))
      .orderBy(desc(races.createdAt));
    return rows.map((row) => ({
      id: row.race.id,
      classId: row.race.classId,
      title: row.race.title,
      durationMinutes: row.race.durationMinutes,
      opensAt: row.race.opensAt.toISOString(),
      closesAt: row.race.closesAt.toISOString(),
      status: row.race.status,
      availability: availabilityFor(
        row.race.status,
        row.race.opensAt,
        row.race.closesAt,
        now,
      ),
      totalPoints: Number(row.totalPoints),
      createdAt: row.race.createdAt.toISOString(),
      problemCount: Number(row.problemCount),
      memberCount: Number(row.memberCount),
      submittedCount: Number(row.submittedCount),
    }));
  }

  async listForStudent(classId: string, studentId: string, now: Date) {
    const rows = await this.database
      .select({
        race: races,
        problemCount: problemCountSql,
        totalPoints: totalPointsSql,
        attemptStatus: raceAttempts.status,
        violationCount: raceAttempts.violationCount,
      })
      .from(races)
      .leftJoin(
        raceAttempts,
        and(
          eq(raceAttempts.raceId, races.id),
          eq(raceAttempts.studentId, studentId),
        ),
      )
      .where(and(eq(races.classId, classId), eq(races.status, "open")))
      .orderBy(desc(races.createdAt));
    // A student's totalScore is the sum of their submitted problems' scores
    // — computed separately per race rather than joined here, since a
    // multi-row join against race_problem_submissions would multiply the
    // race_problems total-points subquery's rows. Cheap: at most one query
    // per race in this list, and this list is small (a class's races).
    const scored = await Promise.all(
      rows.map(async (row) => {
        if (!row.attemptStatus) return null;
        const [scoreRow] = await this.database
          .select({
            total: sql<number>`COALESCE(SUM(${raceProblemSubmissions.score}), 0)`,
          })
          .from(raceProblemSubmissions)
          .innerJoin(
            raceAttempts,
            eq(raceAttempts.id, raceProblemSubmissions.attemptId),
          )
          .where(
            and(
              eq(raceAttempts.raceId, row.race.id),
              eq(raceAttempts.studentId, studentId),
              eq(raceProblemSubmissions.submitted, true),
            ),
          );
        return applyViolationDeduction(
          Number(scoreRow?.total ?? 0),
          Number(row.totalPoints),
          row.violationCount ?? 0,
          RACE_ALLOWED_VIOLATIONS,
          RACE_VIOLATION_DEDUCTION_PERCENT,
        );
      }),
    );
    return rows.map((row, index) => ({
      id: row.race.id,
      classId: row.race.classId,
      title: row.race.title,
      durationMinutes: row.race.durationMinutes,
      opensAt: row.race.opensAt.toISOString(),
      closesAt: row.race.closesAt.toISOString(),
      status: row.race.status,
      availability: availabilityFor(
        row.race.status,
        row.race.opensAt,
        row.race.closesAt,
        now,
      ),
      totalPoints: Number(row.totalPoints),
      createdAt: row.race.createdAt.toISOString(),
      problemCount: Number(row.problemCount),
      attemptStatus: row.attemptStatus ?? null,
      totalScore: scored[index] ?? null,
    }));
  }

  async getForTeacher(raceId: string, now: Date) {
    const [row] = await this.database
      .select({
        race: races,
        totalPoints: totalPointsSql,
        memberCount: memberCountSql,
        submittedCount: submittedCountSql,
      })
      .from(races)
      .where(eq(races.id, raceId));
    if (!row) return null;
    const problemRows = await this.database
      .select()
      .from(raceProblems)
      .where(eq(raceProblems.raceId, raceId))
      .orderBy(asc(raceProblems.orderIndex));
    const testCaseRows = await this.database
      .select()
      .from(raceTestCases)
      .where(
        sql`${raceTestCases.problemId} IN (${sql.join(
          problemRows.map((problem) => sql`${problem.id}`),
          sql`, `,
        )})`,
      )
      .orderBy(asc(raceTestCases.orderIndex));
    const testCasesByProblem = new Map<
      string,
      (typeof raceTestCases.$inferSelect)[]
    >();
    for (const testCase of testCaseRows) {
      const list = testCasesByProblem.get(testCase.problemId) ?? [];
      list.push(testCase);
      testCasesByProblem.set(testCase.problemId, list);
    }
    return {
      id: row.race.id,
      classId: row.race.classId,
      title: row.race.title,
      durationMinutes: row.race.durationMinutes,
      opensAt: row.race.opensAt.toISOString(),
      closesAt: row.race.closesAt.toISOString(),
      status: row.race.status,
      availability: availabilityFor(
        row.race.status,
        row.race.opensAt,
        row.race.closesAt,
        now,
      ),
      totalPoints: Number(row.totalPoints),
      createdAt: row.race.createdAt.toISOString(),
      problems: problemRows.map((problem) =>
        toProblemForTeacher(problem, testCasesByProblem.get(problem.id) ?? []),
      ),
      memberCount: Number(row.memberCount),
      submittedCount: Number(row.submittedCount),
    };
  }

  // Student view — never returns referenceSolution or a hidden test case's
  // expectedStdout, the same architectural leak-prevention activity- and
  // quiz-repository already rely on (never selected into the mapped
  // response, not just omitted by schema).
  async getForStudent(raceId: string, studentId: string, now: Date) {
    const [race] = await this.database
      .select()
      .from(races)
      .where(and(eq(races.id, raceId), eq(races.status, "open")));
    if (!race) return null;
    const problemRows = await this.database
      .select()
      .from(raceProblems)
      .where(eq(raceProblems.raceId, raceId))
      .orderBy(asc(raceProblems.orderIndex));
    const totalPoints = problemRows.reduce(
      (total, problem) => total + problem.points,
      0,
    );
    const [attempt] = await this.database
      .select()
      .from(raceAttempts)
      .where(
        and(
          eq(raceAttempts.raceId, raceId),
          eq(raceAttempts.studentId, studentId),
        ),
      );
    let problemsForStudent: ReturnType<typeof toProblemForStudent>[] = [];
    if (attempt) {
      const testCaseRows = problemRows.length
        ? await this.database
            .select()
            .from(raceTestCases)
            .where(
              sql`${raceTestCases.problemId} IN (${sql.join(
                problemRows.map((problem) => sql`${problem.id}`),
                sql`, `,
              )})`,
            )
            .orderBy(asc(raceTestCases.orderIndex))
        : [];
      const submissionRows = await this.database
        .select()
        .from(raceProblemSubmissions)
        .where(eq(raceProblemSubmissions.attemptId, attempt.id));
      const submissionByProblem = new Map(
        submissionRows.map((submission) => [submission.problemId, submission]),
      );
      const testCasesByProblem = new Map<
        string,
        (typeof raceTestCases.$inferSelect)[]
      >();
      for (const testCase of testCaseRows) {
        const list = testCasesByProblem.get(testCase.problemId) ?? [];
        list.push(testCase);
        testCasesByProblem.set(testCase.problemId, list);
      }
      problemsForStudent = problemRows.map((problem) =>
        toProblemForStudent(
          problem,
          testCasesByProblem.get(problem.id) ?? [],
          submissionByProblem.get(problem.id),
        ),
      );
    }
    return {
      id: race.id,
      classId: race.classId,
      title: race.title,
      durationMinutes: race.durationMinutes,
      opensAt: race.opensAt.toISOString(),
      closesAt: race.closesAt.toISOString(),
      status: race.status,
      availability: availabilityFor(
        race.status,
        race.opensAt,
        race.closesAt,
        now,
      ),
      totalPoints,
      createdAt: race.createdAt.toISOString(),
      // Starting the attempt is the gate that reveals problem content —
      // same reasoning as quiz-repository's getForStudent, so a student
      // can't preview a timed race's problems before their clock begins.
      problems: problemsForStudent,
      attempt: attempt ? toAttempt(attempt, race) : null,
    };
  }

  // The single action that serves both "extend time" and "restart"
  // (teacher decision: restart never wipes scores) — pushes closesAt
  // forward and unconditionally reopens the race. No attempt/submission
  // data is touched.
  async updateSchedule(raceId: string, closesAt: Date) {
    await this.database
      .update(races)
      .set({ closesAt, status: "open" })
      .where(eq(races.id, raceId));
  }

  // Unlike quiz's leaderboard (submitted attempts only), this includes
  // every student who has started — "real time" progress is the point, so
  // an in-progress student's partial-credit score so far should already
  // show up, not just appear once they finish.
  async listRaceLeaderboard(raceId: string) {
    const [points] = await this.database
      .select({ total: sql<number>`COALESCE(SUM(${raceProblems.points}), 0)` })
      .from(raceProblems)
      .where(eq(raceProblems.raceId, raceId));
    const totalPoints = Number(points?.total ?? 0);
    const rows = await this.database
      .select({
        studentId: users.id,
        studentName: users.displayName,
        totalScore: sql<number>`COALESCE(SUM(CASE WHEN ${raceProblemSubmissions.submitted} = 1 THEN ${raceProblemSubmissions.score} ELSE 0 END), 0)`,
        // The join against race_problem_submissions fans out one
        // raceAttempts row per submission, but violationCount is constant
        // per student for this race — MAX just collapses the duplicates
        // without changing the value.
        violationCount: sql<number>`COALESCE(MAX(${raceAttempts.violationCount}), 0)`,
      })
      .from(raceAttempts)
      .innerJoin(users, eq(users.id, raceAttempts.studentId))
      .leftJoin(
        raceProblemSubmissions,
        eq(raceProblemSubmissions.attemptId, raceAttempts.id),
      )
      .where(eq(raceAttempts.raceId, raceId))
      .groupBy(users.id, users.displayName);
    return rows
      .map((row) => {
        const totalScore = applyViolationDeduction(
          Number(row.totalScore),
          totalPoints,
          Number(row.violationCount),
          RACE_ALLOWED_VIOLATIONS,
          RACE_VIOLATION_DEDUCTION_PERCENT,
        );
        return {
          studentId: row.studentId,
          studentName: row.studentName,
          totalScore,
          totalPoints,
          percentage:
            totalPoints > 0 ? Math.round((totalScore / totalPoints) * 100) : 0,
        };
      })
      .sort(
        (left, right) =>
          right.totalScore - left.totalScore ||
          left.studentName.localeCompare(right.studentName),
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  async listSubmissions(raceId: string, classId: string) {
    const problemRows = await this.database
      .select()
      .from(raceProblems)
      .where(eq(raceProblems.raceId, raceId))
      .orderBy(asc(raceProblems.orderIndex));
    const totalPoints = problemRows.reduce(
      (total, problem) => total + problem.points,
      0,
    );
    const testCaseCountRows =
      problemRows.length > 0
        ? await this.database
            .select({
              problemId: raceTestCases.problemId,
              count: sql<number>`COUNT(*)`,
            })
            .from(raceTestCases)
            .where(
              inArray(
                raceTestCases.problemId,
                problemRows.map((problem) => problem.id),
              ),
            )
            .groupBy(raceTestCases.problemId)
        : [];
    const testCaseCountByProblem = new Map(
      testCaseCountRows.map((row) => [row.problemId, Number(row.count)]),
    );

    const memberRows = await this.database
      .select({
        studentId: users.id,
        studentName: users.displayName,
        attemptId: raceAttempts.id,
        status: raceAttempts.status,
        startedAt: raceAttempts.startedAt,
        submittedAt: raceAttempts.submittedAt,
        violationCount: raceAttempts.violationCount,
      })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.studentId))
      .leftJoin(
        raceAttempts,
        and(
          eq(raceAttempts.raceId, raceId),
          eq(raceAttempts.studentId, classMembers.studentId),
        ),
      )
      .where(
        and(
          eq(classMembers.classId, classId),
          eq(classMembers.status, "active"),
        ),
      )
      .orderBy(asc(users.displayName));

    const attemptIds = memberRows
      .map((row) => row.attemptId)
      .filter((id): id is string => id !== null);
    const submissionRows =
      attemptIds.length > 0
        ? await this.database
            .select()
            .from(raceProblemSubmissions)
            .where(inArray(raceProblemSubmissions.attemptId, attemptIds))
        : [];
    const submissionsByAttempt = new Map<
      string,
      Map<string, typeof raceProblemSubmissions.$inferSelect>
    >();
    for (const submission of submissionRows) {
      const byProblem =
        submissionsByAttempt.get(submission.attemptId) ??
        new Map<string, typeof raceProblemSubmissions.$inferSelect>();
      byProblem.set(submission.problemId, submission);
      submissionsByAttempt.set(submission.attemptId, byProblem);
    }

    return memberRows.map((row) => {
      const byProblem = row.attemptId
        ? submissionsByAttempt.get(row.attemptId)
        : undefined;
      const problems = problemRows.map((problem) => {
        const submission = byProblem?.get(problem.id);
        return {
          problemId: problem.id,
          submitted: submission?.submitted ?? false,
          passedTestCaseCount: submission?.passedTestCaseCount ?? 0,
          totalTestCaseCount:
            submission?.totalTestCaseCount ??
            testCaseCountByProblem.get(problem.id) ??
            0,
          score: submission?.score ?? null,
          sourceCode: submission?.sourceCode ?? null,
        };
      });
      const rawScore = problems.reduce(
        (total, problem) =>
          total + (problem.submitted ? (problem.score ?? 0) : 0),
        0,
      );
      // The aggregate total is deducted for distractions; each problem's
      // individual score above stays raw so the teacher's per-problem
      // breakdown shows exactly what was earned on that problem.
      const totalScore = applyViolationDeduction(
        rawScore,
        totalPoints,
        row.violationCount ?? 0,
        RACE_ALLOWED_VIOLATIONS,
        RACE_VIOLATION_DEDUCTION_PERCENT,
      );
      return {
        studentId: row.studentId,
        studentName: row.studentName,
        attemptStatus: row.status ?? null,
        startedAt: row.startedAt?.toISOString() ?? null,
        submittedAt: row.submittedAt?.toISOString() ?? null,
        totalScore,
        violationCount: row.violationCount ?? 0,
        totalPoints,
        problems,
      };
    });
  }

  // Wipes one student's progress on this race so they can redo it —
  // deletes their race_problem_submissions (partial-credit scores must
  // not linger after a reset, unlike Activity's reset which only flips a
  // status flag) and resets their race_attempts row to a fresh
  // in_progress state with a new clock.
  async resetStudent(raceId: string, studentId: string, now: Date) {
    const [attempt] = await this.database
      .select({ id: raceAttempts.id })
      .from(raceAttempts)
      .where(
        and(
          eq(raceAttempts.raceId, raceId),
          eq(raceAttempts.studentId, studentId),
        ),
      );
    if (!attempt) return;
    await this.database
      .delete(raceProblemSubmissions)
      .where(eq(raceProblemSubmissions.attemptId, attempt.id));
    await this.database
      .update(raceAttempts)
      .set({
        status: "in_progress",
        startedAt: now,
        submittedAt: null,
        violationCount: 0,
      })
      .where(eq(raceAttempts.id, attempt.id));
  }

  async resetStudents(
    raceId: string,
    studentIds: readonly string[],
    now: Date,
  ) {
    if (studentIds.length === 0) return;
    await Promise.all(
      studentIds.map((studentId) => this.resetStudent(raceId, studentId, now)),
    );
  }

  // Scoped alternative to resetStudent — wipes only one problem's
  // submission, leaving every other problem's already-earned score
  // untouched. Also reopens the attempt (fresh in_progress status,
  // violations cleared) if it had already ended, since an ended attempt
  // locks every problem, including the one just reset; startedAt is left
  // alone since the deadline is the race's closesAt, not tied to it.
  async resetProblem(raceId: string, studentId: string, problemId: string) {
    const [attempt] = await this.database
      .select({ id: raceAttempts.id, status: raceAttempts.status })
      .from(raceAttempts)
      .where(
        and(
          eq(raceAttempts.raceId, raceId),
          eq(raceAttempts.studentId, studentId),
        ),
      );
    if (!attempt) return;
    await this.database
      .delete(raceProblemSubmissions)
      .where(
        and(
          eq(raceProblemSubmissions.attemptId, attempt.id),
          eq(raceProblemSubmissions.problemId, problemId),
        ),
      );
    if (attempt.status !== "in_progress") {
      await this.database
        .update(raceAttempts)
        .set({ status: "in_progress", submittedAt: null, violationCount: 0 })
        .where(eq(raceAttempts.id, attempt.id));
    }
  }
}
