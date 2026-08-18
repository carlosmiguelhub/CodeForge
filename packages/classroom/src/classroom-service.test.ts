import type { AccountProfile, AuditSink } from "@sqweb/auth";
import { AuthorizationError } from "@sqweb/auth";
import type { ClassSummary } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ClassroomService } from "./classroom-service";
import type { ClassroomRepository } from "./types";
import { ClassroomRepositoryError } from "./types";

const institutionId = "00000000-0000-4000-8000-000000000001";
const teacherId = "00000000-0000-4000-8000-000000000002";
const studentId = "00000000-0000-4000-8000-000000000003";
const classId = "00000000-0000-4000-8000-000000000004";
const courseId = "00000000-0000-4000-8000-000000000005";
const termId = "00000000-0000-4000-8000-000000000006";

const teacher: AccountProfile = {
  id: teacherId,
  firebaseUid: "teacher",
  email: "teacher@example.edu",
  displayName: "Teacher",
  institutionId,
  status: "active",
  roles: ["teacher"],
  authorizationVersion: 1,
};

const summary: ClassSummary = {
  id: classId,
  institutionId,
  courseId,
  courseCode: "DB101",
  courseTitle: "Database Fundamentals",
  termId,
  termName: "First Term",
  section: "A",
  ownerTeacherId: teacherId,
  ownerTeacherName: "Teacher",
  status: "active",
  enrolledCount: 0,
  createdAt: "2026-08-18T00:00:00.000Z",
};

function repository(): ClassroomRepository {
  return {
    listAcademicOptions: vi.fn().mockResolvedValue({ courses: [], terms: [] }),
    listAcademicCatalog: vi.fn().mockResolvedValue({
      departments: [],
      programs: [],
      courses: [],
      terms: [],
    }),
    createDepartment: vi.fn(),
    createProgram: vi.fn(),
    createCourse: vi.fn(),
    createTerm: vi.fn(),
    listScoped: vi.fn().mockResolvedValue([]),
    findScoped: vi.fn().mockResolvedValue(summary),
    canAccess: vi.fn().mockResolvedValue(true),
    create: vi.fn().mockResolvedValue(summary),
    update: vi.fn().mockResolvedValue(summary),
    createInvitation: vi.fn().mockResolvedValue(undefined),
    findInvitation: vi.fn().mockResolvedValue(null),
    revokeInvitation: vi.fn().mockResolvedValue(true),
    joinWithInvitation: vi.fn().mockResolvedValue(summary),
    listRoster: vi.fn().mockResolvedValue([]),
    changeEnrollment: vi.fn(),
  };
}

describe("ClassroomService", () => {
  let classroom: ClassroomRepository;
  let audit: AuditSink;

  beforeEach(() => {
    classroom = repository();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
  });

  function service(actor: AccountProfile = teacher) {
    return new ClassroomService({
      identity: {
        requireActiveAccount: vi.fn().mockResolvedValue(actor),
      },
      classroom,
      audit,
      now: () => new Date("2026-08-18T00:00:00.000Z"),
      createInvitationCode: () => "A".repeat(32),
    });
  }

  it("creates a Teacher-owned class and audits the mutation", async () => {
    const result = await service().createClass(
      { uid: "teacher", email: teacher.email, emailVerified: true },
      { courseId, termId, section: "A" },
    );

    expect(result).toEqual(summary);
    expect(classroom.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerTeacherId: teacherId }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "class.created", targetId: classId }),
    );
  });

  it("prevents a Teacher from assigning a different owner", async () => {
    const action = service().createClass(
      { uid: "teacher", email: teacher.email, emailVerified: true },
      {
        courseId,
        termId,
        section: "A",
        ownerTeacherId: studentId,
      },
    );
    await expect(action).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
      statusCode: 403,
    });
    expect(classroom.create).not.toHaveBeenCalled();
  });

  it("returns an invitation code once and persists only its hash", async () => {
    const result = await service().createInvitation(
      { uid: "teacher", email: teacher.email, emailVerified: true },
      classId,
      { expiresAt: "2026-08-19T00:00:00.000Z", usageLimit: 10 },
    );

    expect(result.code).toBe("A".repeat(32));
    expect(classroom.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        classId,
        codeHash:
          "22a48051594c1949deed7040850c1f0f8764537f5191be56732d16a54c1d8153",
      }),
    );
    expect(
      JSON.stringify(vi.mocked(classroom.createInvitation).mock.calls),
    ).not.toContain("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  });

  it("rejects an invitation whose expiry is not in the future", async () => {
    const action = service().createInvitation(
      { uid: "teacher", email: teacher.email, emailVerified: true },
      classId,
      { expiresAt: "2026-08-18T00:00:00.000Z", usageLimit: 10 },
    );
    await expect(action).rejects.toBeInstanceOf(AuthorizationError);
    expect(classroom.createInvitation).not.toHaveBeenCalled();
  });

  it("conceals a class from a non-member", async () => {
    vi.mocked(classroom.canAccess).mockResolvedValue(false);
    const student: AccountProfile = {
      ...teacher,
      id: studentId,
      firebaseUid: "student",
      email: "student@example.edu",
      roles: ["student"],
    };
    const action = service(student).getClass(
      { uid: "student", email: student.email, emailVerified: true },
      classId,
    );
    await expect(action).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("maps an invalid invitation to a concealed not-found response", async () => {
    vi.mocked(classroom.joinWithInvitation).mockRejectedValue(
      new ClassroomRepositoryError("invite_invalid"),
    );
    const student: AccountProfile = {
      ...teacher,
      id: studentId,
      firebaseUid: "student",
      email: "student@example.edu",
      roles: ["student"],
    };
    const action = service(student).joinClass(
      { uid: "student", email: student.email, emailVerified: true },
      classId,
      "B".repeat(32),
    );
    await expect(action).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      statusCode: 404,
    });
  });

  it("requires current email verification before enrollment", async () => {
    const student: AccountProfile = {
      ...teacher,
      id: studentId,
      firebaseUid: "student",
      email: "student@example.edu",
      roles: ["student"],
    };
    const action = service(student).joinClass(
      { uid: "student", email: student.email, emailVerified: false },
      classId,
      "B".repeat(32),
    );
    await expect(action).rejects.toMatchObject({
      code: "EMAIL_VERIFICATION_REQUIRED",
      statusCode: 403,
    });
    expect(classroom.joinWithInvitation).not.toHaveBeenCalled();
  });

  it("requires an audit reason when changing enrollment", async () => {
    const rosterMember = {
      userId: studentId,
      displayName: "Student",
      email: "student@example.edu",
      state: "removed" as const,
      joinedAt: "2026-08-17T00:00:00.000Z",
      removedAt: "2026-08-18T00:00:00.000Z",
    };
    vi.mocked(classroom.changeEnrollment).mockResolvedValue(rosterMember);
    await service().changeEnrollment(
      { uid: "teacher", email: teacher.email, emailVerified: true },
      classId,
      studentId,
      { state: "removed", reason: "Student left this class" },
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "enrollment.changed",
        reason: "Student left this class",
      }),
    );
  });
});
