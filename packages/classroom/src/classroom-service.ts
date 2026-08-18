import { createHash, randomBytes, randomUUID } from "node:crypto";

import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  AcademicOptions,
  AcademicCatalog,
  ClassCreateRequest,
  ClassSummary,
  ClassUpdateRequest,
  CourseCreateRequest,
  DepartmentCreateRequest,
  EnrollmentChangeRequest,
  InvitationCreateRequest,
  InvitationCreated,
  ProgramCreateRequest,
  RosterMember,
  TermCreateRequest,
} from "@sqweb/contracts";

import {
  ClassroomRepositoryError,
  type ClassroomServiceDependencies,
} from "./types";

const maximumClassSize = 60;

function hashInvitationCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

function notFound(): AuthorizationError {
  return new AuthorizationError(
    "RESOURCE_NOT_FOUND",
    "The requested class resource was not found.",
    404,
  );
}

function mapRepositoryError(error: unknown): never {
  if (!(error instanceof ClassroomRepositoryError)) throw error;

  if (
    error.reason === "class_not_found" ||
    error.reason === "invite_invalid" ||
    error.reason === "student_invalid"
  ) {
    throw notFound();
  }

  const messages = {
    academic_reference_invalid:
      "The selected course or term is not available in this institution.",
    owner_invalid: "The selected class owner is not an active Teacher.",
    invite_expired: "This invitation has expired.",
    invite_exhausted: "This invitation has reached its usage limit.",
    class_archived: "Archived classes cannot accept enrollment changes.",
    class_full: "This class has reached its 60-student limit.",
  } as const;

  throw new AuthorizationError(
    "VALIDATION_FAILED",
    messages[error.reason],
    409,
  );
}

export class ClassroomService {
  constructor(private readonly dependencies: ClassroomServiceDependencies) {}

  private now(): Date {
    return this.dependencies.now?.() ?? new Date();
  }

  private async requireVisibleClass(
    actor: Awaited<
      ReturnType<
        ClassroomServiceDependencies["identity"]["requireActiveAccount"]
      >
    >,
    classId: string,
  ): Promise<ClassSummary> {
    const classRecord = await this.dependencies.classroom.findScoped(
      classId,
      actor.institutionId,
    );
    if (!classRecord) throw notFound();
    if (actor.roles.includes("administrator")) return classRecord;
    if (!(await this.dependencies.classroom.canAccess(classId, actor)))
      throw notFound();
    return classRecord;
  }

  private async requireManagedClass(
    actor: Awaited<
      ReturnType<
        ClassroomServiceDependencies["identity"]["requireActiveAccount"]
      >
    >,
    classId: string,
  ): Promise<ClassSummary> {
    const classRecord = await this.dependencies.classroom.findScoped(
      classId,
      actor.institutionId,
    );
    if (!classRecord) throw notFound();
    if (
      actor.roles.includes("administrator") ||
      classRecord.ownerTeacherId === actor.id
    ) {
      return classRecord;
    }

    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.management_denied",
      targetId: classId,
      result: "denied",
    });
    throw notFound();
  }

  async listClasses(
    identity: VerifiedIdentity,
  ): Promise<readonly ClassSummary[]> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher", "administrator"],
    );
    return this.dependencies.classroom.listScoped(actor);
  }

  async listAcademicOptions(
    identity: VerifiedIdentity,
  ): Promise<AcademicOptions> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher", "administrator"],
    );
    return this.dependencies.classroom.listAcademicOptions(actor.institutionId);
  }

  async listAcademicCatalog(
    identity: VerifiedIdentity,
  ): Promise<AcademicCatalog> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    return this.dependencies.classroom.listAcademicCatalog(actor.institutionId);
  }

  private async createAcademicRecord(
    identity: VerifiedIdentity,
    action: string,
    create: (institutionId: string) => Promise<string>,
  ): Promise<{ id: string }> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    try {
      const id = await create(actor.institutionId);
      await this.dependencies.audit.record({
        actorId: actor.id,
        action,
        targetId: id,
        result: "succeeded",
      });
      return { id };
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  createDepartment(
    identity: VerifiedIdentity,
    request: DepartmentCreateRequest,
  ) {
    return this.createAcademicRecord(
      identity,
      "academic.department_created",
      (institutionId) =>
        this.dependencies.classroom.createDepartment(institutionId, request),
    );
  }

  createProgram(identity: VerifiedIdentity, request: ProgramCreateRequest) {
    return this.createAcademicRecord(
      identity,
      "academic.program_created",
      (institutionId) =>
        this.dependencies.classroom.createProgram(institutionId, request),
    );
  }

  createCourse(identity: VerifiedIdentity, request: CourseCreateRequest) {
    return this.createAcademicRecord(
      identity,
      "academic.course_created",
      (institutionId) =>
        this.dependencies.classroom.createCourse(institutionId, request),
    );
  }

  createTerm(identity: VerifiedIdentity, request: TermCreateRequest) {
    return this.createAcademicRecord(
      identity,
      "academic.term_created",
      (institutionId) =>
        this.dependencies.classroom.createTerm(institutionId, request),
    );
  }

  async getClass(
    identity: VerifiedIdentity,
    classId: string,
  ): Promise<ClassSummary> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher", "administrator"],
    );
    return this.requireVisibleClass(actor, classId);
  }

  async createClass(
    identity: VerifiedIdentity,
    request: ClassCreateRequest,
  ): Promise<ClassSummary> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher", "administrator"],
    );
    const administrator = actor.roles.includes("administrator");
    if (
      !administrator &&
      request.ownerTeacherId &&
      request.ownerTeacherId !== actor.id
    ) {
      throw new AuthorizationError(
        "PERMISSION_DENIED",
        "Teachers can create only their own classes.",
        403,
      );
    }
    if (administrator && !request.ownerTeacherId) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "An owner Teacher is required when an Administrator creates a class.",
        400,
      );
    }

    try {
      const created = await this.dependencies.classroom.create({
        actor,
        ownerTeacherId: request.ownerTeacherId ?? actor.id,
        request,
      });
      await this.dependencies.audit.record({
        actorId: actor.id,
        action: "class.created",
        targetId: created.id,
        result: "succeeded",
      });
      return created;
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  async updateClass(
    identity: VerifiedIdentity,
    classId: string,
    request: ClassUpdateRequest,
  ): Promise<ClassSummary> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher", "administrator"],
    );
    await this.requireManagedClass(actor, classId);
    try {
      const updated = await this.dependencies.classroom.update({
        classId,
        institutionId: actor.institutionId,
        request,
      });
      await this.dependencies.audit.record({
        actorId: actor.id,
        action: "class.updated",
        targetId: classId,
        result: "succeeded",
      });
      return updated;
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  async createInvitation(
    identity: VerifiedIdentity,
    classId: string,
    request: InvitationCreateRequest,
  ): Promise<InvitationCreated> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const classRecord = await this.requireManagedClass(actor, classId);
    if (classRecord.ownerTeacherId !== actor.id) throw notFound();
    if (classRecord.status === "archived") {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "Archived classes cannot issue invitations.",
        409,
      );
    }

    const expiresAt = new Date(request.expiresAt);
    if (expiresAt <= this.now()) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "Invitation expiry must be in the future.",
        400,
      );
    }

    const id = randomUUID();
    const code =
      this.dependencies.createInvitationCode?.() ??
      `${classId}.${randomBytes(24).toString("base64url")}`;
    await this.dependencies.classroom.createInvitation({
      id,
      classId,
      codeHash: hashInvitationCode(code),
      expiresAt,
      usageLimit: request.usageLimit,
    });
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.invitation_created",
      targetId: id,
      result: "succeeded",
    });
    return {
      id,
      classId,
      code,
      expiresAt: expiresAt.toISOString(),
      usageLimit: request.usageLimit,
      usageCount: 0,
    };
  }

  async revokeInvitation(
    identity: VerifiedIdentity,
    invitationId: string,
  ): Promise<void> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const invitation = await this.dependencies.classroom.findInvitation(
      invitationId,
      actor.institutionId,
    );
    if (!invitation) throw notFound();
    const classRecord = await this.requireManagedClass(
      actor,
      invitation.classId,
    );
    if (classRecord.ownerTeacherId !== actor.id) throw notFound();
    if (
      !(await this.dependencies.classroom.revokeInvitation(
        invitationId,
        invitation.classId,
      ))
    )
      throw notFound();
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.invitation_revoked",
      targetId: invitationId,
      result: "succeeded",
    });
  }

  async joinClass(
    identity: VerifiedIdentity,
    classId: string,
    code: string,
  ): Promise<ClassSummary> {
    if (!identity.emailVerified) {
      throw new AuthorizationError(
        "EMAIL_VERIFICATION_REQUIRED",
        "Verify your email address before joining a class.",
        403,
      );
    }
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student"],
    );
    try {
      const joined = await this.dependencies.classroom.joinWithInvitation({
        classId,
        actor,
        codeHash: hashInvitationCode(code),
        now: this.now(),
        maximumClassSize,
      });
      await this.dependencies.audit.record({
        actorId: actor.id,
        action: "enrollment.joined",
        targetId: classId,
        result: "succeeded",
      });
      return joined;
    } catch (error) {
      mapRepositoryError(error);
    }
  }

  async getRoster(
    identity: VerifiedIdentity,
    classId: string,
  ): Promise<readonly RosterMember[]> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher", "administrator"],
    );
    await this.requireManagedClass(actor, classId);
    return this.dependencies.classroom.listRoster(classId);
  }

  async changeEnrollment(
    identity: VerifiedIdentity,
    classId: string,
    studentId: string,
    request: EnrollmentChangeRequest,
  ): Promise<RosterMember> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher", "administrator"],
    );
    const classRecord = await this.requireManagedClass(actor, classId);
    if (classRecord.status === "archived") {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "Archived classes cannot accept enrollment changes.",
        409,
      );
    }
    try {
      const member = await this.dependencies.classroom.changeEnrollment({
        classId,
        studentId,
        state: request.state,
        now: this.now(),
      });
      await this.dependencies.audit.record({
        actorId: actor.id,
        action: "enrollment.changed",
        targetId: studentId,
        result: "succeeded",
        reason: request.reason,
      });
      return member;
    } catch (error) {
      mapRepositoryError(error);
    }
  }
}
