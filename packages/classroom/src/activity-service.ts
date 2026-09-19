import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  ActivityBulkResetRequest,
  ActivityCreateRequest,
  ActivityScheduleUpdateRequest,
} from "@sqweb/contracts";

import type { ActivityServiceDependencies } from "./activity-types";

export class ActivityService {
  constructor(private readonly dependencies: ActivityServiceDependencies) {}

  private now() {
    return this.dependencies.now?.() ?? new Date();
  }

  async createActivity(
    identity: VerifiedIdentity,
    classId: string,
    request: ActivityCreateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const access = await this.dependencies.classes.getAccess(classId, actor.id);
    if (!access) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    if (!access.isTeacher) {
      throw new AuthorizationError(
        "PERMISSION_DENIED",
        "Only this class's teacher can post an activity.",
        403,
      );
    }
    const now = this.now();
    if (
      request.deadlineAt &&
      new Date(request.deadlineAt).getTime() <= now.getTime()
    ) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "The deadline must be in the future.",
        400,
      );
    }
    const created = await this.dependencies.activities.create(
      {
        classId,
        title: request.title,
        instructions: request.instructions,
        language: request.language,
        starterCode: request.starterCode ?? null,
        referenceSolution: request.referenceSolution ?? null,
        allowRetake: request.allowRetake,
        comparisonMode: request.comparisonMode ?? "suffix_exact",
        numericTolerance:
          request.comparisonMode === "numeric"
            ? (request.numericTolerance ?? null)
            : null,
        points: request.points ?? 100,
        deadlineAt: request.deadlineAt ? new Date(request.deadlineAt) : null,
        testCases: request.testCases.map((testCase) => ({
          stdin: testCase.stdin,
          expectedStdout: testCase.expectedStdout,
          isHidden: testCase.isHidden ?? false,
          showExpectedOutput:
            !testCase.isHidden && (testCase.showExpectedOutput ?? false),
        })),
      },
      now,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "activity.created",
      targetId: created.id,
      result: "succeeded",
    });
    return created;
  }

  // Full edit — deadlineAt travels along with the rest of the content, but
  // (unlike createActivity) isn't required to be in the future: a teacher
  // fixing test cases on an already-closed activity shouldn't be forced to
  // also touch the schedule. Never touches the manual `locked` flag either
  // — that's the dedicated lock/schedule actions' job, so a routine content
  // edit can never accidentally unlock (or lock) an activity.
  async updateActivity(
    identity: VerifiedIdentity,
    activityId: string,
    request: ActivityCreateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(activityId, actor.id);
    const now = this.now();
    const updated = await this.dependencies.activities.update(
      activityId,
      {
        title: request.title,
        instructions: request.instructions,
        language: request.language,
        starterCode: request.starterCode ?? null,
        referenceSolution: request.referenceSolution ?? null,
        allowRetake: request.allowRetake,
        comparisonMode: request.comparisonMode ?? "suffix_exact",
        numericTolerance:
          request.comparisonMode === "numeric"
            ? (request.numericTolerance ?? null)
            : null,
        points: request.points ?? 100,
        deadlineAt: request.deadlineAt ? new Date(request.deadlineAt) : null,
        testCases: request.testCases.map((testCase) => ({
          stdin: testCase.stdin,
          expectedStdout: testCase.expectedStdout,
          isHidden: testCase.isHidden ?? false,
          showExpectedOutput:
            !testCase.isHidden && (testCase.showExpectedOutput ?? false),
        })),
      },
      now,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "activity.updated",
      targetId: activityId,
      result: "succeeded",
    });
    return updated;
  }

  // The teacher's quick deadline control — separate from the full edit
  // form, same "extend and reopen in one action" precedent as Race's
  // updateSchedule. Setting a new (future) deadline, or clearing it with
  // null, also unconditionally reopens (clears the manual lock).
  async updateSchedule(
    identity: VerifiedIdentity,
    activityId: string,
    request: ActivityScheduleUpdateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(activityId, actor.id);
    const now = this.now();
    if (
      request.deadlineAt &&
      new Date(request.deadlineAt).getTime() <= now.getTime()
    ) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "The deadline must be in the future.",
        400,
      );
    }
    await this.dependencies.activities.updateSchedule(
      activityId,
      request.deadlineAt ? new Date(request.deadlineAt) : null,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "activity.schedule_updated",
      targetId: activityId,
      result: "succeeded",
    });
    const updated = await this.dependencies.activities.getForTeacher(
      activityId,
      now,
    );
    if (!updated) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    return updated;
  }

  // The teacher's manual "lock now" action — independent of the deadline,
  // takes effect immediately even if no deadline is set at all.
  async lockActivity(identity: VerifiedIdentity, activityId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(activityId, actor.id);
    await this.dependencies.activities.lock(activityId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "activity.locked",
      targetId: activityId,
      result: "succeeded",
    });
    const updated = await this.dependencies.activities.getForTeacher(
      activityId,
      this.now(),
    );
    if (!updated) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    return updated;
  }

  async deleteActivity(identity: VerifiedIdentity, activityId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(activityId, actor.id);
    await this.dependencies.activities.remove(activityId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "activity.deleted",
      targetId: activityId,
      result: "succeeded",
    });
  }

  private async requireTeacher(activityId: string, actorId: string) {
    const classId = await this.dependencies.activities.findClassId(activityId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actorId);
    if (!access?.isTeacher) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    return classId;
  }

  async listForClass(identity: VerifiedIdentity, classId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const access = await this.dependencies.classes.getAccess(classId, actor.id);
    if (!access || (!access.isTeacher && !access.isActiveMember)) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Class not found.",
        404,
      );
    }
    const now = this.now();
    return access.isTeacher
      ? this.dependencies.activities.listForTeacher(classId, now)
      : this.dependencies.activities.listForStudent(classId, actor.id, now);
  }

  async getDetail(identity: VerifiedIdentity, activityId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const classId = await this.dependencies.activities.findClassId(activityId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actor.id);
    if (!access || (!access.isTeacher && !access.isActiveMember)) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    const now = this.now();
    const detail = access.isTeacher
      ? await this.dependencies.activities.getForTeacher(activityId, now)
      : await this.dependencies.activities.getForStudent(
          activityId,
          actor.id,
          now,
        );
    if (!detail) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    return detail;
  }

  // Teacher-only — submissions include other students' code, so an active
  // member who isn't the teacher doesn't get this even though they can see
  // the activity itself.
  async listSubmissions(identity: VerifiedIdentity, activityId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const classId = await this.dependencies.activities.findClassId(activityId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actor.id);
    if (!access?.isTeacher) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    return this.dependencies.activities.listSubmissions(activityId, classId);
  }

  // Teacher-only — the sole unlock path for a passed-and-locked or
  // zeroed_violation attempt (a zero never self-clears via allowRetake).
  async resetAttempt(
    identity: VerifiedIdentity,
    activityId: string,
    studentId: string,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const classId = await this.dependencies.activities.findClassId(activityId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actor.id);
    if (!access?.isTeacher) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    await this.dependencies.activities.resetAttempt(activityId, studentId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "activity.attempt_reset",
      targetId: `${activityId}:${studentId}`,
      result: "succeeded",
    });
  }

  async resetAttempts(
    identity: VerifiedIdentity,
    activityId: string,
    request: ActivityBulkResetRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const classId = await this.dependencies.activities.findClassId(activityId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actor.id);
    if (!access?.isTeacher) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Activity not found.",
        404,
      );
    }
    await this.dependencies.activities.resetAttempts(
      activityId,
      request.studentIds,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "activity.attempts_bulk_reset",
      targetId: activityId,
      result: "succeeded",
    });
  }
}
