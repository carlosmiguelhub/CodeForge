import { z } from "zod";

export const executionStateSchema = z.enum([
  "queued",
  "running",
  "successful",
  "failed",
  "timed_out",
  "cancelled",
  "limit_exceeded",
]);
export type ExecutionState = z.infer<typeof executionStateSchema>;

export const executionLimitsSchema = z.object({
  timeoutMs: z.number().int().positive().max(30_000),
  maxStatements: z.number().int().positive().max(5),
  maxRowsPerResult: z.number().int().positive().max(1_000),
  maxResultSets: z.number().int().positive().max(5),
  maxOutputBytes: z
    .number()
    .int()
    .positive()
    .max(5 * 1024 * 1024),
});
export type ExecutionLimits = z.infer<typeof executionLimitsSchema>;

export const interactiveExecutionLimits = {
  timeoutMs: 10_000,
  maxStatements: 5,
  maxRowsPerResult: 1_000,
  maxResultSets: 5,
  maxOutputBytes: 5 * 1024 * 1024,
} as const satisfies ExecutionLimits;

export const executionSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("current") }),
  z.object({
    mode: z.literal("selected"),
    startOffset: z.number().int().nonnegative(),
    endOffset: z.number().int().positive(),
  }),
  z.object({ mode: z.literal("script") }),
]);

export const executionRequestSchema = z.object({
  grant: z.string().min(1),
  sql: z.string().min(1).max(100_000),
  selection: executionSelectionSchema,
  transactionMode: z.enum(["auto", "manual"]),
});
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;
