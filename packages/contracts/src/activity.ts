import { z } from "zod";

import { codeLanguageSchema } from "./code-execution";

export const activityComparisonModeSchema = z.enum([
  "normalized_exact",
  "token",
  "numeric",
  // Passes as long as the program's (normalized) output ENDS WITH the
  // expected text — anything printed before that (a prompt like "Enter a
  // number: ") is allowed and ignored. Lets a program prompt for input
  // without teachers having to reproduce that exact prompt text in every
  // expectedStdout.
  "suffix_exact",
]);
export type ActivityComparisonMode = z.infer<
  typeof activityComparisonModeSchema
>;

export const activityTestCaseInputSchema = z.object({
  stdin: z.string().max(10_000),
  // Empty output is intentional and valid for exercises that should finish
  // silently. Do not trim here: the grader owns comparison normalization.
  expectedStdout: z.string().max(10_000),
  isHidden: z.boolean().optional(),
  showExpectedOutput: z.boolean().optional(),
});
export type ActivityTestCaseInput = z.infer<typeof activityTestCaseInputSchema>;

// Teacher-facing test case — includes the answer key.
export const activityTestCaseSchema = activityTestCaseInputSchema.extend({
  id: z.string().uuid(),
  // Defaults keep a newly deployed client compatible with an API process
  // that is still finishing a rolling restart.
  isHidden: z.boolean().default(false),
  showExpectedOutput: z.boolean().default(false),
  orderIndex: z.number().int().nonnegative(),
});
export type ActivityTestCase = z.infer<typeof activityTestCaseSchema>;

// Student-facing test case — the input only, never the expected output.
export const activityTestCasePreviewSchema = z.object({
  id: z.string().uuid(),
  stdin: z.string().nullable(),
  expectedStdout: z.string().nullable().default(null),
  isHidden: z.boolean().default(false),
  orderIndex: z.number().int().nonnegative(),
});
export type ActivityTestCasePreview = z.infer<
  typeof activityTestCasePreviewSchema
>;

export const activityAttemptStatusSchema = z.enum([
  "in_progress",
  "passed",
  "submitted_incomplete",
  "zeroed_violation",
]);
export type ActivityAttemptStatus = z.infer<typeof activityAttemptStatusSchema>;

// A tab-switch or fullscreen-exit while an activity attempt is in progress
// counts as one violation. The first ACTIVITY_ALLOWED_VIOLATIONS are free;
// every one beyond that deducts ACTIVITY_VIOLATION_DEDUCTION_PERCENT% of
// the activity's total points from the final score (see
// applyViolationDeduction in ./violation-scoring). Violations never lock
// or force-end the attempt — shared so the client's strike counter and the
// server's scoring never drift apart.
export const ACTIVITY_ALLOWED_VIOLATIONS = 5;
export const ACTIVITY_VIOLATION_DEDUCTION_PERCENT = 2.5;

export const activityAttemptSchema = z.object({
  status: activityAttemptStatusSchema,
  violationCount: z.number().int().nonnegative(),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  score: z.number().int().nonnegative().nullable(),
  // The student's own most recently tested/submitted source — safe to
  // return to them (it's their own code), null until their first "Test
  // Code" or "Submit". Lets the workspace reopen with what they last
  // wrote instead of resetting to starterCode every visit.
  sourceCode: z.string().nullable(),
});
export type ActivityAttempt = z.infer<typeof activityAttemptSchema>;

export const activityViolationKindSchema = z.enum([
  "tab_switch",
  "fullscreen_exit",
]);
export type ActivityViolationKind = z.infer<typeof activityViolationKindSchema>;

export const activityViolationSchema = z.object({
  id: z.string().uuid(),
  kind: activityViolationKindSchema,
  occurredAt: z.iso.datetime({ offset: true }),
});
export type ActivityViolation = z.infer<typeof activityViolationSchema>;

export const activityViolationRequestSchema = z.object({
  kind: activityViolationKindSchema,
});
export type ActivityViolationRequest = z.infer<
  typeof activityViolationRequestSchema
>;

// Advisory-only "this submission might be hardcoded" signal, teacher-facing
// only — never returned from the student's own testCode()/submitAttempt()
// responses, and never changes grading. See ActivityGradingService's
// detectInputIgnored/detectOutputInvariant for how these are produced.
export const activityIntegrityFlagKindSchema = z.enum([
  "input_ignored",
  "output_invariant",
]);
export type ActivityIntegrityFlagKind = z.infer<
  typeof activityIntegrityFlagKindSchema
>;

export const activityIntegrityFlagSchema = z.object({
  id: z.string().uuid(),
  kind: activityIntegrityFlagKindSchema,
  testCaseId: z.string().uuid().nullable(),
  message: z.string(),
  detectedAt: z.iso.datetime({ offset: true }),
});
export type ActivityIntegrityFlag = z.infer<typeof activityIntegrityFlagSchema>;

// Teacher's view of a posted activity — includes the answer key.
export const activitySchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  title: z.string().min(1).max(160),
  instructions: z.string().min(1).max(20_000),
  language: codeLanguageSchema,
  starterCode: z.string().max(20_000).nullable(),
  // Teacher-only — an optional model solution used to verify the answer key
  // at authoring time. Never present on activityForStudentSchema.
  referenceSolution: z.string().max(20_000).nullable().default(null),
  allowRetake: z.boolean(),
  comparisonMode: activityComparisonModeSchema.default("suffix_exact"),
  numericTolerance: z.number().positive().nullable().default(null),
  points: z.number().int().positive().default(100),
  // deadlineAt/locked are the two raw, independent controls a teacher sets;
  // isLocked is the server-computed effective state (locked OR the deadline
  // has passed) every surface should actually gate on, so the client never
  // has to re-derive "is it locked" from its own possibly-skewed clock.
  deadlineAt: z.iso.datetime({ offset: true }).nullable().default(null),
  locked: z.boolean().default(false),
  isLocked: z.boolean().default(false),
  createdAt: z.iso.datetime({ offset: true }),
  testCases: z.array(activityTestCaseSchema),
  memberCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  zeroedCount: z.number().int().nonnegative(),
});
export type Activity = z.infer<typeof activitySchema>;

// Student's view of the same activity — no answer keys, plus their own
// attempt (null before their first "Run Test Cases" click).
export const activityForStudentSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  title: z.string(),
  instructions: z.string(),
  language: codeLanguageSchema,
  starterCode: z.string().nullable(),
  allowRetake: z.boolean(),
  comparisonMode: activityComparisonModeSchema.default("suffix_exact"),
  numericTolerance: z.number().positive().nullable().default(null),
  points: z.number().int().positive().default(100),
  deadlineAt: z.iso.datetime({ offset: true }).nullable().default(null),
  isLocked: z.boolean().default(false),
  createdAt: z.iso.datetime({ offset: true }),
  testCases: z.array(activityTestCasePreviewSchema),
  attempt: activityAttemptSchema.nullable(),
});
export type ActivityForStudent = z.infer<typeof activityForStudentSchema>;

export const activitySummaryForTeacherSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  language: codeLanguageSchema,
  testCaseCount: z.number().int().nonnegative(),
  points: z.number().int().positive().default(100),
  deadlineAt: z.iso.datetime({ offset: true }).nullable().default(null),
  isLocked: z.boolean().default(false),
  createdAt: z.iso.datetime({ offset: true }),
  memberCount: z.number().int().nonnegative(),
  passedCount: z.number().int().nonnegative(),
  zeroedCount: z.number().int().nonnegative(),
});
export type ActivitySummaryForTeacher = z.infer<
  typeof activitySummaryForTeacherSchema
>;

export const activitySummaryForStudentSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  language: codeLanguageSchema,
  testCaseCount: z.number().int().nonnegative(),
  points: z.number().int().positive().default(100),
  deadlineAt: z.iso.datetime({ offset: true }).nullable().default(null),
  isLocked: z.boolean().default(false),
  createdAt: z.iso.datetime({ offset: true }),
  attemptStatus: activityAttemptStatusSchema.nullable(),
  score: z.number().int().nonnegative().nullable(),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ActivitySummaryForStudent = z.infer<
  typeof activitySummaryForStudentSchema
>;

export const activityCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    instructions: z.string().trim().min(1).max(20_000),
    language: codeLanguageSchema,
    starterCode: z.string().max(20_000).optional(),
    referenceSolution: z.string().max(20_000).optional(),
    allowRetake: z.boolean(),
    comparisonMode: activityComparisonModeSchema.optional(),
    numericTolerance: z.number().positive().max(1_000_000).optional(),
    points: z.number().int().min(1).max(1_000).optional(),
    // Optional and nullable — omitted/null means no deadline, same as
    // every activity behaved before this existed. Only checked for being
    // in the future at create time; editing an already-past deadline via
    // this same request shape is allowed (a teacher fixing test cases on a
    // closed activity shouldn't be forced to also touch the schedule) —
    // the dedicated schedule endpoint is what enforces "must be future".
    deadlineAt: z.iso.datetime({ offset: true }).nullable().optional(),
    testCases: z.array(activityTestCaseInputSchema).min(1).max(20),
  })
  .superRefine((activity, context) => {
    if (activity.comparisonMode === "numeric" && !activity.numericTolerance) {
      context.addIssue({
        code: "custom",
        path: ["numericTolerance"],
        message: "Numeric comparison requires a positive tolerance.",
      });
    }
    if (
      activity.comparisonMode !== "numeric" &&
      activity.numericTolerance !== undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["numericTolerance"],
        message: "Numeric tolerance is only used by numeric comparison.",
      });
    }
    activity.testCases.forEach((testCase, index) => {
      if (testCase.isHidden && testCase.showExpectedOutput) {
        context.addIssue({
          code: "custom",
          path: ["testCases", index, "showExpectedOutput"],
          message: "A hidden test cannot reveal its expected output.",
        });
      }
      if (activity.comparisonMode === "numeric") {
        const output = testCase.expectedStdout.trim();
        const tokens = output === "" ? [] : output.split(/\s+/);
        if (tokens.some((token) => !Number.isFinite(Number(token)))) {
          context.addIssue({
            code: "custom",
            path: ["testCases", index, "expectedStdout"],
            message:
              "Numeric comparison answer keys may only contain numbers separated by whitespace.",
          });
        }
      }
    });
  });
export type ActivityCreateRequest = z.infer<typeof activityCreateRequestSchema>;

// The teacher's quick deadline control (separate from the full edit form)
// — same "extend and reopen in one action" precedent as Race's schedule
// endpoint: setting a new deadline here also unconditionally clears the
// manual `locked` flag, since re-locking a still-in-the-past deadline
// would just immediately relock it. Pass deadlineAt: null to remove the
// deadline entirely (the activity then only locks via the manual toggle).
export const activityScheduleUpdateRequestSchema = z.object({
  deadlineAt: z.iso.datetime({ offset: true }).nullable(),
});
export type ActivityScheduleUpdateRequest = z.infer<
  typeof activityScheduleUpdateRequestSchema
>;

export const activityTestRunRequestSchema = z.object({
  sourceCode: z.string().min(1).max(100_000),
});
export type ActivityTestRunRequest = z.infer<
  typeof activityTestRunRequestSchema
>;

export const activityTestRunResultSchema = z.object({
  testCaseId: z.string().uuid(),
  passed: z.boolean(),
  actualStdout: z.string().nullable(),
  status: z.enum([
    "passed",
    "wrong_answer",
    "compile_error",
    "runtime_error",
    "time_limit_exceeded",
    "judge_error",
    "not_run",
  ]),
  message: z.string().nullable(),
});
export type ActivityTestRunResult = z.infer<typeof activityTestRunResultSchema>;

// Lets a teacher run their own reference solution against a draft's test
// cases before posting, to catch a wrong or mistyped answer key. Stateless
// — takes the whole draft (no persisted activity required yet), so it
// serves both the create and edit flows identically. Test cases are keyed
// by array index rather than a test-case id since a draft's cases may not
// have one yet.
export const activityVerifyReferenceRequestSchema = z.object({
  language: codeLanguageSchema,
  comparisonMode: activityComparisonModeSchema,
  numericTolerance: z.number().positive().max(1_000_000).nullable(),
  referenceSolution: z.string().min(1).max(20_000),
  testCases: z
    .array(
      z.object({
        stdin: z.string().max(10_000),
        expectedStdout: z.string().max(10_000),
      }),
    )
    .min(1)
    .max(20),
});
export type ActivityVerifyReferenceRequest = z.infer<
  typeof activityVerifyReferenceRequestSchema
>;

export const activityVerifyReferenceResultSchema = z.object({
  index: z.number().int().nonnegative(),
  passed: z.boolean(),
  actualStdout: z.string().nullable(),
  status: activityTestRunResultSchema.shape.status,
  message: z.string().nullable(),
});
export type ActivityVerifyReferenceResult = z.infer<
  typeof activityVerifyReferenceResultSchema
>;

export const activityVerifyReferenceResponseSchema = z.object({
  passed: z.boolean(),
  results: z.array(activityVerifyReferenceResultSchema),
});
export type ActivityVerifyReferenceResponse = z.infer<
  typeof activityVerifyReferenceResponseSchema
>;

// Drafts a whole activity from a short brief via an LLM, then immediately
// runs the AI's own reference solution against its own test cases (reusing
// verifyReferenceSolution) so a self-inconsistent draft is caught before
// the teacher ever sees it — never posted directly, always an editable
// starting point.
export const activityGenerateRequestSchema = z.object({
  // Generous ceiling on purpose — a "brief" here can be a one-line topic
  // or a fully worked spec (exact class/method names, exact test case
  // data). Roughly matches activityCreateRequestSchema's instructions cap.
  topic: z.string().trim().min(1).max(8_000),
  language: codeLanguageSchema,
  difficulty: z
    .enum(["beginner", "intermediate", "advanced"])
    .default("beginner"),
  testCaseCount: z.number().int().min(2).max(10).default(4),
});
export type ActivityGenerateRequest = z.infer<
  typeof activityGenerateRequestSchema
>;

export const activityGeneratedTestCaseSchema = z.object({
  stdin: z.string(),
  expectedStdout: z.string(),
  isHidden: z.boolean(),
});
export type ActivityGeneratedTestCase = z.infer<
  typeof activityGeneratedTestCaseSchema
>;

export const activityGenerateResponseSchema = z.object({
  title: z.string(),
  instructions: z.string(),
  starterCode: z.string().nullable(),
  referenceSolution: z.string(),
  testCases: z.array(activityGeneratedTestCaseSchema).min(1),
  // The AI's own solution graded against its own test cases, so the
  // teacher sees at a glance whether the draft is self-consistent before
  // reviewing it — same per-test-case shape as the manual Verify action.
  verification: z.object({
    passed: z.boolean(),
    results: z.array(activityVerifyReferenceResultSchema),
  }),
});
export type ActivityGenerateResponse = z.infer<
  typeof activityGenerateResponseSchema
>;

export const activitySubmissionSchema = z.object({
  studentId: z.string().uuid(),
  studentName: z.string(),
  status: z.enum([
    "not_started",
    "in_progress",
    "passed",
    "submitted_incomplete",
    "zeroed_violation",
  ]),
  sourceCode: z.string().nullable(),
  violationCount: z.number().int().nonnegative(),
  violations: z.array(activityViolationSchema),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  score: z.number().int().nonnegative().nullable(),
  totalPoints: z.number().int().positive(),
  integrityFlags: z.array(activityIntegrityFlagSchema),
});
export type ActivitySubmission = z.infer<typeof activitySubmissionSchema>;

export const activityBulkResetRequestSchema = z
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
export type ActivityBulkResetRequest = z.infer<
  typeof activityBulkResetRequestSchema
>;

export const activityViolationResponseSchema = z.object({
  attempt: activityAttemptSchema,
});
export type ActivityViolationResponse = z.infer<
  typeof activityViolationResponseSchema
>;

export const activityTestRunResponseSchema = z.object({
  passed: z.boolean(),
  results: z.array(activityTestRunResultSchema),
  attempt: activityAttemptSchema,
});
export type ActivityTestRunResponse = z.infer<
  typeof activityTestRunResponseSchema
>;
