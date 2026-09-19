import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { Activity, ActivityForStudent } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ActivityService } from "./activity-service";
import type {
  ActivityRepository,
  ActivityServiceDependencies,
} from "./activity-types";

const teacher: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "teacher",
  email: "teacher@example.edu",
  displayName: "Ms. Teacher",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["teacher"],
  sectionId: null,
  authorizationVersion: 1,
};

const student: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000011",
  firebaseUid: "student",
  email: "student@example.edu",
  displayName: "A. Student",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["student"],
  sectionId: null,
  authorizationVersion: 1,
};

const teacherIdentity: VerifiedIdentity = {
  uid: "teacher",
  email: teacher.email,
  emailVerified: true,
};
const studentIdentity: VerifiedIdentity = {
  uid: "student",
  email: student.email,
  emailVerified: true,
};

const classId = "00000000-0000-4000-8000-000000000020";

const activity: Activity = {
  id: "00000000-0000-4000-8000-000000000030",
  classId,
  title: "Print your name",
  instructions: "Print your name to stdout.",
  language: "python",
  starterCode: null,
  referenceSolution: null,
  allowRetake: false,
  comparisonMode: "normalized_exact",
  numericTolerance: null,
  points: 100,
  deadlineAt: null,
  locked: false,
  isLocked: false,
  createdAt: "2026-09-10T00:00:00.000Z",
  testCases: [
    {
      id: "00000000-0000-4000-8000-000000000040",
      stdin: "",
      expectedStdout: "Hello",
      isHidden: false,
      showExpectedOutput: true,
      orderIndex: 0,
    },
  ],
  memberCount: 1,
  passedCount: 0,
  zeroedCount: 0,
};

const activityForStudent: ActivityForStudent = {
  id: activity.id,
  classId,
  title: activity.title,
  instructions: activity.instructions,
  language: activity.language,
  starterCode: null,
  allowRetake: false,
  comparisonMode: "normalized_exact",
  numericTolerance: null,
  points: 100,
  deadlineAt: null,
  isLocked: false,
  createdAt: activity.createdAt,
  testCases: [
    {
      id: activity.testCases[0]!.id,
      stdin: "",
      expectedStdout: "Hello",
      isHidden: false,
      orderIndex: 0,
    },
  ],
  attempt: null,
};

describe("ActivityService", () => {
  let repository: ActivityRepository;
  let getAccess: ReturnType<
    typeof vi.fn<
      (
        classId: string,
        userId: string,
      ) => Promise<{ isTeacher: boolean; isActiveMember: boolean } | null>
    >
  >;
  let audit: AuditSink;
  let service: ActivityService;

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(activity),
      update: vi.fn().mockResolvedValue(activity),
      remove: vi.fn().mockResolvedValue(undefined),
      listForTeacher: vi.fn().mockResolvedValue([]),
      listForStudent: vi.fn().mockResolvedValue([]),
      getForTeacher: vi.fn().mockResolvedValue(activity),
      getForStudent: vi.fn().mockResolvedValue(activityForStudent),
      findClassId: vi.fn().mockResolvedValue(classId),
      updateSchedule: vi.fn().mockResolvedValue(undefined),
      lock: vi.fn().mockResolvedValue(undefined),
      listSubmissions: vi.fn().mockResolvedValue([]),
      resetAttempt: vi.fn().mockResolvedValue(undefined),
      resetAttempts: vi.fn().mockResolvedValue(undefined),
    };
    getAccess = vi.fn();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    const dependencies: ActivityServiceDependencies = {
      identity: {
        requireActiveAccount: vi.fn(async (calledIdentity) =>
          calledIdentity.uid === teacherIdentity.uid ? teacher : student,
        ),
      },
      classes: { getAccess },
      activities: repository,
      audit,
    };
    service = new ActivityService(dependencies);
  });

  it("lets the class's teacher post an activity and audits it", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    const created = await service.createActivity(teacherIdentity, classId, {
      title: activity.title,
      instructions: activity.instructions,
      language: activity.language,
      allowRetake: false,
      testCases: [{ stdin: "", expectedStdout: "Hello" }],
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ classId, title: activity.title }),
      expect.any(Date),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activity.created",
        targetId: activity.id,
      }),
    );
    expect(created).toEqual(activity);
  });

  it("passes a teacher-supplied reference solution through to the repository", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    await service.createActivity(teacherIdentity, classId, {
      title: activity.title,
      instructions: activity.instructions,
      language: activity.language,
      allowRetake: false,
      referenceSolution: 'print("Hello")',
      testCases: [{ stdin: "", expectedStdout: "Hello" }],
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ referenceSolution: 'print("Hello")' }),
      expect.any(Date),
    );
  });

  it("defaults a missing reference solution to null", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    await service.createActivity(teacherIdentity, classId, {
      title: activity.title,
      instructions: activity.instructions,
      language: activity.language,
      allowRetake: false,
      testCases: [{ stdin: "", expectedStdout: "Hello" }],
    });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ referenceSolution: null }),
      expect.any(Date),
    );
  });

  it("404s posting an activity to a class the caller has no access to", async () => {
    getAccess.mockResolvedValue(null);
    await expect(
      service.createActivity(teacherIdentity, classId, {
        title: "x",
        instructions: "x",
        language: "python",
        allowRetake: false,
        testCases: [{ stdin: "", expectedStdout: "x" }],
      }),
    ).rejects.toThrow("Class not found.");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("blocks a class member who isn't the teacher from posting", async () => {
    getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
    await expect(
      service.createActivity(teacherIdentity, classId, {
        title: "x",
        instructions: "x",
        language: "python",
        allowRetake: false,
        testCases: [{ stdin: "", expectedStdout: "x" }],
      }),
    ).rejects.toThrow("Only this class's teacher can post an activity.");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("bulk-resets selected attempts for the class teacher", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    const studentIds = [student.id];
    await service.resetAttempts(teacherIdentity, activity.id, { studentIds });
    expect(repository.resetAttempts).toHaveBeenCalledWith(
      activity.id,
      studentIds,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activity.attempts_bulk_reset",
        targetId: activity.id,
      }),
    );
  });

  it("lets the class's teacher edit an activity and audits it", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    const updated = await service.updateActivity(teacherIdentity, activity.id, {
      title: "Updated title",
      instructions: activity.instructions,
      language: activity.language,
      allowRetake: false,
      testCases: [{ stdin: "", expectedStdout: "Hi" }],
    });
    expect(repository.update).toHaveBeenCalledWith(
      activity.id,
      expect.objectContaining({ title: "Updated title" }),
      expect.any(Date),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activity.updated",
        targetId: activity.id,
      }),
    );
    expect(updated).toEqual(activity);
  });

  it("blocks a non-teacher from editing an activity", async () => {
    getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
    await expect(
      service.updateActivity(teacherIdentity, activity.id, {
        title: "x",
        instructions: "x",
        language: "python",
        allowRetake: false,
        testCases: [{ stdin: "", expectedStdout: "x" }],
      }),
    ).rejects.toThrow("Activity not found.");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("lets the class's teacher delete an activity and audits it", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    await service.deleteActivity(teacherIdentity, activity.id);
    expect(repository.remove).toHaveBeenCalledWith(activity.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "activity.deleted",
        targetId: activity.id,
      }),
    );
  });

  it("blocks a non-teacher from deleting an activity", async () => {
    getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
    await expect(
      service.deleteActivity(teacherIdentity, activity.id),
    ).rejects.toThrow("Activity not found.");
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it("gives the teacher the full activity list shape", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    await service.listForClass(teacherIdentity, classId);
    expect(repository.listForTeacher).toHaveBeenCalledWith(
      classId,
      expect.any(Date),
    );
    expect(repository.listForStudent).not.toHaveBeenCalled();
  });

  it("gives an enrolled student the redacted activity list shape", async () => {
    getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
    await service.listForClass(studentIdentity, classId);
    expect(repository.listForStudent).toHaveBeenCalledWith(
      classId,
      student.id,
      expect.any(Date),
    );
  });

  it("404s listing activities for a class the caller isn't in", async () => {
    getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: false });
    await expect(
      service.listForClass(studentIdentity, classId),
    ).rejects.toThrow("Class not found.");
  });

  it("gives a student the redacted activity detail without answer keys", async () => {
    getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
    const detail = await service.getDetail(studentIdentity, activity.id);
    expect(repository.getForStudent).toHaveBeenCalledWith(
      activity.id,
      student.id,
      expect.any(Date),
    );
    expect(detail).toEqual(activityForStudent);
  });

  it("404s an activity detail request for a non-member", async () => {
    getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: false });
    await expect(
      service.getDetail(studentIdentity, activity.id),
    ).rejects.toThrow("Activity not found.");
  });

  it("lets the class's teacher reset a student's locked attempt and audits it", async () => {
    getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
    await service.resetAttempt(teacherIdentity, activity.id, student.id);
    expect(repository.resetAttempt).toHaveBeenCalledWith(
      activity.id,
      student.id,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "activity.attempt_reset" }),
    );
  });

  it("blocks a non-teacher from resetting an attempt", async () => {
    getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
    await expect(
      service.resetAttempt(teacherIdentity, activity.id, student.id),
    ).rejects.toThrow("Activity not found.");
    expect(repository.resetAttempt).not.toHaveBeenCalled();
  });
});
