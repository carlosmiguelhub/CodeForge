import { z } from "zod";

export const workspaceStateSchema = z.enum([
  "requested",
  "provisioning",
  "ready",
  "resetting",
  "suspended",
  "failed",
  "expired",
  "deleting",
  "deleted",
]);
export type WorkspaceState = z.infer<typeof workspaceStateSchema>;

export const workspaceScopeSchema = z.enum(["personal", "class"]);
export type WorkspaceScope = z.infer<typeof workspaceScopeSchema>;

export const workspaceRequestSchema = z.object({
  scope: workspaceScopeSchema,
  scopeId: z.string().uuid().optional(),
  templateVersionId: z.string().uuid().optional(),
});
export type WorkspaceRequest = z.infer<typeof workspaceRequestSchema>;

export const workspaceResetRequestSchema = z.object({
  reason: z.string().trim().min(8).max(500),
});
export type WorkspaceResetRequest = z.infer<typeof workspaceResetRequestSchema>;

export const workspaceSummarySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  scope: workspaceScopeSchema,
  scopeId: z.string().uuid(),
  state: workspaceStateSchema,
  quotaBytes: z
    .number()
    .int()
    .positive()
    .max(250 * 1024 * 1024),
  templateVersionId: z.string().uuid().nullable(),
  expiresAt: z.iso.datetime({ offset: true }).nullable(),
  failureCode: z.string().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type WorkspaceSummary = z.infer<typeof workspaceSummarySchema>;
