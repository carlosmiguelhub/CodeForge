import { z } from "zod";

export const classStatusSchema = z.enum(["active", "archived"]);
export type ClassStatus = z.infer<typeof classStatusSchema>;

export const enrollmentStateSchema = z.enum(["active", "removed"]);
export type EnrollmentState = z.infer<typeof enrollmentStateSchema>;

export const academicOptionsSchema = z.object({
  courses: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string().min(1),
      title: z.string().min(1),
    }),
  ),
  terms: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1),
      startsAt: z.iso.datetime({ offset: true }),
      endsAt: z.iso.datetime({ offset: true }),
      status: z.enum(["upcoming", "active", "closed"]),
    }),
  ),
});
export type AcademicOptions = z.infer<typeof academicOptionsSchema>;

const academicCodeSchema = z.string().trim().min(2).max(32);

export const departmentCreateRequestSchema = z.object({
  code: academicCodeSchema,
  name: z.string().trim().min(2).max(160),
});
export type DepartmentCreateRequest = z.infer<
  typeof departmentCreateRequestSchema
>;

export const programCreateRequestSchema = z.object({
  departmentId: z.string().uuid(),
  code: academicCodeSchema,
  name: z.string().trim().min(2).max(160),
});
export type ProgramCreateRequest = z.infer<typeof programCreateRequestSchema>;

export const courseCreateRequestSchema = z.object({
  departmentId: z.string().uuid(),
  code: academicCodeSchema,
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(2_000).optional(),
});
export type CourseCreateRequest = z.infer<typeof courseCreateRequestSchema>;

export const termCreateRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
  })
  .refine((value) => new Date(value.endsAt) > new Date(value.startsAt), {
    message: "Term end must be after its start.",
    path: ["endsAt"],
  });
export type TermCreateRequest = z.infer<typeof termCreateRequestSchema>;

export const academicCatalogSchema = z.object({
  departments: z.array(
    z.object({
      id: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      status: z.enum(["active", "archived"]),
    }),
  ),
  programs: z.array(
    z.object({
      id: z.string().uuid(),
      departmentId: z.string().uuid(),
      code: z.string(),
      name: z.string(),
      status: z.enum(["active", "archived"]),
    }),
  ),
  courses: z.array(
    z.object({
      id: z.string().uuid(),
      departmentId: z.string().uuid(),
      code: z.string(),
      title: z.string(),
      description: z.string().nullable(),
      status: z.enum(["active", "archived"]),
    }),
  ),
  terms: academicOptionsSchema.shape.terms,
});
export type AcademicCatalog = z.infer<typeof academicCatalogSchema>;

export const classSummarySchema = z.object({
  id: z.string().uuid(),
  institutionId: z.string().uuid(),
  courseId: z.string().uuid(),
  courseCode: z.string().min(1),
  courseTitle: z.string().min(1),
  termId: z.string().uuid(),
  termName: z.string().min(1),
  section: z.string().min(1),
  ownerTeacherId: z.string().uuid(),
  ownerTeacherName: z.string().min(1),
  status: classStatusSchema,
  enrolledCount: z.number().int().nonnegative().max(60),
  createdAt: z.iso.datetime({ offset: true }),
});
export type ClassSummary = z.infer<typeof classSummarySchema>;

export const classCreateRequestSchema = z.object({
  courseId: z.string().uuid(),
  termId: z.string().uuid(),
  section: z.string().trim().min(1).max(80),
  ownerTeacherId: z.string().uuid().optional(),
});
export type ClassCreateRequest = z.infer<typeof classCreateRequestSchema>;

export const classUpdateRequestSchema = z
  .object({
    section: z.string().trim().min(1).max(80).optional(),
    status: classStatusSchema.optional(),
  })
  .refine(
    (value) => value.section !== undefined || value.status !== undefined,
    {
      message: "Provide at least one class change.",
    },
  );
export type ClassUpdateRequest = z.infer<typeof classUpdateRequestSchema>;

export const invitationCreateRequestSchema = z.object({
  expiresAt: z.iso.datetime({ offset: true }),
  usageLimit: z.number().int().min(1).max(60),
});
export type InvitationCreateRequest = z.infer<
  typeof invitationCreateRequestSchema
>;

export const invitationCreatedSchema = z.object({
  id: z.string().uuid(),
  classId: z.string().uuid(),
  code: z.string().min(32),
  expiresAt: z.iso.datetime({ offset: true }),
  usageLimit: z.number().int().min(1).max(60),
  usageCount: z.number().int().nonnegative(),
});
export type InvitationCreated = z.infer<typeof invitationCreatedSchema>;

export const joinClassRequestSchema = z.object({
  code: z.string().trim().min(32).max(128),
});
export type JoinClassRequest = z.infer<typeof joinClassRequestSchema>;

export const rosterMemberSchema = z.object({
  userId: z.string().uuid(),
  displayName: z.string().min(1),
  email: z.email(),
  state: enrollmentStateSchema,
  joinedAt: z.iso.datetime({ offset: true }),
  removedAt: z.iso.datetime({ offset: true }).nullable(),
});
export type RosterMember = z.infer<typeof rosterMemberSchema>;

export const enrollmentChangeRequestSchema = z.object({
  state: enrollmentStateSchema,
  reason: z.string().trim().min(8).max(500),
});
export type EnrollmentChangeRequest = z.infer<
  typeof enrollmentChangeRequestSchema
>;
