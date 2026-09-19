import { z } from "zod";

import { codeLanguageSchema } from "./code-execution";

export const quizStatusSchema = z.enum(["draft", "open", "closed"]);
export type QuizStatus = z.infer<typeof quizStatusSchema>;

export const quizAvailabilitySchema = z.enum(["scheduled", "open", "closed"]);
export type QuizAvailability = z.infer<typeof quizAvailabilitySchema>;

// Chosen once at creation, immutable after — gates which question types a
// quiz's questions may use (see questionMatchesQuizType below). "lecture"
// is today's Google-Forms-style mcq/short_answer trivia; "code" is a
// code-snippet-as-question, code-snippets-as-choices multiple choice
// format, still graded by plain exact match, never executed.
export const quizTypeSchema = z.enum(["lecture", "code"]);
export type QuizType = z.infer<typeof quizTypeSchema>;

export const quizQuestionTypeSchema = z.enum([
  "mcq",
  "short_answer",
  "code_choice",
]);
export type QuizQuestionType = z.infer<typeof quizQuestionTypeSchema>;

export const quizAttemptStatusSchema = z.enum([
  "in_progress",
  "submitted",
  "timed_out",
]);
export type QuizAttemptStatus = z.infer<typeof quizAttemptStatusSchema>;

// Same policy as Activities'/Race's — a tab-switch or fullscreen-exit while
// a quiz attempt is in progress counts as one violation. The first
// QUIZ_ALLOWED_VIOLATIONS are free; every one beyond that deducts
// QUIZ_VIOLATION_DEDUCTION_PERCENT% of the quiz's total points from the
// final score (see applyViolationDeduction in ./violation-scoring).
// Violations never lock or end the attempt.
export const QUIZ_ALLOWED_VIOLATIONS = 5;
export const QUIZ_VIOLATION_DEDUCTION_PERCENT = 2.5;

export const quizViolationKindSchema = z.enum([
  "tab_switch",
  "fullscreen_exit",
]);
export type QuizViolationKind = z.infer<typeof quizViolationKindSchema>;

export const quizViolationRequestSchema = z.object({
  kind: quizViolationKindSchema,
});
export type QuizViolationRequest = z.infer<typeof quizViolationRequestSchema>;

const quizQuestionInputBaseSchema = z.object({
  questionText: z.string().trim().min(1).max(5_000),
  points: z.number().int().min(1).max(100).default(1),
});

export const quizQuestionInputSchema = z.discriminatedUnion("questionType", [
  quizQuestionInputBaseSchema
    .extend({
      questionType: z.literal("mcq"),
      options: z.array(z.string().trim().min(1).max(500)).min(2).max(10),
      correctAnswer: z.string().trim().min(1).max(500),
    })
    .superRefine((question, context) => {
      if (new Set(question.options).size !== question.options.length) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "Multiple-choice options must be unique.",
        });
      }
      if (!question.options.includes(question.correctAnswer)) {
        context.addIssue({
          code: "custom",
          path: ["correctAnswer"],
          message: "The correct answer must be one of the options.",
        });
      }
    }),
  quizQuestionInputBaseSchema.extend({
    questionType: z.literal("short_answer"),
    correctAnswer: z.string().trim().min(1).max(10_000),
  }),
  // Code Quiz's question type — the question itself is a code snippet
  // (questionText) in a specific language, and the choices are themselves
  // code snippets. Still graded by plain exact match against the stored
  // correct option, same as mcq — never executed.
  quizQuestionInputBaseSchema
    .extend({
      questionType: z.literal("code_choice"),
      language: codeLanguageSchema,
      options: z.array(z.string().trim().min(1).max(2_000)).min(2).max(10),
      correctAnswer: z.string().trim().min(1).max(2_000),
    })
    .superRefine((question, context) => {
      if (new Set(question.options).size !== question.options.length) {
        context.addIssue({
          code: "custom",
          path: ["options"],
          message: "Code answer choices must be unique.",
        });
      }
      if (!question.options.includes(question.correctAnswer)) {
        context.addIssue({
          code: "custom",
          path: ["correctAnswer"],
          message: "The correct answer must be one of the options.",
        });
      }
    }),
]);
export type QuizQuestionInput = z.infer<typeof quizQuestionInputSchema>;

// Lecture quizzes take mcq/short_answer questions; Code quizzes take only
// code_choice questions — enforced at both create and update time so a
// quiz's questions can never end up in a format its own workspace/preview
// rendering doesn't know how to show.
export function questionMatchesQuizType(
  question: Pick<QuizQuestionInput, "questionType">,
  quizType: QuizType,
): boolean {
  return quizType === "lecture"
    ? question.questionType === "mcq" ||
        question.questionType === "short_answer"
    : question.questionType === "code_choice";
}

export const quizCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    quizType: quizTypeSchema,
    durationMinutes: z.number().int().min(1).max(480),
    opensAt: z.iso.datetime({ offset: true }),
    closesAt: z.iso.datetime({ offset: true }),
    questions: z.array(quizQuestionInputSchema).min(1).max(100),
  })
  .refine(
    (quiz) =>
      new Date(quiz.closesAt).getTime() > new Date(quiz.opensAt).getTime(),
    { path: ["closesAt"], message: "Close time must be after open time." },
  )
  .superRefine((quiz, context) => {
    if (
      !quiz.questions.every((question) =>
        questionMatchesQuizType(question, quiz.quizType),
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message:
          quiz.quizType === "lecture"
            ? "A Lecture quiz's questions must all be multiple choice or short answer."
            : "A Code quiz's questions must all be code-choice.",
      });
    }
  });
export type QuizCreateRequest = z.infer<typeof quizCreateRequestSchema>;

// Full edit of a quiz's title/duration/questions — deliberately excludes
// opensAt/closesAt/status (the schedule endpoint's job, so extend/reopen
// and question edits never fight over the same request) and quizType
// (immutable after creation, so a quiz's authored question format can
// never drift from what its workspace/preview rendering expects).
export const quizUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  durationMinutes: z.number().int().min(1).max(480),
  questions: z.array(quizQuestionInputSchema).min(1).max(100),
});
export type QuizUpdateRequest = z.infer<typeof quizUpdateRequestSchema>;

export const quizScheduleUpdateRequestSchema = z.object({
  closesAt: z.iso.datetime({ offset: true }),
});
export type QuizScheduleUpdateRequest = z.infer<
  typeof quizScheduleUpdateRequestSchema
>;

export const quizQuestionForTeacherSchema = z.object({
  id: z.string().uuid(),
  questionText: z.string(),
  questionType: quizQuestionTypeSchema,
  language: codeLanguageSchema.nullable(),
  options: z.array(z.string()).nullable(),
  correctAnswer: z.string(),
  points: z.number().int().positive(),
  orderIndex: z.number().int().nonnegative(),
});
export type QuizQuestionForTeacher = z.infer<
  typeof quizQuestionForTeacherSchema
>;

export const quizQuestionForStudentSchema = quizQuestionForTeacherSchema.omit({
  correctAnswer: true,
});
export type QuizQuestionForStudent = z.infer<
  typeof quizQuestionForStudentSchema
>;

export const quizAttemptSchema = z.object({
  id: z.string().uuid(),
  status: quizAttemptStatusSchema,
  startedAt: z.iso.datetime({ offset: true }),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  deadlineAt: z.iso.datetime({ offset: true }),
  score: z.number().int().nonnegative().nullable(),
  violationCount: z.number().int().nonnegative(),
});
export type QuizAttempt = z.infer<typeof quizAttemptSchema>;

export const quizViolationResponseSchema = z.object({
  attempt: quizAttemptSchema,
});
export type QuizViolationResponse = z.infer<typeof quizViolationResponseSchema>;

export const quizAnswerResultSchema = z.object({
  questionId: z.string().uuid(),
  response: z.string(),
  isCorrect: z.boolean(),
  pointsAwarded: z.number().int().nonnegative(),
  // Only ever populated once the attempt is terminal — never sent while a
  // question could still be answered, so a wrong guess can't be turned
  // into a lookup of the right one mid-attempt.
  correctAnswer: z.string(),
});
export type QuizAnswerResult = z.infer<typeof quizAnswerResultSchema>;

const quizBaseSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  title: z.string(),
  quizType: quizTypeSchema,
  durationMinutes: z.number().int().positive(),
  opensAt: z.iso.datetime({ offset: true }),
  closesAt: z.iso.datetime({ offset: true }),
  status: quizStatusSchema,
  availability: quizAvailabilitySchema,
  totalPoints: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const quizForTeacherSchema = quizBaseSchema.extend({
  questions: z.array(quizQuestionForTeacherSchema),
  memberCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
});
export type QuizForTeacher = z.infer<typeof quizForTeacherSchema>;

export const quizForStudentSchema = quizBaseSchema.extend({
  questions: z.array(quizQuestionForStudentSchema),
  attempt: quizAttemptSchema.nullable(),
  // Populated once the attempt is terminal (submitted/timed_out) so a
  // reload after submitting still shows the review — null while the
  // attempt is still in progress or hasn't started.
  answerResults: z.array(quizAnswerResultSchema).nullable(),
});
export type QuizForStudent = z.infer<typeof quizForStudentSchema>;

export const quizSummaryForTeacherSchema = quizBaseSchema.extend({
  questionCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
});
export type QuizSummaryForTeacher = z.infer<typeof quizSummaryForTeacherSchema>;

export const quizSummaryForStudentSchema = quizBaseSchema.extend({
  questionCount: z.number().int().nonnegative(),
  attemptStatus: quizAttemptStatusSchema.nullable(),
  score: z.number().int().nonnegative().nullable(),
});
export type QuizSummaryForStudent = z.infer<typeof quizSummaryForStudentSchema>;

export const quizAnswerInputSchema = z.object({
  questionId: z.string().uuid(),
  response: z.string().max(10_000),
});

export const quizSubmitRequestSchema = z
  .object({ answers: z.array(quizAnswerInputSchema).max(100) })
  .superRefine((submission, context) => {
    const ids = submission.answers.map((answer) => answer.questionId);
    if (new Set(ids).size !== ids.length) {
      context.addIssue({
        code: "custom",
        path: ["answers"],
        message: "Each question may only be answered once.",
      });
    }
  });
export type QuizSubmitRequest = z.infer<typeof quizSubmitRequestSchema>;

export const quizSubmissionResultSchema = z.object({
  attempt: quizAttemptSchema,
  answers: z.array(quizAnswerResultSchema),
  totalPoints: z.number().int().nonnegative(),
});
export type QuizSubmissionResult = z.infer<typeof quizSubmissionResultSchema>;

export const quizSubmissionSchema = z.object({
  studentId: z.string().uuid(),
  studentName: z.string(),
  status: z.enum(["not_started", "in_progress", "submitted", "timed_out"]),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  score: z.number().int().nonnegative().nullable(),
  totalPoints: z.number().int().nonnegative(),
  violationCount: z.number().int().nonnegative(),
});
export type QuizSubmission = z.infer<typeof quizSubmissionSchema>;

export const quizLeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  score: z.number().int().nonnegative(),
  totalPoints: z.number().int().nonnegative(),
});
export type QuizLeaderboardEntry = z.infer<typeof quizLeaderboardEntrySchema>;

export const quizBulkResetRequestSchema = z
  .object({
    studentIds: z.array(z.string().uuid()).min(1).max(100),
  })
  .superRefine((request, context) => {
    if (new Set(request.studentIds).size !== request.studentIds.length) {
      context.addIssue({
        code: "custom",
        path: ["studentIds"],
        message: "Each student may only be reset once.",
      });
    }
  });
export type QuizBulkResetRequest = z.infer<typeof quizBulkResetRequestSchema>;

// Drafts a whole set of quiz questions from a short brief via an LLM,
// never auto-saved — always an editable starting point in the quiz form.
// Unlike Activity's generator, the count is never teacher-specified: the
// AI decides how many questions the brief's scope calls for (capped at 20
// as a safety net, never surfaced as a dial). One flat generated-question
// shape covers both quiz types — Lecture generation always produces mcq
// (never short_answer, whose exact-match grading is too brittle to trust
// to AI-authored phrasing), Code generation produces code_choice — so the
// OpenAI call never needs a oneOf/discriminated-union JSON schema.
export const quizGenerateRequestSchema = z
  .object({
    topic: z.string().trim().min(1).max(8_000),
    quizType: quizTypeSchema,
    language: codeLanguageSchema.optional(),
    difficulty: z
      .enum(["beginner", "intermediate", "advanced"])
      .default("beginner"),
  })
  .superRefine((request, context) => {
    if (request.quizType === "code" && !request.language) {
      context.addIssue({
        code: "custom",
        path: ["language"],
        message: "A language is required to generate Code Quiz questions.",
      });
    }
  });
export type QuizGenerateRequest = z.infer<typeof quizGenerateRequestSchema>;

export const quizGeneratedQuestionSchema = z.object({
  questionText: z.string(),
  options: z.array(z.string()).min(2).max(6),
  correctAnswer: z.string(),
});
export type QuizGeneratedQuestion = z.infer<typeof quizGeneratedQuestionSchema>;

export const quizGenerateResponseSchema = z.object({
  title: z.string(),
  questions: z.array(quizGeneratedQuestionSchema).min(1).max(20),
});
export type QuizGenerateResponse = z.infer<typeof quizGenerateResponseSchema>;
