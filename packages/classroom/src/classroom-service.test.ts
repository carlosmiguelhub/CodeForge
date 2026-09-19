import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { Class, ClassDetail } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClassroomService } from "./classroom-service";
import type { ClassroomRepository } from "./types";

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

const klass: Class = {
  id: "00000000-0000-4000-8000-000000000020",
  teacherId: teacher.id,
  teacherName: teacher.displayName,
  subjectName: "Databases 101",
  sectionLabel: "BSIT 2B",
  joinCode: "ABC123",
  archivedAt: null,
  createdAt: "2026-09-10T00:00:00.000Z",
  memberCount: 0,
};

const classDetail: ClassDetail = { ...klass, members: [] };

describe("ClassroomService", () => {
  let repository: ClassroomRepository;
  let audit: AuditSink;
  let service: ClassroomService;
  let requireActiveAccount: ReturnType<
    typeof vi.fn<
      (
        identity: VerifiedIdentity,
        roles?: readonly ("student" | "teacher" | "administrator")[],
      ) => Promise<AccountProfile>
    >
  >;

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(klass),
      listForTeacher: vi.fn().mockResolvedValue([klass]),
      listForStudent: vi.fn().mockResolvedValue([klass]),
      findByJoinCode: vi.fn().mockResolvedValue({
        id: klass.id,
        teacherId: teacher.id,
        archivedAt: null,
      }),
      isTeacherOrMember: vi.fn().mockResolvedValue(true),
      addMember: vi.fn().mockResolvedValue(undefined),
      removeMember: vi.fn().mockResolvedValue(undefined),
      getDetail: vi.fn().mockResolvedValue(classDetail),
      getAccess: vi
        .fn()
        .mockResolvedValue({ isTeacher: true, isActiveMember: false }),
      update: vi.fn().mockResolvedValue(klass),
      archive: vi
        .fn()
        .mockResolvedValue({ ...klass, archivedAt: "2026-09-19T00:00:00.000Z" }),
      unarchive: vi.fn().mockResolvedValue(klass),
      regenerateJoinCode: vi
        .fn()
        .mockResolvedValue({ ...klass, joinCode: "ZZZ999" }),
      countDependents: vi
        .fn()
        .mockResolvedValue({ members: 0, activities: 0, quizzes: 0, races: 0 }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    requireActiveAccount = vi.fn(async (_identity, roles) => {
      if (roles?.includes("teacher")) return teacher;
      return student;
    });
    service = new ClassroomService({
      identity: { requireActiveAccount },
      classes: repository,
      audit,
    });
  });

  it("lets a teacher create a class and audits it", async () => {
    const created = await service.createClass(teacherIdentity, {
      subjectName: klass.subjectName,
      sectionLabel: klass.sectionLabel,
    });
    expect(repository.create).toHaveBeenCalledWith({
      institutionId: teacher.institutionId,
      teacherId: teacher.id,
      subjectName: klass.subjectName,
      sectionLabel: klass.sectionLabel,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "class.created", targetId: klass.id }),
    );
    expect(created).toEqual(klass);
  });

  it("lists classes a teacher teaches", async () => {
    const list = await service.listTeaching(teacherIdentity);
    expect(repository.listForTeacher).toHaveBeenCalledWith(teacher.id);
    expect(list).toEqual([klass]);
  });

  it("lists classes a student is enrolled in", async () => {
    const list = await service.listEnrolled(studentIdentity);
    expect(repository.listForStudent).toHaveBeenCalledWith(student.id);
    expect(list).toEqual([klass]);
  });

  it("lets a student join a class by code and audits it", async () => {
    const detail = await service.joinClass(studentIdentity, {
      joinCode: klass.joinCode,
    });
    expect(repository.findByJoinCode).toHaveBeenCalledWith(klass.joinCode);
    expect(repository.addMember).toHaveBeenCalledWith(klass.id, student.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "class.joined", targetId: klass.id }),
    );
    expect(detail).toEqual(classDetail);
  });

  it("rejects joining with an unknown code", async () => {
    vi.mocked(repository.findByJoinCode).mockResolvedValue(null);
    await expect(
      service.joinClass(studentIdentity, { joinCode: "ZZZZZZ" }),
    ).rejects.toThrow("No class was found with that join code.");
    expect(repository.addMember).not.toHaveBeenCalled();
  });

  it("rejects joining an archived class", async () => {
    vi.mocked(repository.findByJoinCode).mockResolvedValue({
      id: klass.id,
      teacherId: teacher.id,
      archivedAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await expect(
      service.joinClass(studentIdentity, { joinCode: klass.joinCode }),
    ).rejects.toThrow("no longer accepting new members");
    expect(repository.addMember).not.toHaveBeenCalled();
  });

  it("404s a class detail request from someone who isn't the teacher or a member", async () => {
    vi.mocked(repository.isTeacherOrMember).mockResolvedValue(false);
    await expect(service.getDetail(studentIdentity, klass.id)).rejects.toThrow(
      "Class not found.",
    );
    expect(repository.getDetail).not.toHaveBeenCalled();
  });

  it("returns class detail for a member", async () => {
    const detail = await service.getDetail(studentIdentity, klass.id);
    expect(detail).toEqual(classDetail);
  });

  it("lets the owning teacher rename a class and audits it", async () => {
    await service.updateClass(teacherIdentity, klass.id, {
      subjectName: "New name",
      sectionLabel: "New section",
    });
    expect(repository.update).toHaveBeenCalledWith(klass.id, {
      subjectName: "New name",
      sectionLabel: "New section",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "class.updated", targetId: klass.id }),
    );
  });

  it("404s a rename from someone who isn't the owning teacher", async () => {
    vi.mocked(repository.getAccess).mockResolvedValue({
      isTeacher: false,
      isActiveMember: true,
    });
    await expect(
      service.updateClass(studentIdentity, klass.id, {
        subjectName: "New name",
        sectionLabel: "New section",
      }),
    ).rejects.toThrow("Class not found.");
    expect(repository.update).not.toHaveBeenCalled();
  });

  it("archives and unarchives a class", async () => {
    await service.archiveClass(teacherIdentity, klass.id);
    expect(repository.archive).toHaveBeenCalledWith(klass.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "class.archived",
        targetId: klass.id,
      }),
    );

    await service.unarchiveClass(teacherIdentity, klass.id);
    expect(repository.unarchive).toHaveBeenCalledWith(klass.id);
  });

  it("regenerates a join code", async () => {
    const updated = await service.regenerateJoinCode(
      teacherIdentity,
      klass.id,
    );
    expect(repository.regenerateJoinCode).toHaveBeenCalledWith(klass.id);
    expect(updated.joinCode).toBe("ZZZ999");
  });

  it("removes a member and returns refreshed detail", async () => {
    const detail = await service.removeMember(
      teacherIdentity,
      klass.id,
      student.id,
    );
    expect(repository.removeMember).toHaveBeenCalledWith(
      klass.id,
      student.id,
    );
    expect(detail).toEqual(classDetail);
  });

  it("lets an enrolled student leave a class and audits it", async () => {
    vi.mocked(repository.getAccess).mockResolvedValue({
      isTeacher: false,
      isActiveMember: true,
    });
    await service.leaveClass(studentIdentity, klass.id);
    expect(repository.removeMember).toHaveBeenCalledWith(
      klass.id,
      student.id,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "class.left", targetId: klass.id }),
    );
  });

  it("404s leaving a class you're not enrolled in", async () => {
    vi.mocked(repository.getAccess).mockResolvedValue({
      isTeacher: false,
      isActiveMember: false,
    });
    await expect(
      service.leaveClass(studentIdentity, klass.id),
    ).rejects.toThrow("Class not found.");
    expect(repository.removeMember).not.toHaveBeenCalled();
  });

  it("deletes an empty class and audits it", async () => {
    await service.deleteClass(teacherIdentity, klass.id);
    expect(repository.remove).toHaveBeenCalledWith(klass.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "class.deleted", targetId: klass.id }),
    );
  });

  it("refuses to delete a class with an enrolled student", async () => {
    vi.mocked(repository.countDependents).mockResolvedValue({
      members: 1,
      activities: 0,
      quizzes: 0,
      races: 0,
    });
    await expect(
      service.deleteClass(teacherIdentity, klass.id),
    ).rejects.toThrow("still has enrolled students");
    expect(repository.remove).not.toHaveBeenCalled();
  });

  it("refuses to delete a class with classwork even if no students are enrolled", async () => {
    vi.mocked(repository.countDependents).mockResolvedValue({
      members: 0,
      activities: 1,
      quizzes: 0,
      races: 0,
    });
    await expect(
      service.deleteClass(teacherIdentity, klass.id),
    ).rejects.toThrow("Archive it instead.");
    expect(repository.remove).not.toHaveBeenCalled();
  });
});
