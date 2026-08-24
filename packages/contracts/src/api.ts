import { z } from "zod";

export const apiErrorCodeSchema = z.enum([
  "AUTHENTICATION_REQUIRED",
  "EMAIL_VERIFICATION_REQUIRED",
  "ACCOUNT_PENDING_APPROVAL",
  "ACCOUNT_SUSPENDED",
  "PERMISSION_DENIED",
  "RESOURCE_NOT_FOUND",
  "VALIDATION_FAILED",
  "VERSION_CONFLICT",
  "RATE_LIMITED",
  "WORKSPACE_NOT_READY",
  "SQL_POLICY_DENIED",
  "EXECUTION_LIMIT_EXCEEDED",
  "INVALID_GRANT",
  "INVALID_CONFIRMATION",
  "WORKSPACE_ACCESS_DENIED",
  "WORKSPACE_LOCKED",
  "EXECUTION_CONCURRENCY_LIMIT",
  "EXECUTION_RATE_LIMIT",
  "MANUAL_TRANSACTION_UNAVAILABLE",
  "STATEMENT_LIMIT_EXCEEDED",
  "EXECUTION_NOT_FOUND",
  "DESTRUCTIVE_CONFIRMATION_REQUIRED",
  "EMAIL_ALREADY_REGISTERED",
  "SYSTEM_MAINTENANCE",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const fieldErrorSchema = z.object({
  path: z.string(),
  message: z.string(),
});

export const apiErrorSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string(),
    requestId: z.string().min(1),
    fieldErrors: z.array(fieldErrorSchema).optional(),
    retryAfterSeconds: z.number().int().positive().optional(),
  }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
