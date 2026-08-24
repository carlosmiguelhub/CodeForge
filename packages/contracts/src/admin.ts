import { z } from "zod";

import { guiSessionStateSchema } from "./gui-session";
import {
  accountProfileSchema,
  accountStatusSchema,
  roleSchema,
} from "./identity";
import { workspaceStateSchema } from "./workspace";
import { workspaceKindSchema } from "./workspace-kind";

export const accountListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  role: roleSchema.optional(),
  status: accountStatusSchema.optional(),
  sectionId: z.string().uuid().optional(),
});
export type AccountListQuery = z.infer<typeof accountListQuerySchema>;

export const accountListResponseSchema = z.object({
  items: z.array(accountProfileSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type AccountListResponse = z.infer<typeof accountListResponseSchema>;

export const adminCreateUserRequestSchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(2).max(120),
  roles: z
    .array(roleSchema)
    .min(1)
    .max(3)
    .refine(
      (roles) => new Set(roles).size === roles.length,
      "Roles must be unique.",
    ),
});
export type AdminCreateUserRequest = z.infer<
  typeof adminCreateUserRequestSchema
>;

export const roleAssignmentRequestSchema = z.object({ role: roleSchema });
export type RoleAssignmentRequest = z.infer<typeof roleAssignmentRequestSchema>;

export const adminAssignSectionRequestSchema = z.object({
  sectionId: z.string().uuid().nullable(),
});
export type AdminAssignSectionRequest = z.infer<
  typeof adminAssignSectionRequestSchema
>;

// Mirrors apps/web/src/lib/password-policy.ts — kept in sync manually since
// that module is web-app-local; both must accept/reject the same passwords.
export const adminSetPasswordRequestSchema = z.object({
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[^A-Za-z0-9]/, "Include at least one special character."),
});
export type AdminSetPasswordRequest = z.infer<
  typeof adminSetPasswordRequestSchema
>;

export const userUsageSummarySchema = z.object({
  workspaceState: workspaceStateSchema.nullable(),
  erdDiagramCount: z.number().int().nonnegative(),
  codeFileCount: z.number().int().nonnegative(),
  savedQueryCount: z.number().int().nonnegative(),
  sqlExecutionCount: z.number().int().nonnegative(),
  codeExecutionCount: z.number().int().nonnegative(),
  guiSessionCount: z.number().int().nonnegative(),
  lastActiveAt: z.iso.datetime({ offset: true }).nullable(),
});
export type UserUsageSummary = z.infer<typeof userUsageSummarySchema>;

export const auditEventRecordSchema = z.object({
  id: z.string().uuid(),
  actorId: z.string().uuid(),
  actorDisplayName: z.string().nullable(),
  action: z.string().min(1),
  targetId: z.string().min(1),
  result: z.enum(["succeeded", "denied", "failed"]),
  reason: z.string().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type AuditEventRecord = z.infer<typeof auditEventRecordSchema>;

export const auditEventListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  action: z.string().trim().min(1).max(120).optional(),
  actorId: z.string().uuid().optional(),
  targetId: z.string().trim().min(1).max(128).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
});
export type AuditEventListQuery = z.infer<typeof auditEventListQuerySchema>;

export const auditEventListResponseSchema = z.object({
  items: z.array(auditEventRecordSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type AuditEventListResponse = z.infer<
  typeof auditEventListResponseSchema
>;

export const workspaceUsageStatSchema = z.object({
  workspace: workspaceKindSchema,
  totalCount: z.number().int().nonnegative(),
  dailyCounts: z.array(
    z.object({
      date: z.string(),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type WorkspaceUsageStat = z.infer<typeof workspaceUsageStatSchema>;

export const poolInstanceStateSchema = z.enum([
  "active",
  "draining",
  "offline",
]);
export type PoolInstanceState = z.infer<typeof poolInstanceStateSchema>;

export const allocationCleanupStateSchema = z.enum([
  "active",
  "pending",
  "cleaning",
  "complete",
  "failed",
]);
export type AllocationCleanupState = z.infer<
  typeof allocationCleanupStateSchema
>;

export const poolInstanceSummarySchema = z.object({
  id: z.string().uuid(),
  environment: z.string(),
  region: z.string(),
  state: poolInstanceStateSchema,
  databaseCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type PoolInstanceSummary = z.infer<typeof poolInstanceSummarySchema>;

export const infrastructureOverviewSchema = z.object({
  workspacesByState: z.record(
    workspaceStateSchema,
    z.number().int().nonnegative(),
  ),
  activeAllocationCount: z.number().int().nonnegative(),
  cleanupPendingCount: z.number().int().nonnegative(),
  cleanupFailedCount: z.number().int().nonnegative(),
  poolInstances: z.array(poolInstanceSummarySchema),
});
export type InfrastructureOverview = z.infer<
  typeof infrastructureOverviewSchema
>;

export const workspaceAllocationRecordSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  ownerDisplayName: z.string(),
  ownerEmail: z.email(),
  workspaceState: workspaceStateSchema,
  databaseName: z.string(),
  databaseUser: z.string(),
  poolEnvironment: z.string(),
  poolRegion: z.string(),
  cleanupState: allocationCleanupStateSchema,
  cleanupAttempts: z.number().int().nonnegative(),
  cleanupError: z.string().nullable(),
  allocatedAt: z.iso.datetime({ offset: true }),
  releasedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type WorkspaceAllocationRecord = z.infer<
  typeof workspaceAllocationRecordSchema
>;

export const workspaceAllocationListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  cleanupState: allocationCleanupStateSchema.optional(),
});
export type WorkspaceAllocationListQuery = z.infer<
  typeof workspaceAllocationListQuerySchema
>;

export const workspaceAllocationListResponseSchema = z.object({
  items: z.array(workspaceAllocationRecordSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type WorkspaceAllocationListResponse = z.infer<
  typeof workspaceAllocationListResponseSchema
>;

export const guiSessionOverviewSchema = z.object({
  sessionsByState: z.record(
    guiSessionStateSchema,
    z.number().int().nonnegative(),
  ),
  activeContainerCount: z.number().int().nonnegative(),
});
export type GuiSessionOverview = z.infer<typeof guiSessionOverviewSchema>;

export const guiSessionAdminRecordSchema = z.object({
  id: z.string().uuid(),
  ownerDisplayName: z.string(),
  ownerEmail: z.email(),
  mainClassName: z.string(),
  state: guiSessionStateSchema,
  maxRuntimeSeconds: z.number().int().positive(),
  startedAt: z.iso.datetime({ offset: true }).nullable(),
  endsAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
});
export type GuiSessionAdminRecord = z.infer<typeof guiSessionAdminRecordSchema>;

export const guiSessionAdminListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(120).optional(),
  state: guiSessionStateSchema.optional(),
});
export type GuiSessionAdminListQuery = z.infer<
  typeof guiSessionAdminListQuerySchema
>;

export const guiSessionAdminListResponseSchema = z.object({
  items: z.array(guiSessionAdminRecordSchema),
  page: z.number().int(),
  pageSize: z.number().int(),
  total: z.number().int(),
});
export type GuiSessionAdminListResponse = z.infer<
  typeof guiSessionAdminListResponseSchema
>;

export const topContributorRecordSchema = z.object({
  id: z.string().uuid(),
  rank: z.number().int().positive(),
  displayName: z.string(),
  sectionName: z.string().nullable(),
  contributionScore: z.number().int().nonnegative(),
  successfulWorkCount: z.number().int().nonnegative(),
  sqlExecutionCount: z.number().int().nonnegative(),
  codeExecutionCount: z.number().int().nonnegative(),
  erdDiagramCount: z.number().int().nonnegative(),
  savedQueryCount: z.number().int().nonnegative(),
  guiSessionCount: z.number().int().nonnegative(),
});
export type TopContributorRecord = z.infer<typeof topContributorRecordSchema>;

export const topContributorListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type TopContributorListQuery = z.infer<
  typeof topContributorListQuerySchema
>;

export const topContributorListResponseSchema = z.object({
  items: z.array(topContributorRecordSchema),
});
export type TopContributorListResponse = z.infer<
  typeof topContributorListResponseSchema
>;

export const activityResetRequestSchema = z.object({
  reason: z.string().trim().min(8).max(500),
});
export type ActivityResetRequest = z.infer<typeof activityResetRequestSchema>;

export const activityResetSummarySchema = z.object({
  sqlExecutionsCleared: z.number().int().nonnegative(),
  codeExecutionsCleared: z.number().int().nonnegative(),
  guiSessionsCleared: z.number().int().nonnegative(),
  resetAt: z.iso.datetime({ offset: true }),
});
export type ActivityResetSummary = z.infer<typeof activityResetSummarySchema>;

export const adminDashboardStatsSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  usersByRole: z.record(roleSchema, z.number().int().nonnegative()),
  usersByStatus: z.record(accountStatusSchema, z.number().int().nonnegative()),
  workspaceUsage: z.array(workspaceUsageStatSchema),
});
export type AdminDashboardStats = z.infer<typeof adminDashboardStatsSchema>;
