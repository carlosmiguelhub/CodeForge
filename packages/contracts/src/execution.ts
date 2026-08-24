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
  executionId: z.string().uuid().optional(),
  grant: z.string().min(1),
  sql: z.string().min(1).max(100_000),
  selection: executionSelectionSchema,
  transactionMode: z.enum(["auto", "manual"]),
  confirmation: z.string().min(1).optional(),
});
export type ExecutionRequest = z.infer<typeof executionRequestSchema>;

export const executionGrantRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  requestedMode: z.literal("interactive").default("interactive"),
});
export type ExecutionGrantRequest = z.infer<typeof executionGrantRequestSchema>;

export const executionGrantResponseSchema = z.object({
  grant: z.string().min(32),
  expiresAt: z.iso.datetime({ offset: true }),
  effectivePolicy: executionLimitsSchema,
});
export type ExecutionGrantResponse = z.infer<
  typeof executionGrantResponseSchema
>;

export const resultCellSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.null(),
]);

export const executionColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
});

export const executionResultSetSchema = z.object({
  columns: z.array(executionColumnSchema),
  rows: z.array(z.array(resultCellSchema)),
  affectedRows: z.number().int().nonnegative(),
  warningCount: z.number().int().nonnegative(),
  truncated: z.boolean(),
});
export type ExecutionResultSet = z.infer<typeof executionResultSetSchema>;

export const executionStatisticsSchema = z.object({
  durationMs: z.number().int().nonnegative(),
  rowsReturned: z.number().int().nonnegative(),
  bytesReturned: z.number().int().nonnegative(),
  statementCount: z.number().int().nonnegative(),
});

export const executionResponseSchema = z.object({
  executionId: z.string().uuid(),
  state: executionStateSchema,
  resultSets: z.array(executionResultSetSchema),
  messages: z.array(
    z.object({
      severity: z.enum(["info", "warning", "error"]),
      text: z.string(),
    }),
  ),
  statistics: executionStatisticsSchema,
  confirmation: z
    .object({
      token: z.string(),
      statementHash: z.string(),
      message: z.string(),
    })
    .optional(),
});
export type ExecutionResponse = z.infer<typeof executionResponseSchema>;

export const schemaColumnReferenceSchema = z.object({
  table: z.string(),
  column: z.string(),
});
export const schemaColumnSchema = z.object({
  name: z.string(),
  dataType: z.string(),
  nullable: z.boolean(),
  key: z.string(),
  references: schemaColumnReferenceSchema.nullable(),
});
export const schemaTableSchema = z.object({
  name: z.string(),
  type: z.enum(["table", "view"]),
  columns: z.array(schemaColumnSchema),
});
export const workspaceSchemaResponseSchema = z.object({
  tables: z.array(schemaTableSchema),
});
export type WorkspaceSchemaResponse = z.infer<
  typeof workspaceSchemaResponseSchema
>;
