import { z } from "zod";

import {
  activityComparisonModeSchema,
  activityTestCaseInputSchema,
  activityTestRunResultSchema,
} from "./activity";
import { codeLanguageSchema } from "./code-execution";

export const raceStatusSchema = z.enum(["draft", "open", "closed"]);
export type RaceStatus = z.infer<typeof raceStatusSchema>;

export const raceAvailabilitySchema = z.enum(["scheduled", "open", "closed"]);
export type RaceAvailability = z.infer<typeof raceAvailabilitySchema>;

export const raceAttemptStatusSchema = z.enum([
  "in_progress",
  "submitted",
  "timed_out",
]);
export type RaceAttemptStatus = z.infer<typeof raceAttemptStatusSchema>;

// Same policy as Activities' — a tab-switch or fullscreen-exit while a race
// attempt is in progress counts as one violation. The first
// RACE_ALLOWED_VIOLATIONS are free; every one beyond that deducts
// RACE_VIOLATION_DEDUCTION_PERCENT% of the race's total points from the
// final score (see applyViolationDeduction in ./violation-scoring).
// Violations never lock or force-end the attempt. Reuses Activity's
// constant name convention rather than inventing a second number for the
// same policy.
export const RACE_ALLOWED_VIOLATIONS = 5;
export const RACE_VIOLATION_DEDUCTION_PERCENT = 2.5;

export const raceViolationKindSchema = z.enum([
  "tab_switch",
  "fullscreen_exit",
]);
export type RaceViolationKind = z.infer<typeof raceViolationKindSchema>;

export const raceViolationRequestSchema = z.object({
  kind: raceViolationKindSchema,
});
export type RaceViolationRequest = z.infer<typeof raceViolationRequestSchema>;

// A race problem's authoring input — deliberately the same field set as an
// Activity (title/instructions/language/starterCode/referenceSolution/
// comparisonMode/testCases), reusing activityTestCaseInputSchema directly
// rather than redefining an identical shape.
export const raceProblemInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  instructions: z.string().trim().min(1).max(20_000),
  language: codeLanguageSchema,
  starterCode: z.string().max(20_000).optional(),
  referenceSolution: z.string().max(20_000).optional(),
  comparisonMode: activityComparisonModeSchema.optional(),
  numericTolerance: z.number().positive().max(1_000_000).optional(),
  points: z.number().int().min(1).max(1_000).optional(),
  testCases: z.array(activityTestCaseInputSchema).min(1).max(20),
});
export type RaceProblemInput = z.infer<typeof raceProblemInputSchema>;

export const raceCreateRequestSchema = z
  .object({
    title: z.string().trim().min(1).max(160),
    durationMinutes: z.number().int().min(1).max(480),
    opensAt: z.iso.datetime({ offset: true }),
    closesAt: z.iso.datetime({ offset: true }),
    problems: z.array(raceProblemInputSchema).min(1).max(10),
  })
  .refine(
    (race) =>
      new Date(race.closesAt).getTime() > new Date(race.opensAt).getTime(),
    { path: ["closesAt"], message: "Close time must be after open time." },
  );
export type RaceCreateRequest = z.infer<typeof raceCreateRequestSchema>;

// Full edit of a race's title/duration/problems — deliberately excludes
// opensAt/closesAt/status, which stay the sole responsibility of the
// schedule endpoint (extend/reopen) so the two concerns never fight over
// the same field in one request.
export const raceUpdateRequestSchema = z.object({
  title: z.string().trim().min(1).max(160),
  durationMinutes: z.number().int().min(1).max(480),
  problems: z.array(raceProblemInputSchema).min(1).max(10),
});
export type RaceUpdateRequest = z.infer<typeof raceUpdateRequestSchema>;

export const raceScheduleUpdateRequestSchema = z.object({
  closesAt: z.iso.datetime({ offset: true }),
});
export type RaceScheduleUpdateRequest = z.infer<
  typeof raceScheduleUpdateRequestSchema
>;

// Teacher-facing test case — includes the answer key.
export const raceTestCaseSchema = activityTestCaseInputSchema.extend({
  id: z.string().uuid(),
  isHidden: z.boolean().default(false),
  showExpectedOutput: z.boolean().default(false),
  orderIndex: z.number().int().nonnegative(),
});
export type RaceTestCase = z.infer<typeof raceTestCaseSchema>;

// Student-facing test case — the input only, never the expected output for
// a hidden case, mirroring activityTestCasePreviewSchema.
export const raceTestCasePreviewSchema = z.object({
  id: z.string().uuid(),
  stdin: z.string().nullable(),
  expectedStdout: z.string().nullable().default(null),
  isHidden: z.boolean().default(false),
  orderIndex: z.number().int().nonnegative(),
});
export type RaceTestCasePreview = z.infer<typeof raceTestCasePreviewSchema>;

// A student's own progress on one problem — visible once they've started
// the race (their own attempt), never before.
export const raceProblemAttemptSchema = z.object({
  submitted: z.boolean(),
  passedTestCaseCount: z.number().int().nonnegative(),
  totalTestCaseCount: z.number().int().nonnegative(),
  score: z.number().int().nonnegative().nullable(),
  // The student's own most recently run/submitted source for this problem
  // — safe to return to them, null until their first Run. Lets the
  // workspace reopen with what they last wrote instead of resetting to
  // starterCode on every visit or problem switch.
  sourceCode: z.string().nullable(),
});
export type RaceProblemAttempt = z.infer<typeof raceProblemAttemptSchema>;

export const raceProblemForTeacherSchema = z.object({
  id: z.string().uuid(),
  orderIndex: z.number().int().nonnegative(),
  title: z.string(),
  instructions: z.string(),
  language: codeLanguageSchema,
  starterCode: z.string().nullable(),
  referenceSolution: z.string().nullable(),
  comparisonMode: activityComparisonModeSchema.default("suffix_exact"),
  numericTolerance: z.number().positive().nullable().default(null),
  points: z.number().int().positive().default(100),
  testCases: z.array(raceTestCaseSchema),
});
export type RaceProblemForTeacher = z.infer<typeof raceProblemForTeacherSchema>;

export const raceProblemForStudentSchema = z.object({
  id: z.string().uuid(),
  orderIndex: z.number().int().nonnegative(),
  title: z.string(),
  instructions: z.string(),
  language: codeLanguageSchema,
  starterCode: z.string().nullable(),
  comparisonMode: activityComparisonModeSchema.default("suffix_exact"),
  numericTolerance: z.number().positive().nullable().default(null),
  points: z.number().int().positive().default(100),
  testCases: z.array(raceTestCasePreviewSchema),
  attempt: raceProblemAttemptSchema.nullable(),
});
export type RaceProblemForStudent = z.infer<typeof raceProblemForStudentSchema>;

export const raceAttemptSchema = z.object({
  id: z.string().uuid(),
  status: raceAttemptStatusSchema,
  startedAt: z.iso.datetime({ offset: true }),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  deadlineAt: z.iso.datetime({ offset: true }),
  violationCount: z.number().int().nonnegative(),
});
export type RaceAttempt = z.infer<typeof raceAttemptSchema>;

export const raceViolationResponseSchema = z.object({
  attempt: raceAttemptSchema,
});
export type RaceViolationResponse = z.infer<typeof raceViolationResponseSchema>;

const raceBaseSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  title: z.string(),
  durationMinutes: z.number().int().positive(),
  opensAt: z.iso.datetime({ offset: true }),
  closesAt: z.iso.datetime({ offset: true }),
  status: raceStatusSchema,
  availability: raceAvailabilitySchema,
  totalPoints: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});

export const raceForTeacherSchema = raceBaseSchema.extend({
  problems: z.array(raceProblemForTeacherSchema),
  memberCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
});
export type RaceForTeacher = z.infer<typeof raceForTeacherSchema>;

export const raceForStudentSchema = raceBaseSchema.extend({
  problems: z.array(raceProblemForStudentSchema),
  attempt: raceAttemptSchema.nullable(),
});
export type RaceForStudent = z.infer<typeof raceForStudentSchema>;

export const raceSummaryForTeacherSchema = raceBaseSchema.extend({
  problemCount: z.number().int().nonnegative(),
  memberCount: z.number().int().nonnegative(),
  submittedCount: z.number().int().nonnegative(),
});
export type RaceSummaryForTeacher = z.infer<typeof raceSummaryForTeacherSchema>;

export const raceSummaryForStudentSchema = raceBaseSchema.extend({
  problemCount: z.number().int().nonnegative(),
  attemptStatus: raceAttemptStatusSchema.nullable(),
  totalScore: z.number().int().nonnegative().nullable(),
});
export type RaceSummaryForStudent = z.infer<typeof raceSummaryForStudentSchema>;

export const raceProblemSubmitRequestSchema = z.object({
  // Same bound as activityTestRunRequestSchema's sourceCode — problems are
  // graded through the identical runTestCases pipeline as Activities.
  sourceCode: z.string().min(1).max(100_000),
});
export type RaceProblemSubmitRequest = z.infer<
  typeof raceProblemSubmitRequestSchema
>;

export const raceProblemRunResponseSchema = z.object({
  passed: z.boolean(),
  results: z.array(activityTestRunResultSchema),
});
export type RaceProblemRunResponse = z.infer<
  typeof raceProblemRunResponseSchema
>;

export const raceProblemSubmitResponseSchema = z.object({
  passed: z.boolean(),
  results: z.array(activityTestRunResultSchema),
  passedTestCaseCount: z.number().int().nonnegative(),
  totalTestCaseCount: z.number().int().nonnegative(),
  score: z.number().int().nonnegative(),
});
export type RaceProblemSubmitResponse = z.infer<
  typeof raceProblemSubmitResponseSchema
>;

// Percentage is computed server-side (round(totalScore/totalPoints*100)) so
// every view (student race page, teacher leaderboard panel) agrees exactly
// instead of each client rounding independently.
export const raceLeaderboardEntrySchema = z.object({
  rank: z.number().int().positive(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  totalScore: z.number().int().nonnegative(),
  totalPoints: z.number().int().nonnegative(),
  percentage: z.number().int().min(0).max(100),
});
export type RaceLeaderboardEntry = z.infer<typeof raceLeaderboardEntrySchema>;

export const raceProblemSubmissionSummarySchema = z.object({
  problemId: z.string().uuid(),
  submitted: z.boolean(),
  passedTestCaseCount: z.number().int().nonnegative(),
  totalTestCaseCount: z.number().int().nonnegative(),
  score: z.number().int().nonnegative().nullable(),
  // The student's most recently run/submitted code for this problem — lets
  // a teacher review what was actually written, mirroring Activity's
  // submission.sourceCode. Null until the student's first "Run" or
  // "Submit" on this problem.
  sourceCode: z.string().nullable(),
});
export type RaceProblemSubmissionSummary = z.infer<
  typeof raceProblemSubmissionSummarySchema
>;

export const raceSubmissionSchema = z.object({
  studentId: z.string().uuid(),
  studentName: z.string(),
  attemptStatus: raceAttemptStatusSchema.nullable(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  submittedAt: z.iso.datetime({ offset: true }).nullable(),
  totalScore: z.number().int().nonnegative(),
  totalPoints: z.number().int().nonnegative(),
  // totalScore above already has any distraction deduction applied — this
  // is exposed alongside it so the teacher's view can explain *why*
  // (violationDeductionAmount(totalPoints, violationCount, ...)).
  violationCount: z.number().int().nonnegative(),
  problems: z.array(raceProblemSubmissionSummarySchema),
});
export type RaceSubmission = z.infer<typeof raceSubmissionSchema>;

export const raceBulkResetRequestSchema = z
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
export type RaceBulkResetRequest = z.infer<typeof raceBulkResetRequestSchema>;
