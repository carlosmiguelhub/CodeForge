import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  RaceBulkResetRequest,
  RaceCreateRequest,
  RaceScheduleUpdateRequest,
  RaceUpdateRequest,
} from "@sqweb/contracts";

import type { RaceServiceDependencies } from "./race-types";

export class RaceService {
  constructor(private readonly dependencies: RaceServiceDependencies) {}

  private now() {
    return this.dependencies.now?.() ?? new Date();
  }

  async createRace(
    identity: VerifiedIdentity,
    classId: string,
    request: RaceCreateRequest,
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
        "Only this class's teacher can post a Code Racing quiz.",
        403,
      );
    }
    const now = this.now();
    if (new Date(request.closesAt).getTime() <= now.getTime()) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "The close time must be in the future.",
        400,
      );
    }
    const created = await this.dependencies.races.create(
      {
        classId,
        title: request.title,
        durationMinutes: request.durationMinutes,
        opensAt: new Date(request.opensAt),
        closesAt: new Date(request.closesAt),
        problems: request.problems.map((problem) => ({
          title: problem.title,
          instructions: problem.instructions,
          language: problem.language,
          starterCode: problem.starterCode ?? null,
          referenceSolution: problem.referenceSolution ?? null,
          comparisonMode: problem.comparisonMode ?? "suffix_exact",
          numericTolerance:
            problem.comparisonMode === "numeric"
              ? (problem.numericTolerance ?? null)
              : null,
          points: problem.points ?? 100,
          testCases: problem.testCases.map((testCase) => ({
            stdin: testCase.stdin,
            expectedStdout: testCase.expectedStdout,
            isHidden: testCase.isHidden ?? false,
            showExpectedOutput:
              !testCase.isHidden && (testCase.showExpectedOutput ?? false),
          })),
        })),
      },
      now,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "race.created",
      targetId: created.id,
      result: "succeeded",
    });
    return created;
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
      ? this.dependencies.races.listForTeacher(classId, now)
      : this.dependencies.races.listForStudent(classId, actor.id, now);
  }

  async getDetail(identity: VerifiedIdentity, raceId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const { access } = await this.requireAccessibleClass(raceId, actor.id);
    const now = this.now();
    const detail = access?.isTeacher
      ? await this.dependencies.races.getForTeacher(raceId, now)
      : await this.dependencies.races.getForStudent(raceId, actor.id, now);
    if (!detail || (!access?.isTeacher && detail.status === "draft")) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Code Racing quiz not found.",
        404,
      );
    }
    return detail;
  }

  // Full edit — title/duration/problems, same "always editable, no draft
  // gate" precedent as Activity's updateActivity (a race goes live as
  // "open" immediately on create, so there's no draft window to restrict
  // this to). Never touches opensAt/closesAt/status; those stay the
  // schedule endpoint's job so extend/reopen and problem edits can't
  // stomp on each other in one request.
  async updateRace(
    identity: VerifiedIdentity,
    raceId: string,
    request: RaceUpdateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(raceId, actor.id);
    const updated = await this.dependencies.races.update(
      raceId,
      {
        title: request.title,
        durationMinutes: request.durationMinutes,
        problems: request.problems.map((problem) => ({
          title: problem.title,
          instructions: problem.instructions,
          language: problem.language,
          starterCode: problem.starterCode ?? null,
          referenceSolution: problem.referenceSolution ?? null,
          comparisonMode: problem.comparisonMode ?? "suffix_exact",
          numericTolerance:
            problem.comparisonMode === "numeric"
              ? (problem.numericTolerance ?? null)
              : null,
          points: problem.points ?? 100,
          testCases: problem.testCases.map((testCase) => ({
            stdin: testCase.stdin,
            expectedStdout: testCase.expectedStdout,
            isHidden: testCase.isHidden ?? false,
            showExpectedOutput:
              !testCase.isHidden && (testCase.showExpectedOutput ?? false),
          })),
        })),
      },
      this.now(),
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "race.updated",
      targetId: raceId,
      result: "succeeded",
    });
    return updated;
  }

  async deleteRace(identity: VerifiedIdentity, raceId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(raceId, actor.id);
    await this.dependencies.races.remove(raceId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "race.deleted",
      targetId: raceId,
      result: "succeeded",
    });
  }

  // Serves both "extend time" and "restart" — pushes closesAt forward and
  // unconditionally reopens the race. Never touches attempts/scores; a
  // teacher who wants to wipe one student's progress uses the separate
  // reset action instead.
  async updateSchedule(
    identity: VerifiedIdentity,
    raceId: string,
    request: RaceScheduleUpdateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(raceId, actor.id);
    const now = this.now();
    if (new Date(request.closesAt).getTime() <= now.getTime()) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "The close time must be in the future.",
        400,
      );
    }
    await this.dependencies.races.updateSchedule(
      raceId,
      new Date(request.closesAt),
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "race.schedule_updated",
      targetId: raceId,
      result: "succeeded",
    });
    const updated = await this.dependencies.races.getForTeacher(raceId, now);
    if (!updated) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Code Racing quiz not found.",
        404,
      );
    }
    return updated;
  }

  async getLeaderboard(identity: VerifiedIdentity, raceId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    await this.requireAccessibleClass(raceId, actor.id);
    return this.dependencies.races.listRaceLeaderboard(raceId);
  }

  // Teacher-only — submissions include other students' code, same
  // precedent as Activity's listSubmissions.
  async listSubmissions(identity: VerifiedIdentity, raceId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    const classId = await this.requireTeacher(raceId, actor.id);
    return this.dependencies.races.listSubmissions(raceId, classId);
  }

  // Wipes one student's progress so they can redo the race — the
  // "make a specific student re-answer" action. Never used implicitly by
  // updateSchedule/"restart"; always an explicit, separate teacher choice.
  async resetStudent(
    identity: VerifiedIdentity,
    raceId: string,
    studentId: string,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(raceId, actor.id);
    await this.dependencies.races.resetStudent(raceId, studentId, this.now());
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "race.attempt_reset",
      targetId: `${raceId}:${studentId}`,
      result: "succeeded",
    });
  }

  async resetStudents(
    identity: VerifiedIdentity,
    raceId: string,
    request: RaceBulkResetRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(raceId, actor.id);
    await this.dependencies.races.resetStudents(
      raceId,
      request.studentIds,
      this.now(),
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "race.attempts_bulk_reset",
      targetId: raceId,
      result: "succeeded",
    });
  }

  // Scoped alternative to resetStudent — for "they aced problem 1, let
  // them redo problem 2" without wiping problem 1's already-earned score,
  // including reopening the attempt if it had already ended.
  async resetProblem(
    identity: VerifiedIdentity,
    raceId: string,
    studentId: string,
    problemId: string,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["teacher"],
    );
    await this.requireTeacher(raceId, actor.id);
    await this.dependencies.races.resetProblem(raceId, studentId, problemId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "race.problem_reset",
      targetId: `${raceId}:${studentId}:${problemId}`,
      result: "succeeded",
    });
  }

  private async requireAccessibleClass(raceId: string, actorId: string) {
    const classId = await this.dependencies.races.findClassId(raceId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Code Racing quiz not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actorId);
    if (!access || (!access.isTeacher && !access.isActiveMember)) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Code Racing quiz not found.",
        404,
      );
    }
    return { classId, access };
  }

  private async requireTeacher(raceId: string, actorId: string) {
    const classId = await this.dependencies.races.findClassId(raceId);
    if (!classId) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Code Racing quiz not found.",
        404,
      );
    }
    const access = await this.dependencies.classes.getAccess(classId, actorId);
    if (!access?.isTeacher) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Code Racing quiz not found.",
        404,
      );
    }
    return classId;
  }
}
