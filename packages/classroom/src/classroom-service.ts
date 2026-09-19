import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  ClassCreateRequest,
  ClassJoinRequest,
  ClassUpdateRequest,
} from "@sqweb/contracts";

import type { ClassroomServiceDependencies } from "./types";

export class ClassroomService {
  constructor(private readonly dependencies: ClassroomServiceDependencies) {}

  async createClass(identity: VerifiedIdentity, request: ClassCreateRequest) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const created = await this.dependencies.classes.create({
      institutionId: actor.institutionId,
      teacherId: actor.id,
      subjectName: request.subjectName,
      sectionLabel: request.sectionLabel,
    });
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.created",
      targetId: created.id,
      result: "succeeded",
    });
    return created;
  }

  async listTeaching(identity: VerifiedIdentity) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    return this.dependencies.classes.listForTeacher(actor.id);
  }

  async listEnrolled(identity: VerifiedIdentity) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student"],
    );
    return this.dependencies.classes.listForStudent(actor.id);
  }

  async joinClass(identity: VerifiedIdentity, request: ClassJoinRequest) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student"],
    );
    const found = await this.dependencies.classes.findByJoinCode(
      request.joinCode,
    );
    if (!found) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "No class was found with that join code.",
        404,
      );
    }
    if (found.archivedAt) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "This class is no longer accepting new members.",
        400,
      );
    }
    await this.dependencies.classes.addMember(found.id, actor.id);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.joined",
      targetId: found.id,
      result: "succeeded",
    });
    const detail = await this.dependencies.classes.getDetail(found.id);
    if (!detail) throw new Error("Class could not be reloaded after joining.");
    return detail;
  }

  async getDetail(identity: VerifiedIdentity, classId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const allowed = await this.dependencies.classes.isTeacherOrMember(
      classId,
      actor.id,
    );
    if (!allowed) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    const detail = await this.dependencies.classes.getDetail(classId);
    if (!detail) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    return detail;
  }

  async updateClass(
    identity: VerifiedIdentity,
    classId: string,
    request: ClassUpdateRequest,
  ) {
    const actor = await this.requireTeacherOwner(identity, classId);
    const updated = await this.dependencies.classes.update(classId, {
      subjectName: request.subjectName,
      sectionLabel: request.sectionLabel,
    });
    if (!updated) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.updated",
      targetId: classId,
      result: "succeeded",
    });
    return updated;
  }

  async archiveClass(identity: VerifiedIdentity, classId: string) {
    const actor = await this.requireTeacherOwner(identity, classId);
    const archived = await this.dependencies.classes.archive(classId);
    if (!archived) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.archived",
      targetId: classId,
      result: "succeeded",
    });
    return archived;
  }

  async unarchiveClass(identity: VerifiedIdentity, classId: string) {
    const actor = await this.requireTeacherOwner(identity, classId);
    const unarchived = await this.dependencies.classes.unarchive(classId);
    if (!unarchived) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.unarchived",
      targetId: classId,
      result: "succeeded",
    });
    return unarchived;
  }

  async regenerateJoinCode(identity: VerifiedIdentity, classId: string) {
    const actor = await this.requireTeacherOwner(identity, classId);
    const updated = await this.dependencies.classes.regenerateJoinCode(
      classId,
    );
    if (!updated) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.join_code_regenerated",
      targetId: classId,
      result: "succeeded",
    });
    return updated;
  }

  async removeMember(
    identity: VerifiedIdentity,
    classId: string,
    studentId: string,
  ) {
    const actor = await this.requireTeacherOwner(identity, classId);
    await this.dependencies.classes.removeMember(classId, studentId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.member_removed",
      targetId: classId,
      result: "succeeded",
    });
    const detail = await this.dependencies.classes.getDetail(classId);
    if (!detail) throw new Error("Class could not be reloaded after removing a member.");
    return detail;
  }

  async leaveClass(identity: VerifiedIdentity, classId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student"],
    );
    const access = await this.dependencies.classes.getAccess(
      classId,
      actor.id,
    );
    if (!access?.isActiveMember) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    await this.dependencies.classes.removeMember(classId, actor.id);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.left",
      targetId: classId,
      result: "succeeded",
    });
  }

  async deleteClass(identity: VerifiedIdentity, classId: string) {
    const actor = await this.requireTeacherOwner(identity, classId);
    const dependents =
      await this.dependencies.classes.countDependents(classId);
    if (dependents.members > 0) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "This class still has enrolled students. Remove them first, or archive the class instead.",
        400,
      );
    }
    if (
      dependents.activities > 0 ||
      dependents.quizzes > 0 ||
      dependents.races > 0
    ) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "This class has classwork (activities, quizzes, or races), so it can't be deleted. Archive it instead.",
        400,
      );
    }
    await this.dependencies.classes.remove(classId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "class.deleted",
      targetId: classId,
      result: "succeeded",
    });
  }

  private async requireTeacherOwner(
    identity: VerifiedIdentity,
    classId: string,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const access = await this.dependencies.classes.getAccess(
      classId,
      actor.id,
    );
    if (!access?.isTeacher) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    return actor;
  }
}
