import { z } from "zod";

export const roleSchema = z.enum(["student", "teacher", "administrator"]);
export type Role = z.infer<typeof roleSchema>;

export const accountStatusSchema = z.enum([
  "pending_verification",
  "pending_approval",
  "active",
  "suspended",
  "deactivated",
]);
export type AccountStatus = z.infer<typeof accountStatusSchema>;

export const accountProfileSchema = z.object({
  id: z.string().uuid(),
  firebaseUid: z.string().min(1),
  email: z.email(),
  displayName: z.string().min(1),
  institutionId: z.string().uuid(),
  status: accountStatusSchema,
  roles: z.array(roleSchema),
  sectionId: z.string().uuid().nullable(),
  authorizationVersion: z.number().int().nonnegative(),
});
export type AccountProfile = z.infer<typeof accountProfileSchema>;

export const requestedRegistrationRoleSchema = roleSchema.exclude([
  "administrator",
]);
export type RequestedRegistrationRole = z.infer<
  typeof requestedRegistrationRoleSchema
>;

export const registrationRequestSchema = z
  .object({
    displayName: z.string().trim().min(2).max(120),
    requestedRole: requestedRegistrationRoleSchema,
    sectionId: z.string().uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.requestedRole === "student" && !value.sectionId) {
      context.addIssue({
        code: "custom",
        path: ["sectionId"],
        message: "Select a section.",
      });
    }
  });
export type RegistrationRequest = z.infer<typeof registrationRequestSchema>;

export const profileUpdateRequestSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
});
export type ProfileUpdateRequest = z.infer<typeof profileUpdateRequestSchema>;

export const permissionSchema = z.enum([
  "workspace:execute_own",
  "workspace:reset_own",
  "query:cancel_own",
  "query:cancel_any",
  "platform:manage_users",
  "platform:manage_settings",
  "platform:view_audit",
]);
export type Permission = z.infer<typeof permissionSchema>;

export const rolePermissions = {
  student: ["workspace:execute_own", "workspace:reset_own", "query:cancel_own"],
  teacher: ["workspace:execute_own", "workspace:reset_own", "query:cancel_own"],
  administrator: [
    "query:cancel_any",
    "platform:manage_users",
    "platform:manage_settings",
    "platform:view_audit",
  ],
} as const satisfies Record<Role, readonly Permission[]>;

export const authorizationContextSchema = z.object({
  uid: z.string().min(1),
  institutionId: z.string().uuid(),
  roles: z.array(roleSchema).min(1),
  accountStatus: accountStatusSchema,
  authorizationVersion: z.number().int().nonnegative(),
});
export type AuthorizationContext = z.infer<typeof authorizationContextSchema>;
