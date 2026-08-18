import { z } from "zod";

import { roleSchema } from "./identity";

export const auditActionSchema = z.enum([
  "account.approved",
  "account.suspended",
  "account.reactivated",
  "role.changed",
  "class.created",
  "class.updated",
  "class.invitation_created",
  "class.invitation_revoked",
  "academic.department_created",
  "academic.program_created",
  "academic.course_created",
  "academic.term_created",
  "enrollment.joined",
  "enrollment.changed",
  "activity.published",
  "activity.policy_changed",
  "submission.created",
  "submission.reopened",
  "grade.overridden",
  "grade.released",
  "workspace.created",
  "workspace.requested",
  "workspace.provisioning_failed",
  "workspace.credential_rotated",
  "workspace.reset",
  "workspace.deleted",
  "query.cancelled",
  "setting.changed",
  "maintenance.changed",
]);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditEventSchema = z.object({
  id: z.string().uuid(),
  institutionId: z.string().uuid(),
  actorId: z.string().uuid(),
  effectiveRole: roleSchema,
  action: auditActionSchema,
  targetType: z.string().min(1),
  targetId: z.string().min(1),
  requestId: z.string().min(1),
  result: z.enum(["succeeded", "denied", "failed"]),
  reason: z.string().min(1).optional(),
  occurredAt: z.iso.datetime({ offset: true }),
});
export type AuditEvent = z.infer<typeof auditEventSchema>;
