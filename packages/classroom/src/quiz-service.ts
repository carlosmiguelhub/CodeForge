import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import {
  QUIZ_ALLOWED_VIOLATIONS,
  QUIZ_VIOLATION_DEDUCTION_PERCENT,
  applyViolationDeduction,
  questionMatchesQuizType,
  type QuizBulkResetRequest,
  type QuizCreateRequest,
  type QuizForStudent,
  type QuizScheduleUpdateRequest,
  type QuizSubmitRequest,
  type QuizUpdateRequest,
  type QuizViolationRequest,
} from "@sqweb/contracts";

import type { QuizAttemptRecord, QuizServiceDependencies } from "./quiz-types";

// Every student shares one synchronized deadline — the quiz's closesAt.
// A late starter gets correspondingly less time, and a teacher's "Extend
// time" schedule update (which only ever moves closesAt) takes effect for
// everyone immediately, with nothing capping it back down. Same fix
// already applied to Race's attempt deadline this session.
function toAttempt(attempt: QuizAttemptRecord, quiz: QuizForStudent) {
  return {
    id: attempt.id,
    status: attempt.status,
    startedAt: attempt.startedAt.toISOString(),
    submittedAt: attempt.submittedAt?.toISOString() ?? null,
    deadlineAt: quiz.closesAt,
    score: attempt.score,
    violationCount: attempt.violationCount,
  };
}

export class QuizService {
  constructor(private readonly dependencies: QuizServiceDependencies) {}

  private now() {
    return this.dependencies.now?.() ?? new Date();
  }

  async createQuiz(
    identity: VerifiedIdentity,
    classId: string,
    request: QuizCreateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const access = await this.dependencies.classes.getAccess(classId, actor.id);
    if (!access) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    if (!access.isTeacher) {
      throw new AuthorizationError(
        "PERMISSION_DENIED",
        "Only this class's teacher can post a quiz.",
        403,
      );
    }
    const now = this.now();
    if (new Date(request.closesAt).getTime() <= now.getTime()) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "The quiz close time must be in the future.",
        400,
      );
    }
    const created = await this.dependencies.quizzes.create(
      {
        classId,
        title: request.title,
        quizType: request.quizType,
        durationMinutes: request.durationMinutes,
        opensAt: new Date(request.opensAt),
        closesAt: new Date(request.closesAt),
        questions: request.questions,
      },
      now,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "quiz.created",
      targetId: created.id,
      result: "succeeded",
    });
    return created;
  }

  async listForClass(identity: VerifiedIdentity, classId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const access = await this.dependencies.classes.getAccess(classId, actor.id);
    if (!access || (!access.isTeacher && !access.isActiveMember)) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    const now = this.now();
    return access.isTeacher
      ? this.dependencies.quizzes.listForTeacher(classId, now)
      : this.dependencies.quizzes.listForStudent(classId, actor.id, now);
  }

  async getDetail(identity: VerifiedIdentity, quizId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const { access } = await this.requireAccessibleClass(quizId, actor.id);
    const now = this.now();
    const detail = access?.isTeacher
      ? await this.dependencies.quizzes.getForTeacher(quizId, now)
      : await this.dependencies.quizzes.getForStudent(quizId, actor.id, now);
    if (!detail || (!access?.isTeacher && detail.status === "draft")) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    return detail;
  }

  async startAttempt(identity: VerifiedIdentity, quizId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student"],
    );
    const quiz = await this.getStudentQuiz(quizId, actor.id);
    const now = this.now();
    const opensAt = new Date(quiz.opensAt).getTime();
    const closesAt = new Date(quiz.closesAt).getTime();
    if (
      quiz.status !== "open" ||
      now.getTime() < opensAt ||
      now.getTime() >= closesAt
    ) {
      throw new AuthorizationError(
        "QUIZ_NOT_AVAILABLE",
        now.getTime() < opensAt
          ? "This quiz has not opened yet."
          : "This quiz is closed.",
        409,
      );
    }
    if (quiz.attempt) {
      if (quiz.attempt.status !== "in_progress") {
        throw new AuthorizationError(
          "QUIZ_ATTEMPT_LOCKED",
          "This quiz attempt has already ended.",
          409,
        );
      }
      return quiz.attempt;
    }
    const attempt = await this.dependencies.quizzes.startAttempt(
      quizId,
      actor.id,
      now,
    );
    return toAttempt(attempt, quiz);
  }

  async submitAttempt(
    identity: VerifiedIdentity,
    quizId: string,
    request: QuizSubmitRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student"],
    );
    const quiz = await this.getStudentQuiz(quizId, actor.id);
    if (!quiz.attempt) {
      throw new AuthorizationError(
        "QUIZ_NOT_AVAILABLE",
        "Start the quiz before submitting answers.",
        409,
      );
    }
    if (quiz.attempt.status !== "in_progress") {
      throw new AuthorizationError(
        "QUIZ_ATTEMPT_LOCKED",
        "This quiz attempt has already ended.",
        409,
      );
    }

    const now = this.now();
    if (
      quiz.status !== "open" ||
      now.getTime() >= new Date(quiz.closesAt).getTime()
    ) {
      await this.dependencies.quizzes.markAttemptTimedOut(quiz.attempt.id);
      throw new AuthorizationError(
        "QUIZ_TIME_EXPIRED",
        "The submission deadline has passed.",
        409,
      );
    }

    const questionsById = new Map(
      quiz.questions.map((question) => [question.id, question]),
    );
    for (const answer of request.answers) {
      if (!questionsById.has(answer.questionId)) {
        throw new AuthorizationError(
          "VALIDATION_FAILED",
          "An answer refers to a question outside this quiz.",
          400,
        );
      }
    }
    const submittedByQuestion = new Map(
      request.answers.map((answer) => [answer.questionId, answer.response]),
    );
    const teacherQuiz = await this.dependencies.quizzes.getForTeacher(
      quizId,
      now,
    );
    if (!teacherQuiz) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    const results = teacherQuiz.questions.map((question) => {
      const response = submittedByQuestion.get(question.id) ?? "";
      const isCorrect = response === question.correctAnswer;
      return {
        questionId: question.id,
        response,
        isCorrect,
        // Per-question points stay raw/undeducted — same as Race's
        // per-problem scores — so a review always shows exactly what was
        // earned on that question. Only the aggregate score below is
        // reduced for distractions.
        pointsAwarded: isCorrect ? question.points : 0,
        correctAnswer: question.correctAnswer,
      };
    });
    const rawScore = results.reduce(
      (total, answer) => total + answer.pointsAwarded,
      0,
    );
    const score = applyViolationDeduction(
      rawScore,
      quiz.totalPoints,
      quiz.attempt.violationCount,
      QUIZ_ALLOWED_VIOLATIONS,
      QUIZ_VIOLATION_DEDUCTION_PERCENT,
    );
    const submitted = await this.dependencies.quizzes.submitAttempt({
      attemptId: quiz.attempt.id,
      submittedAt: now,
      score,
      answers: results,
    });
    if (!submitted) {
      throw new AuthorizationError(
        "QUIZ_ATTEMPT_LOCKED",
        "This quiz attempt has already ended.",
        409,
      );
    }
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "quiz.submitted",
      targetId: quiz.attempt.id,
      result: "succeeded",
    });
    return {
      attempt: {
        ...quiz.attempt,
        status: "submitted" as const,
        submittedAt: now.toISOString(),
        score,
      },
      answers: results,
      totalPoints: quiz.totalPoints,
    };
  }

  async listSubmissions(identity: VerifiedIdentity, quizId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const classId = await this.requireTeacher(quizId, actor.id);
    return this.dependencies.quizzes.listSubmissions(quizId, classId);
  }

  async getLeaderboard(identity: VerifiedIdentity, quizId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    await this.requireAccessibleClass(quizId, actor.id);
    return this.dependencies.quizzes.listQuizLeaderboard(quizId);
  }

  // Full edit — title/duration/questions, same "always editable, no draft
  // gate" precedent as Activity's/Race's updateActivity/updateRace. Never
  // touches opensAt/closesAt/status (the schedule endpoint's job) or
  // quizType (immutable after creation).
  async updateQuiz(
    identity: VerifiedIdentity,
    quizId: string,
    request: QuizUpdateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(quizId, actor.id);
    const now = this.now();
    const current = await this.dependencies.quizzes.getForTeacher(quizId, now);
    if (!current) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    if (
      !request.questions.every((question) =>
        questionMatchesQuizType(question, current.quizType),
      )
    ) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        current.quizType === "lecture"
          ? "A Lecture quiz's questions must all be multiple choice or short answer."
          : "A Code quiz's questions must all be code-choice.",
        400,
      );
    }
    const updated = await this.dependencies.quizzes.update(
      quizId,
      {
        title: request.title,
        durationMinutes: request.durationMinutes,
        questions: request.questions,
      },
      now,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "quiz.updated",
      targetId: quizId,
      result: "succeeded",
    });
    return updated;
  }

  async deleteQuiz(identity: VerifiedIdentity, quizId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(quizId, actor.id);
    await this.dependencies.quizzes.remove(quizId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "quiz.deleted",
      targetId: quizId,
      result: "succeeded",
    });
  }

  // The single action that serves both "extend time" and "reopen" — sets
  // closesAt and unconditionally sets status back to "open". No
  // attempt/answer data is touched.
  async updateSchedule(
    identity: VerifiedIdentity,
    quizId: string,
    request: QuizScheduleUpdateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(quizId, actor.id);
    const now = this.now();
    if (new Date(request.closesAt).getTime() <= now.getTime()) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "The close time must be in the future.",
        400,
      );
    }
    await this.dependencies.quizzes.updateSchedule(
      quizId,
      new Date(request.closesAt),
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "quiz.schedule_updated",
      targetId: quizId,
      result: "succeeded",
    });
    const updated = await this.dependencies.quizzes.getForTeacher(quizId, now);
    if (!updated) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    return updated;
  }

  // Wipes one student's progress so they can redo the quiz — the "make a
  // specific student re-answer" action, always an explicit teacher choice.
  async resetAttempt(
    identity: VerifiedIdentity,
    quizId: string,
    studentId: string,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(quizId, actor.id);
    await this.dependencies.quizzes.resetAttempt(quizId, studentId, this.now());
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "quiz.attempt_reset",
      targetId: `${quizId}:${studentId}`,
      result: "succeeded",
    });
  }

  async resetAttempts(
    identity: VerifiedIdentity,
    quizId: string,
    request: QuizBulkResetRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(quizId, actor.id);
    await this.dependencies.quizzes.resetAttempts(
      quizId,
      request.studentIds,
      this.now(),
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "quiz.attempts_bulk_reset",
      targetId: quizId,
      result: "succeeded",
    });
  }

  // Same strike-recording shape as Activity's/Race's recordViolation.
  // Never locks or ends the attempt — it only ever records the strike; the
  // eventual score is reduced once violationCount exceeds the allowance
  // (see submitAttempt above).
  async recordViolation(
    identity: VerifiedIdentity,
    quizId: string,
    request: QuizViolationRequest,
  ) {
    void request; // kind is informational only, same as Race's usage.
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student"],
    );
    const quiz = await this.getStudentQuiz(quizId, actor.id);
    if (!quiz.attempt) {
      throw new AuthorizationError(
        "QUIZ_NOT_AVAILABLE",
        "Start the quiz before reporting a violation.",
        409,
      );
    }
    if (quiz.attempt.status !== "in_progress") {
      return { attempt: quiz.attempt };
    }
    const violationCount = await this.dependencies.quizzes.recordViolation(
      quiz.attempt.id,
    );
    return { attempt: { ...quiz.attempt, violationCount } };
  }

  private async requireAccessibleClass(quizId: string, actorId: string) {
    const classId = await this.dependencies.quizzes.findClassId(quizId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actorId);
    if (!access || (!access.isTeacher && !access.isActiveMember)) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    return { classId, access };
  }

  private async requireTeacher(quizId: string, actorId: string) {
    const classId = await this.dependencies.quizzes.findClassId(quizId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actorId);
    if (!access?.isTeacher) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    return classId;
  }

  private async getStudentQuiz(quizId: string, studentId: string) {
    const { access } = await this.requireAccessibleClass(quizId, studentId);
    if (!access?.isActiveMember || access.isTeacher) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    const quiz = await this.dependencies.quizzes.getForStudent(
      quizId,
      studentId,
      this.now(),
    );
    if (!quiz || quiz.status === "draft") {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Quiz not found.",
        404,
      );
    }
    return quiz;
  }
}
