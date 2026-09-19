import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { QuizForStudent, QuizForTeacher } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { QuizService } from "./quiz-service";
import type { QuizRepository, QuizServiceDependencies } from "./quiz-types";

const classId = "00000000-0000-4000-8000-000000000020";
const quizId = "00000000-0000-4000-8000-000000000030";
const attemptId = "00000000-0000-4000-8000-000000000040";
const questionId = "00000000-0000-4000-8000-000000000050";
const now = new Date("2026-09-10T01:00:00.000Z");

const teacher: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "teacher",
  email: "teacher@example.edu",
  displayName: "Ms. Teacher",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["teacher"],
  sectionId: null,
  authorizationVersion: 1,
};

const student: AccountProfile = {
  ...teacher,
  id: "00000000-0000-4000-8000-000000000011",
  firebaseUid: "student",
  email: "student@example.edu",
  displayName: "A. Student",
  roles: ["student"],
};

const teacherIdentity: VerifiedIdentity = {
  uid: teacher.firebaseUid,
  email: teacher.email,
  emailVerified: true,
};
const studentIdentity: VerifiedIdentity = {
  uid: student.firebaseUid,
  email: student.email,
  emailVerified: true,
};

const quizForTeacher: QuizForTeacher = {
  id: quizId,
  classId,
  title: "Basics",
  quizType: "lecture",
  durationMinutes: 30,
  opensAt: "2026-09-10T00:00:00.000Z",
  closesAt: "2026-09-10T02:00:00.000Z",
  status: "open",
  availability: "open",
  totalPoints: 5,
  createdAt: "2026-09-09T00:00:00.000Z",
  questions: [
    {
      id: questionId,
      questionText: "Pick A",
      questionType: "mcq",
      language: null,
      options: ["A", "B"],
      correctAnswer: "A",
      points: 5,
      orderIndex: 0,
    },
  ],
  memberCount: 1,
  submittedCount: 0,
};

const quizForStudent: QuizForStudent = {
  ...quizForTeacher,
  questions: quizForTeacher.questions.map((question) => ({
    id: question.id,
    questionText: question.questionText,
    questionType: question.questionType,
    language: question.language,
    options: question.options,
    points: question.points,
    orderIndex: question.orderIndex,
  })),
  attempt: {
    id: attemptId,
    status: "in_progress",
    startedAt: "2026-09-10T00:45:00.000Z",
    submittedAt: null,
    deadlineAt: "2026-09-10T02:00:00.000Z",
    score: null,
    violationCount: 0,
  },
  answerResults: null,
};

describe("QuizService", () => {
  let repository: QuizRepository;
  let getAccess: ReturnType<
    typeof vi.fn<
      (
        classId: string,
        userId: string,
      ) => Promise<{ isTeacher: boolean; isActiveMember: boolean } | null>
    >
  >;
  let audit: AuditSink;
  let service: QuizService;

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(quizForTeacher),
      listForTeacher: vi.fn().mockResolvedValue([]),
      listForStudent: vi.fn().mockResolvedValue([]),
      getForTeacher: vi.fn().mockResolvedValue(quizForTeacher),
      getForStudent: vi.fn().mockResolvedValue(quizForStudent),
      findClassId: vi.fn().mockResolvedValue(classId),
      startAttempt: vi.fn().mockResolvedValue({
        id: attemptId,
        status: "in_progress",
        startedAt: now,
        submittedAt: null,
        score: null,
        violationCount: 0,
      }),
      markAttemptTimedOut: vi.fn().mockResolvedValue(undefined),
      submitAttempt: vi.fn().mockResolvedValue(true),
      listSubmissions: vi.fn().mockResolvedValue([]),
      listQuizLeaderboard: vi.fn().mockResolvedValue([]),
      remove: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(quizForTeacher),
      updateSchedule: vi.fn().mockResolvedValue(undefined),
      resetAttempt: vi.fn().mockResolvedValue(undefined),
      resetAttempts: vi.fn().mockResolvedValue(undefined),
      recordViolation: vi.fn().mockResolvedValue(1),
    };
    getAccess = vi
      .fn()
      .mockResolvedValue({ isTeacher: false, isActiveMember: true });
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    const dependencies: QuizServiceDependencies = {
      identity: {
        requireActiveAccount: vi.fn(async (identity) =>
          identity.uid === teacherIdentity.uid ? teacher : student,
        ),
      },
      classes: { getAccess },
      quizzes: repository,
      audit,
      now: () => now,
    };
    service = new QuizService(dependencies);
  });

  it("lets the class teacher create a scheduled quiz", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    await service.createQuiz(teacherIdentity, classId, {
      title: "Basics",
      quizType: "lecture",
      durationMinutes: 30,
      opensAt: "2026-09-10T01:30:00.000Z",
      closesAt: "2026-09-10T03:00:00.000Z",
      questions: [
        {
          questionText: "Pick A",
          questionType: "mcq",
          options: ["A", "B"],
          correctAnswer: "A",
          points: 5,
        },
      ],
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ classId, title: "Basics" }),
      now,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "quiz.created", targetId: quizId }),
    );
  });

  it("rejects a quiz whose close time is already past", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    await expect(
      service.createQuiz(teacherIdentity, classId, {
        title: "Old quiz",
        quizType: "lecture",
        durationMinutes: 10,
        opensAt: "2026-09-09T00:00:00.000Z",
        closesAt: "2026-09-09T01:00:00.000Z",
        questions: [
          {
            questionText: "Answer",
            questionType: "short_answer",
            correctAnswer: "yes",
            points: 1,
          },
        ],
      }),
    ).rejects.toThrow("close time must be in the future");
  });

  it("returns the existing in-progress attempt without resetting its timer", async () => {
    const attempt = await service.startAttempt(studentIdentity, quizId);
    expect(attempt.id).toBe(attemptId);
    expect(repository.startAttempt).not.toHaveBeenCalled();
  });

  it("scores exact answers and fills omitted answers with an empty response", async () => {
    const result = await service.submitAttempt(studentIdentity, quizId, {
      answers: [{ questionId, response: "A" }],
    });
    expect(result.attempt.score).toBe(5);
    expect(result.answers[0]).toMatchObject({
      questionId,
      isCorrect: true,
      pointsAwarded: 5,
    });
    expect(repository.submitAttempt).toHaveBeenCalledWith(
      expect.objectContaining({ attemptId, score: 5 }),
    );
  });

  it("deducts points for violations over the allowance", async () => {
    repository.getForStudent = vi.fn().mockResolvedValue({
      ...quizForStudent,
      attempt: { ...quizForStudent.attempt!, violationCount: 9 }, // 4 excess
    });
    const result = await service.submitAttempt(studentIdentity, quizId, {
      answers: [{ questionId, response: "A" }],
    });
    // totalPoints 5 * 2.5% * 4 excess = 0.5 -> rounds to 1 point off.
    expect(result.attempt.score).toBe(4);
    // Per-question points stay raw/undeducted.
    expect(result.answers[0]).toMatchObject({ pointsAwarded: 5 });
  });

  it("includes the correct answer in the review even when the response was wrong", async () => {
    const result = await service.submitAttempt(studentIdentity, quizId, {
      answers: [{ questionId, response: "B" }],
    });
    expect(result.answers[0]).toMatchObject({
      isCorrect: false,
      correctAnswer: "A",
    });
  });

  it("rejects answers for a question outside the quiz", async () => {
    await expect(
      service.submitAttempt(studentIdentity, quizId, {
        answers: [
          {
            questionId: "00000000-0000-4000-8000-000000000099",
            response: "A",
          },
        ],
      }),
    ).rejects.toThrow("outside this quiz");
    expect(repository.submitAttempt).not.toHaveBeenCalled();
  });

  it("marks a late attempt timed out and never scores it", async () => {
    // The deadline is the quiz's own closesAt now (synced, not a personal
    // per-student timer) — so simulating "already past deadline" means
    // moving closesAt itself into the past relative to `now`.
    repository.getForStudent = vi.fn().mockResolvedValue({
      ...quizForStudent,
      closesAt: "2026-09-10T00:59:59.000Z",
      attempt: {
        ...quizForStudent.attempt!,
        deadlineAt: "2026-09-10T00:59:59.000Z",
      },
    });
    await expect(
      service.submitAttempt(studentIdentity, quizId, { answers: [] }),
    ).rejects.toThrow("deadline has passed");
    expect(repository.markAttemptTimedOut).toHaveBeenCalledWith(attemptId);
    expect(repository.submitAttempt).not.toHaveBeenCalled();
  });

  it("allows any active class participant to view the leaderboard", async () => {
    await service.getLeaderboard(studentIdentity, quizId);
    expect(repository.listQuizLeaderboard).toHaveBeenCalledWith(quizId);
  });

  describe("updateQuiz", () => {
    const request = {
      title: "Basics v2",
      durationMinutes: 45,
      questions: quizForTeacher.questions.map((question) => ({
        questionText: question.questionText,
        questionType: question.questionType as "mcq",
        options: question.options ?? [],
        correctAnswer: question.correctAnswer,
        points: question.points,
      })),
    };

    it("rejects a student", async () => {
      await expect(
        service.updateQuiz(studentIdentity, quizId, request),
      ).rejects.toThrow();
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("rejects questions that don't match the quiz's type", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      repository.getForTeacher = vi
        .fn()
        .mockResolvedValue({ ...quizForTeacher, quizType: "code" });
      await expect(
        service.updateQuiz(teacherIdentity, quizId, request),
      ).rejects.toThrow("Code quiz");
      expect(repository.update).not.toHaveBeenCalled();
    });

    it("updates the quiz and audits the action", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.updateQuiz(teacherIdentity, quizId, request);
      expect(repository.update).toHaveBeenCalledWith(
        quizId,
        expect.objectContaining({ title: "Basics v2" }),
        now,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "quiz.updated" }),
      );
    });
  });

  describe("deleteQuiz", () => {
    it("rejects a student", async () => {
      await expect(
        service.deleteQuiz(studentIdentity, quizId),
      ).rejects.toThrow();
      expect(repository.remove).not.toHaveBeenCalled();
    });

    it("deletes the quiz and audits the action", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.deleteQuiz(teacherIdentity, quizId);
      expect(repository.remove).toHaveBeenCalledWith(quizId);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "quiz.deleted" }),
      );
    });
  });

  describe("updateSchedule", () => {
    it("rejects a student", async () => {
      await expect(
        service.updateSchedule(studentIdentity, quizId, {
          closesAt: "2026-09-11T00:00:00.000Z",
        }),
      ).rejects.toThrow();
      expect(repository.updateSchedule).not.toHaveBeenCalled();
    });

    it("rejects a close time that isn't in the future", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await expect(
        service.updateSchedule(teacherIdentity, quizId, {
          closesAt: "2026-09-09T00:00:00.000Z",
        }),
      ).rejects.toThrow("must be in the future");
      expect(repository.updateSchedule).not.toHaveBeenCalled();
    });

    it("extends the close time, reopens the quiz, and syncs every attempt's deadline", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      const extended = "2026-09-11T00:00:00.000Z";
      repository.getForTeacher = vi
        .fn()
        .mockResolvedValue({ ...quizForTeacher, closesAt: extended });
      const updated = await service.updateSchedule(teacherIdentity, quizId, {
        closesAt: extended,
      });
      expect(repository.updateSchedule).toHaveBeenCalledWith(
        quizId,
        new Date(extended),
      );
      // The deadline-model fix: deadlineAt is derived directly from
      // closesAt, so extending it here is reflected for every attempt
      // without any per-attempt duration cap getting in the way.
      expect(updated.closesAt).toBe(extended);
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "quiz.schedule_updated" }),
      );
    });
  });

  describe("resetAttempt/resetAttempts", () => {
    it("rejects a student", async () => {
      await expect(
        service.resetAttempt(studentIdentity, quizId, student.id),
      ).rejects.toThrow();
      expect(repository.resetAttempt).not.toHaveBeenCalled();
    });

    it("resets a single student's attempt and audits the action", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.resetAttempt(teacherIdentity, quizId, student.id);
      expect(repository.resetAttempt).toHaveBeenCalledWith(
        quizId,
        student.id,
        now,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "quiz.attempt_reset" }),
      );
    });

    it("bulk-resets the given students and audits the action", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.resetAttempts(teacherIdentity, quizId, {
        studentIds: [student.id],
      });
      expect(repository.resetAttempts).toHaveBeenCalledWith(
        quizId,
        [student.id],
        now,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "quiz.attempts_bulk_reset" }),
      );
    });
  });

  describe("recordViolation", () => {
    it("increments the running count for an in-progress attempt", async () => {
      repository.recordViolation = vi.fn().mockResolvedValue(2);
      const result = await service.recordViolation(studentIdentity, quizId, {
        kind: "tab_switch",
      });
      expect(repository.recordViolation).toHaveBeenCalledWith(attemptId);
      expect(result.attempt.violationCount).toBe(2);
      expect(result.attempt.status).toBe("in_progress");
      expect(repository.markAttemptTimedOut).not.toHaveBeenCalled();
    });

    it("never times out the attempt no matter how many violations accrue", async () => {
      repository.recordViolation = vi.fn().mockResolvedValue(12);
      const result = await service.recordViolation(studentIdentity, quizId, {
        kind: "fullscreen_exit",
      });
      expect(repository.markAttemptTimedOut).not.toHaveBeenCalled();
      expect(result.attempt.status).toBe("in_progress");
      expect(result.attempt.violationCount).toBe(12);
    });

    it("returns the current state without incrementing once an attempt has already ended", async () => {
      repository.getForStudent = vi.fn().mockResolvedValue({
        ...quizForStudent,
        attempt: { ...quizForStudent.attempt!, status: "submitted" },
      });
      const result = await service.recordViolation(studentIdentity, quizId, {
        kind: "tab_switch",
      });
      expect(repository.recordViolation).not.toHaveBeenCalled();
      expect(result.attempt.status).toBe("submitted");
    });
  });
});
