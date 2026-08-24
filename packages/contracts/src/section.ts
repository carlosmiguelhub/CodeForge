import { z } from "zod";

import { workspaceKindSchema } from "./workspace-kind";

export const sectionSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120),
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  lockedWorkspaces: z.array(workspaceKindSchema),
  // Only populated by the admin section list (SectionService.listAll) —
  // the public registration list has no reason to compute it.
  memberCount: z.number().int().nonnegative().optional(),
});
export type Section = z.infer<typeof sectionSchema>;

export const sectionCreateRequestSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type SectionCreateRequest = z.infer<typeof sectionCreateRequestSchema>;

export const sectionLockedWorkspacesUpdateRequestSchema = z.object({
  lockedWorkspaces: z.array(workspaceKindSchema),
});
export type SectionLockedWorkspacesUpdateRequest = z.infer<
  typeof sectionLockedWorkspacesUpdateRequestSchema
>;

export const workspaceAccessSchema = z.object({
  lockedWorkspaces: z.array(workspaceKindSchema),
});
export type WorkspaceAccess = z.infer<typeof workspaceAccessSchema>;
