import { z } from "zod";

export const systemStatusSchema = z.object({
  maintenanceMode: z.boolean(),
  message: z.string().nullable(),
});
export type SystemStatus = z.infer<typeof systemStatusSchema>;

export const maintenanceUpdateRequestSchema = z.object({
  enabled: z.boolean(),
  message: z.string().trim().min(1).max(500).nullable().optional(),
});
export type MaintenanceUpdateRequest = z.infer<
  typeof maintenanceUpdateRequestSchema
>;
