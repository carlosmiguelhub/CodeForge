import { z } from "zod";

export const savedQueryNameSchema = z.string().trim().min(1).max(120);
export const savedQuerySqlSchema = z.string().min(1).max(20_000);

export const savedQuerySchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  name: savedQueryNameSchema,
  sql: savedQuerySqlSchema,
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type SavedQuery = z.infer<typeof savedQuerySchema>;

export const savedQueryCreateRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  name: savedQueryNameSchema,
  sql: savedQuerySqlSchema,
});
export type SavedQueryCreateRequest = z.infer<
  typeof savedQueryCreateRequestSchema
>;

export const savedQueryUpdateRequestSchema = z
  .object({
    name: savedQueryNameSchema.optional(),
    sql: savedQuerySqlSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.sql !== undefined, {
    message: "At least a name or sql update is required.",
  });
export type SavedQueryUpdateRequest = z.infer<
  typeof savedQueryUpdateRequestSchema
>;
