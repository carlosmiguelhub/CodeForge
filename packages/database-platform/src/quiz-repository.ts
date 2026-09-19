import { randomUUID } from "node:crypto";

import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import {
  classMembers,
  platformSchema,
  quizAnswers,
  quizAttempts,
  quizQuestions,
  quizzes,
  users,
} from "./schema";

type Database = MySql2Database<typeof platformSchema>;

// Explicit table-qualified raw SQL, not interpolated Column objects — see
// the matching comment in activity-repository.ts. Interpolating e.g.
// `${quizzes.id}` renders unqualified whenever the outer select has no
// JOIN, and MySQL then silently resolves it against the subquery's own
// table instead of the outer one, making the correlation always false.
const questionCountSql = sql<number>`(
  SELECT COUNT(*) FROM quiz_questions
  WHERE quiz_questions.quiz_id = quizzes.id
)`;

const totalPointsSql = sql<number>`(
  SELECT COALESCE(SUM(quiz_questions.points), 0) FROM quiz_questions
  WHERE quiz_questions.quiz_id = quizzes.id
)`;

const memberCountSql = sql<number>`(
  SELECT COUNT(*) FROM class_members
  WHERE class_members.class_id = quizzes.class_id AND class_members.status = 'active'
)`;

const submittedCountSql = sql<number>`(
  SELECT COUNT(*) FROM quiz_attempts
  WHERE quiz_attempts.quiz_id = quizzes.id AND quiz_attempts.status = 'submitted'
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

function toQuestionForTeacher(row: typeof quizQuestions.$inferSelect) {
  return {
    id: row.id,
    questionText: row.questionText,
    questionType: row.questionType,
    language: row.language ?? null,
    options: row.options ?? null,
    correctAnswer: row.correctAnswer,
    points: row.points,
    orderIndex: row.orderIndex,
  };
}

// A tiny string hash (FNV-1a) feeding a seeded PRNG (mulberry32) — good
// enough to deterministically shuffle a handful of options, not a
// cryptographic requirement. Seeded per student+question so: (a) the same
// student sees the same order every reload of the same attempt (not
// confusing), and (b) different students see different orders (so "the
// answer is C" doesn't transfer across a class the way a fixed order
// would). Never applied to the teacher's own view, which always shows
// options in their authored order.
function hashSeed(input: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function shuffleDeterministic<T>(items: readonly T[], seed: string): T[] {
  let state = hashSeed(seed);
  function nextRandom() {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex]!,
      shuffled[index]!,
    ];
  }
  return shuffled;
}

function toQuestionForStudent(
  row: typeof quizQuestions.$inferSelect,
  studentId: string,
) {
  return {
    id: row.id,
    questionText: row.questionText,
    questionType: row.questionType,
    language: row.language ?? null,
    options: row.options
      ? shuffleDeterministic(row.options, `${studentId}:${row.id}`)
      : null,
    points: row.points,
    orderIndex: row.orderIndex,
  };
}

// The deadline is simply the quiz's closesAt — every student shares one
// synchronized deadline (a late starter gets correspondingly less time),
// and a teacher's "Extend time" schedule update (which only ever moves
// closesAt) takes effect for everyone immediately, with nothing capping
// it back down. durationMinutes is purely nominal/display, not a second
// ceiling — same fix already applied to Race's attempt deadline.
function toAttempt(
  row: typeof quizAttempts.$inferSelect,
  quiz: { closesAt: Date },
) {
  return {
    id: row.id,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    submittedAt: row.submittedAt?.toISOString() ?? null,
    deadlineAt: quiz.closesAt.toISOString(),
    score: row.score,
    violationCount: row.violationCount,
  };
}

export class MySqlQuizRepository {
  constructor(private readonly database: Database) {}

  async findClassId(quizId: string) {
    const [row] = await this.database
      .select({ classId: quizzes.classId })
      .from(quizzes)
      .where(eq(quizzes.id, quizId));
    return row?.classId ?? null;
  }

  async create(
    input: {
      classId: string;
      title: string;
      quizType: "lecture" | "code";
      durationMinutes: number;
      opensAt: Date;
      closesAt: Date;
      questions: readonly {
        questionText: string;
        questionType: "mcq" | "short_answer" | "code_choice";
        language?: (typeof quizQuestions.$inferInsert)["language"];
        options?: readonly string[];
        correctAnswer: string;
        points: number;
      }[];
    },
    now: Date,
  ) {
    const quizId = randomUUID();
    await this.database.transaction(async (transaction) => {
      await transaction.insert(quizzes).values({
        id: quizId,
        classId: input.classId,
        title: input.title,
        quizType: input.quizType,
        durationMinutes: input.durationMinutes,
        opensAt: input.opensAt,
        closesAt: input.closesAt,
        status: "open",
      });
      await transaction.insert(quizQuestions).values(
        input.questions.map((question, index) => ({
          id: randomUUID(),
          quizId,
          questionText: question.questionText,
          questionType: question.questionType,
          language:
            question.questionType === "code_choice"
              ? (question.language ?? null)
              : null,
          options:
            question.questionType === "mcq" ||
            question.questionType === "code_choice"
              ? [...(question.options ?? [])]
              : null,
          correctAnswer: question.correctAnswer,
          points: question.points,
          orderIndex: index,
        })),
      );
    });
    const created = await this.getForTeacher(quizId, now);
    if (!created) throw new Error("Quiz could not be reloaded.");
    return created;
  }

  async listForTeacher(classId: string, now: Date) {
    const rows = await this.database
      .select({
        quiz: quizzes,
        questionCount: questionCountSql,
        totalPoints: totalPointsSql,
        memberCount: memberCountSql,
        submittedCount: submittedCountSql,
      })
      .from(quizzes)
      .where(eq(quizzes.classId, classId))
      .orderBy(desc(quizzes.createdAt));
    return rows.map((row) => ({
      id: row.quiz.id,
      classId: row.quiz.classId,
      title: row.quiz.title,
      quizType: row.quiz.quizType,
      durationMinutes: row.quiz.durationMinutes,
      opensAt: row.quiz.opensAt.toISOString(),
      closesAt: row.quiz.closesAt.toISOString(),
      status: row.quiz.status,
      availability: availabilityFor(
        row.quiz.status,
        row.quiz.opensAt,
        row.quiz.closesAt,
        now,
      ),
      totalPoints: Number(row.totalPoints),
      createdAt: row.quiz.createdAt.toISOString(),
      questionCount: Number(row.questionCount),
      memberCount: Number(row.memberCount),
      submittedCount: Number(row.submittedCount),
    }));
  }

  async listForStudent(classId: string, studentId: string, now: Date) {
    const rows = await this.database
      .select({
        quiz: quizzes,
        questionCount: questionCountSql,
        totalPoints: totalPointsSql,
        attemptStatus: quizAttempts.status,
        score: quizAttempts.score,
      })
      .from(quizzes)
      .leftJoin(
        quizAttempts,
        and(
          eq(quizAttempts.quizId, quizzes.id),
          eq(quizAttempts.studentId, studentId),
        ),
      )
      .where(and(eq(quizzes.classId, classId), eq(quizzes.status, "open")))
      .orderBy(desc(quizzes.createdAt));
    return rows.map((row) => ({
      id: row.quiz.id,
      classId: row.quiz.classId,
      title: row.quiz.title,
      quizType: row.quiz.quizType,
      durationMinutes: row.quiz.durationMinutes,
      opensAt: row.quiz.opensAt.toISOString(),
      closesAt: row.quiz.closesAt.toISOString(),
      status: row.quiz.status,
      availability: availabilityFor(
        row.quiz.status,
        row.quiz.opensAt,
        row.quiz.closesAt,
        now,
      ),
      totalPoints: Number(row.totalPoints),
      createdAt: row.quiz.createdAt.toISOString(),
      questionCount: Number(row.questionCount),
      attemptStatus: row.attemptStatus ?? null,
      score: row.score,
    }));
  }

  async getForTeacher(quizId: string, now: Date) {
    const [row] = await this.database
      .select({
        quiz: quizzes,
        totalPoints: totalPointsSql,
        memberCount: memberCountSql,
        submittedCount: submittedCountSql,
      })
      .from(quizzes)
      .where(eq(quizzes.id, quizId));
    if (!row) return null;
    const questions = await this.database
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.orderIndex));
    return {
      id: row.quiz.id,
      classId: row.quiz.classId,
      title: row.quiz.title,
      quizType: row.quiz.quizType,
      durationMinutes: row.quiz.durationMinutes,
      opensAt: row.quiz.opensAt.toISOString(),
      closesAt: row.quiz.closesAt.toISOString(),
      status: row.quiz.status,
      availability: availabilityFor(
        row.quiz.status,
        row.quiz.opensAt,
        row.quiz.closesAt,
        now,
      ),
      totalPoints: Number(row.totalPoints),
      createdAt: row.quiz.createdAt.toISOString(),
      questions: questions.map(toQuestionForTeacher),
      memberCount: Number(row.memberCount),
      submittedCount: Number(row.submittedCount),
    };
  }

  async getForStudent(quizId: string, studentId: string, now: Date) {
    const [quiz] = await this.database
      .select()
      .from(quizzes)
      .where(and(eq(quizzes.id, quizId), eq(quizzes.status, "open")));
    if (!quiz) return null;
    const questions = await this.database
      .select()
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId))
      .orderBy(asc(quizQuestions.orderIndex));
    const [attempt] = await this.database
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quizId),
          eq(quizAttempts.studentId, studentId),
        ),
      );
    const terminal =
      attempt?.status === "submitted" || attempt?.status === "timed_out";
    const answerRows = terminal
      ? await this.database
          .select()
          .from(quizAnswers)
          .where(eq(quizAnswers.quizAttemptId, attempt.id))
      : [];
    const correctAnswerByQuestion = new Map(
      questions.map((question) => [question.id, question.correctAnswer]),
    );
    return {
      id: quiz.id,
      classId: quiz.classId,
      title: quiz.title,
      quizType: quiz.quizType,
      durationMinutes: quiz.durationMinutes,
      opensAt: quiz.opensAt.toISOString(),
      closesAt: quiz.closesAt.toISOString(),
      status: quiz.status,
      availability: availabilityFor(
        quiz.status,
        quiz.opensAt,
        quiz.closesAt,
        now,
      ),
      totalPoints: questions.reduce(
        (total, question) => total + question.points,
        0,
      ),
      createdAt: quiz.createdAt.toISOString(),
      // Starting the attempt is the gate that reveals quiz content. This
      // prevents students from previewing timed questions before their clock
      // begins while still allowing the summary endpoint to show a count.
      questions: attempt
        ? questions.map((question) => toQuestionForStudent(question, studentId))
        : [],
      attempt: attempt ? toAttempt(attempt, quiz) : null,
      // Only populated once the attempt is terminal — a reload after
      // submitting still shows the review, not just the immediate
      // post-submit response.
      answerResults: terminal
        ? answerRows.map((row) => ({
            questionId: row.questionId,
            response: row.response,
            isCorrect: row.isCorrect,
            pointsAwarded: row.pointsAwarded,
            correctAnswer: correctAnswerByQuestion.get(row.questionId) ?? "",
          }))
        : null,
    };
  }

  async startAttempt(quizId: string, studentId: string, startedAt: Date) {
    await this.database
      .insert(quizAttempts)
      .values({ id: randomUUID(), quizId, studentId, startedAt })
      .onDuplicateKeyUpdate({ set: { quizId } });
    const [attempt] = await this.database
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quizId),
          eq(quizAttempts.studentId, studentId),
        ),
      );
    if (!attempt) throw new Error("Quiz attempt could not be reloaded.");
    return attempt;
  }

  async markAttemptTimedOut(attemptId: string) {
    await this.database
      .update(quizAttempts)
      .set({ status: "timed_out" })
      .where(
        and(
          eq(quizAttempts.id, attemptId),
          eq(quizAttempts.status, "in_progress"),
        ),
      );
  }

  async submitAttempt(input: {
    attemptId: string;
    submittedAt: Date;
    score: number;
    answers: readonly {
      questionId: string;
      response: string;
      isCorrect: boolean;
      pointsAwarded: number;
    }[];
  }) {
    return this.database.transaction(async (transaction) => {
      const updateResult = await transaction
        .update(quizAttempts)
        .set({
          status: "submitted",
          submittedAt: input.submittedAt,
          score: input.score,
        })
        .where(
          and(
            eq(quizAttempts.id, input.attemptId),
            eq(quizAttempts.status, "in_progress"),
          ),
        );
      const affectedRows = Number(
        (updateResult[0] as { affectedRows?: number }).affectedRows ?? 0,
      );
      if (affectedRows === 0) return false;
      await transaction.insert(quizAnswers).values(
        input.answers.map((answer) => ({
          id: randomUUID(),
          quizAttemptId: input.attemptId,
          questionId: answer.questionId,
          response: answer.response,
          isCorrect: answer.isCorrect,
          pointsAwarded: answer.pointsAwarded,
        })),
      );
      return true;
    });
  }

  async listSubmissions(quizId: string, classId: string) {
    const [points] = await this.database
      .select({ total: sql<number>`COALESCE(SUM(${quizQuestions.points}), 0)` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));
    const totalPoints = Number(points?.total ?? 0);
    const rows = await this.database
      .select({
        studentId: users.id,
        studentName: users.displayName,
        status: quizAttempts.status,
        startedAt: quizAttempts.startedAt,
        submittedAt: quizAttempts.submittedAt,
        score: quizAttempts.score,
        violationCount: quizAttempts.violationCount,
      })
      .from(classMembers)
      .innerJoin(users, eq(users.id, classMembers.studentId))
      .leftJoin(
        quizAttempts,
        and(
          eq(quizAttempts.quizId, quizId),
          eq(quizAttempts.studentId, classMembers.studentId),
        ),
      )
      .where(
        and(
          eq(classMembers.classId, classId),
          eq(classMembers.status, "active"),
        ),
      )
      .orderBy(asc(users.displayName));
    return rows.map((row) => ({
      studentId: row.studentId,
      studentName: row.studentName,
      status: row.status ?? ("not_started" as const),
      startedAt: row.startedAt?.toISOString() ?? null,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      score: row.score,
      totalPoints,
      violationCount: row.violationCount ?? 0,
    }));
  }

  async listQuizLeaderboard(quizId: string) {
    const [points] = await this.database
      .select({ total: sql<number>`COALESCE(SUM(${quizQuestions.points}), 0)` })
      .from(quizQuestions)
      .where(eq(quizQuestions.quizId, quizId));
    const totalPoints = Number(points?.total ?? 0);
    const rows = await this.database
      .select({
        studentId: users.id,
        studentName: users.displayName,
        score: quizAttempts.score,
      })
      .from(quizAttempts)
      .innerJoin(users, eq(users.id, quizAttempts.studentId))
      .where(
        and(
          eq(quizAttempts.quizId, quizId),
          eq(quizAttempts.status, "submitted"),
        ),
      );
    return rows
      .map((row) => ({
        studentId: row.studentId,
        studentName: row.studentName,
        score: row.score ?? 0,
        totalPoints,
      }))
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.studentName.localeCompare(right.studentName),
      )
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  // Children before parents — quiz_answers FK-restricts both quiz_attempts
  // and quiz_questions, so it must be cleared before either.
  async remove(quizId: string) {
    await this.database.transaction(async (transaction) => {
      const attempts = await transaction
        .select({ id: quizAttempts.id })
        .from(quizAttempts)
        .where(eq(quizAttempts.quizId, quizId));
      const attemptIds = attempts.map((row) => row.id);
      if (attemptIds.length > 0) {
        await transaction
          .delete(quizAnswers)
          .where(inArray(quizAnswers.quizAttemptId, attemptIds));
        await transaction
          .delete(quizAttempts)
          .where(eq(quizAttempts.quizId, quizId));
      }
      await transaction
        .delete(quizQuestions)
        .where(eq(quizQuestions.quizId, quizId));
      await transaction.delete(quizzes).where(eq(quizzes.id, quizId));
    });
  }

  // Full edit of title/duration/questions — never touches quizType or the
  // schedule (opensAt/closesAt/status), which stay updateSchedule's job.
  // Existing questions are matched to the new list by position and updated
  // in place (never replacing the row id, since quiz_answers.question_id
  // FK-restricts it); positions beyond the new list are removed, deleting
  // their quiz_answers first.
  async update(
    quizId: string,
    input: {
      title: string;
      durationMinutes: number;
      questions: readonly {
        questionText: string;
        questionType: "mcq" | "short_answer" | "code_choice";
        language?: (typeof quizQuestions.$inferInsert)["language"];
        options?: readonly string[];
        correctAnswer: string;
        points: number;
      }[];
    },
    now: Date,
  ) {
    await this.database.transaction(async (transaction) => {
      await transaction
        .update(quizzes)
        .set({ title: input.title, durationMinutes: input.durationMinutes })
        .where(eq(quizzes.id, quizId));

      const existingQuestions = await transaction
        .select({ id: quizQuestions.id })
        .from(quizQuestions)
        .where(eq(quizQuestions.quizId, quizId))
        .orderBy(asc(quizQuestions.orderIndex));

      for (const [index, question] of input.questions.entries()) {
        const existing = existingQuestions[index];
        const options =
          question.questionType === "mcq" ||
          question.questionType === "code_choice"
            ? [...(question.options ?? [])]
            : null;
        const language =
          question.questionType === "code_choice"
            ? (question.language ?? null)
            : null;
        if (existing) {
          await transaction
            .update(quizQuestions)
            .set({
              orderIndex: index,
              questionText: question.questionText,
              questionType: question.questionType,
              language,
              options,
              correctAnswer: question.correctAnswer,
              points: question.points,
            })
            .where(eq(quizQuestions.id, existing.id));
        } else {
          await transaction.insert(quizQuestions).values({
            id: randomUUID(),
            quizId,
            orderIndex: index,
            questionText: question.questionText,
            questionType: question.questionType,
            language,
            options,
            correctAnswer: question.correctAnswer,
            points: question.points,
          });
        }
      }

      const removedQuestions = existingQuestions.slice(input.questions.length);
      if (removedQuestions.length > 0) {
        const removedIds = removedQuestions.map((question) => question.id);
        await transaction
          .delete(quizAnswers)
          .where(inArray(quizAnswers.questionId, removedIds));
        await transaction
          .delete(quizQuestions)
          .where(inArray(quizQuestions.id, removedIds));
      }
    });
    const updated = await this.getForTeacher(quizId, now);
    if (!updated) throw new Error("Quiz could not be reloaded.");
    return updated;
  }

  // The single action that serves both "extend time" and "reopen" — pushes
  // closesAt forward and unconditionally reopens the quiz. No attempt/
  // answer data is touched.
  async updateSchedule(quizId: string, closesAt: Date) {
    await this.database
      .update(quizzes)
      .set({ closesAt, status: "open" })
      .where(eq(quizzes.id, quizId));
  }

  // Wipes one student's progress so they can redo the quiz — deletes their
  // quiz_answers (partial credit must not linger after a reset) and resets
  // their quiz_attempts row to a fresh in_progress state with a new clock.
  async resetAttempt(quizId: string, studentId: string, now: Date) {
    const [attempt] = await this.database
      .select({ id: quizAttempts.id })
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.quizId, quizId),
          eq(quizAttempts.studentId, studentId),
        ),
      );
    if (!attempt) return;
    await this.database
      .delete(quizAnswers)
      .where(eq(quizAnswers.quizAttemptId, attempt.id));
    await this.database
      .update(quizAttempts)
      .set({
        status: "in_progress",
        startedAt: now,
        submittedAt: null,
        score: null,
        violationCount: 0,
      })
      .where(eq(quizAttempts.id, attempt.id));
  }

  async resetAttempts(
    quizId: string,
    studentIds: readonly string[],
    now: Date,
  ) {
    if (studentIds.length === 0) return;
    await Promise.all(
      studentIds.map((studentId) => this.resetAttempt(quizId, studentId, now)),
    );
  }

  async recordViolation(attemptId: string): Promise<number> {
    await this.database
      .update(quizAttempts)
      .set({ violationCount: sql`${quizAttempts.violationCount} + 1` })
      .where(eq(quizAttempts.id, attemptId));
    const [row] = await this.database
      .select({ violationCount: quizAttempts.violationCount })
      .from(quizAttempts)
      .where(eq(quizAttempts.id, attemptId));
    return row?.violationCount ?? 0;
  }
}
