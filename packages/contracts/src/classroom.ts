import { z } from "zod";

export const classJoinCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9]{6}$/, "Join code must be 6 letters or numbers.");

export const classSchema = z.object({
  id: z.string().uuid(),
  teacherId: z.string().uuid(),
  teacherName: z.string(),
  subjectName: z.string().min(1).max(120),
  sectionLabel: z.string().min(1).max(60),
  joinCode: classJoinCodeSchema,
  archivedAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  memberCount: z.number().int().nonnegative(),
});
export type Class = z.infer<typeof classSchema>;

export const classMemberSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  studentName: z.string(),
  joinedAt: z.iso.datetime({ offset: true }),
});
export type ClassMember = z.infer<typeof classMemberSchema>;

export const classDetailSchema = classSchema.extend({
  members: z.array(classMemberSchema),
});
export type ClassDetail = z.infer<typeof classDetailSchema>;

export const classCreateRequestSchema = z.object({
  subjectName: z.string().trim().min(1).max(120),
  sectionLabel: z.string().trim().min(1).max(60),
});
export type ClassCreateRequest = z.infer<typeof classCreateRequestSchema>;

export const classUpdateRequestSchema = classCreateRequestSchema;
export type ClassUpdateRequest = z.infer<typeof classUpdateRequestSchema>;

export const classJoinRequestSchema = z.object({
  joinCode: classJoinCodeSchema,
});
export type ClassJoinRequest = z.infer<typeof classJoinRequestSchema>;
