import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type {
  QuizAnswerResult,
  QuizForStudent,
  QuizForTeacher,
  QuizLeaderboardEntry,
  QuizQuestionInput,
  QuizSubmission,
  QuizSummaryForStudent,
  QuizSummaryForTeacher,
  QuizType,
} from "@sqweb/contracts";

export interface QuizAttemptRecord {
  id: string;
  status: "in_progress" | "submitted" | "timed_out";
  startedAt: Date;
  submittedAt: Date | null;
  score: number | null;
  violationCount: number;
}

export interface QuizRepository {
  create(
    input: {
      classId: string;
      title: string;
      quizType: QuizType;
      durationMinutes: number;
      opensAt: Date;
      closesAt: Date;
      questions: readonly QuizQuestionInput[];
    },
    now: Date,
  ): Promise<QuizForTeacher>;
  listForTeacher(
    classId: string,
    now: Date,
  ): Promise<readonly QuizSummaryForTeacher[]>;
  listForStudent(
    classId: string,
    studentId: string,
    now: Date,
  ): Promise<readonly QuizSummaryForStudent[]>;
  getForTeacher(quizId: string, now: Date): Promise<QuizForTeacher | null>;
  getForStudent(
    quizId: string,
    studentId: string,
    now: Date,
  ): Promise<QuizForStudent | null>;
  findClassId(quizId: string): Promise<string | null>;
  remove(quizId: string): Promise<void>;
  update(
    quizId: string,
    input: {
      title: string;
      durationMinutes: number;
      questions: readonly QuizQuestionInput[];
    },
    now: Date,
  ): Promise<QuizForTeacher>;
  updateSchedule(quizId: string, closesAt: Date): Promise<void>;
  startAttempt(
    quizId: string,
    studentId: string,
    startedAt: Date,
  ): Promise<QuizAttemptRecord>;
  markAttemptTimedOut(attemptId: string): Promise<void>;
  submitAttempt(input: {
    attemptId: string;
    submittedAt: Date;
    score: number;
    answers: readonly QuizAnswerResult[];
  }): Promise<boolean>;
  listSubmissions(
    quizId: string,
    classId: string,
  ): Promise<readonly QuizSubmission[]>;
  listQuizLeaderboard(quizId: string): Promise<readonly QuizLeaderboardEntry[]>;
  resetAttempt(quizId: string, studentId: string, now: Date): Promise<void>;
  resetAttempts(
    quizId: string,
    studentIds: readonly string[],
    now: Date,
  ): Promise<void>;
  recordViolation(attemptId: string): Promise<number>;
}

export interface QuizServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  classes: {
    getAccess(
      classId: string,
      userId: string,
    ): Promise<{ isTeacher: boolean; isActiveMember: boolean } | null>;
  };
  quizzes: QuizRepository;
  audit: AuditSink;
  now?: () => Date;
}
