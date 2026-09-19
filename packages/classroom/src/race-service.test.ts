import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { RaceForStudent, RaceForTeacher } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RaceService } from "./race-service";
import type { RaceRepository, RaceServiceDependencies } from "./race-types";

const classId = "00000000-0000-4000-8000-000000000020";
const raceId = "00000000-0000-4000-8000-000000000030";
const now = new Date("2026-09-10T01:00:00.000Z");

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
  ...teacher,
  id: "00000000-0000-4000-8000-000000000011",
  firebaseUid: "student",
  email: "student@example.edu",
  displayName: "A. Student",
  roles: ["student"],
};

const teacherIdentity: VerifiedIdentity = {
  uid: teacher.firebaseUid,
  email: teacher.email,
  emailVerified: true,
};
const studentIdentity: VerifiedIdentity = {
  uid: student.firebaseUid,
  email: student.email,
  emailVerified: true,
};

const raceForTeacher: RaceForTeacher = {
  id: raceId,
  classId,
  title: "Code Quiz #1",
  durationMinutes: 120,
  opensAt: "2026-09-10T00:00:00.000Z",
  closesAt: "2026-09-10T03:00:00.000Z",
  status: "open",
  availability: "open",
  totalPoints: 300,
  createdAt: "2026-09-09T00:00:00.000Z",
  problems: [
    {
      id: "00000000-0000-4000-8000-000000000040",
      orderIndex: 0,
      title: "Even or Odd",
      instructions: "Read an integer, print Even or Odd.",
      language: "python",
      starterCode: null,
      referenceSolution: null,
      comparisonMode: "suffix_exact",
      numericTolerance: null,
      points: 100,
      testCases: [
        {
          id: "00000000-0000-4000-8000-000000000050",
          stdin: "8",
          expectedStdout: "Even",
          isHidden: false,
          showExpectedOutput: true,
          orderIndex: 0,
        },
      ],
    },
  ],
  memberCount: 1,
  submittedCount: 0,
};

const raceForStudent: RaceForStudent = {
  ...raceForTeacher,
  problems: [],
  attempt: null,
};

describe("RaceService", () => {
  let repository: RaceRepository;
  let getAccess: ReturnType<
    typeof vi.fn<
      (
        classId: string,
        userId: string,
      ) => Promise<{ isTeacher: boolean; isActiveMember: boolean } | null>
    >
  >;
  let audit: AuditSink;
  let service: RaceService;

  beforeEach(() => {
    repository = {
      create: vi.fn().mockResolvedValue(raceForTeacher),
      listForTeacher: vi.fn().mockResolvedValue([]),
      listForStudent: vi.fn().mockResolvedValue([]),
      getForTeacher: vi.fn().mockResolvedValue(raceForTeacher),
      getForStudent: vi.fn().mockResolvedValue(raceForStudent),
      findClassId: vi.fn().mockResolvedValue(classId),
      remove: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(raceForTeacher),
      updateSchedule: vi.fn().mockResolvedValue(undefined),
      listRaceLeaderboard: vi.fn().mockResolvedValue([]),
      listSubmissions: vi.fn().mockResolvedValue([]),
      resetStudent: vi.fn().mockResolvedValue(undefined),
      resetStudents: vi.fn().mockResolvedValue(undefined),
      resetProblem: vi.fn().mockResolvedValue(undefined),
    };
    getAccess = vi.fn();
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    const dependencies: RaceServiceDependencies = {
      identity: {
        requireActiveAccount: vi.fn(async (identity) =>
          identity.uid === teacherIdentity.uid ? teacher : student,
        ),
      },
      classes: { getAccess },
      races: repository,
      audit,
      now: () => now,
    };
    service = new RaceService(dependencies);
  });

  describe("createRace", () => {
    const request = {
      title: "Code Quiz #1",
      durationMinutes: 120,
      opensAt: "2026-09-10T00:00:00.000Z",
      closesAt: "2026-09-10T03:00:00.000Z",
      problems: [
        {
          title: "Even or Odd",
          instructions: "Read an integer, print Even or Odd.",
          language: "python" as const,
          testCases: [{ stdin: "8", expectedStdout: "Even" }],
        },
      ],
    };

    it("rejects a student trying to create a race", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      await expect(
        service.createRace(studentIdentity, classId, request),
      ).rejects.toThrow();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("rejects a close time that isn't in the future", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await expect(
        service.createRace(teacherIdentity, classId, {
          ...request,
          closesAt: "2026-09-09T00:00:00.000Z",
        }),
      ).rejects.toThrow("must be in the future");
      expect(repository.create).not.toHaveBeenCalled();
    });

    it("fills in defaults for optional problem fields and creates the race", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      const created = await service.createRace(
        teacherIdentity,
        classId,
        request,
      );
      expect(created).toBe(raceForTeacher);
      expect(repository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          classId,
          problems: [
            expect.objectContaining({
              starterCode: null,
              referenceSolution: null,
              comparisonMode: "suffix_exact",
              numericTolerance: null,
              points: 100,
              testCases: [
                {
                  stdin: "8",
                  expectedStdout: "Even",
                  isHidden: false,
                  showExpectedOutput: false,
                },
              ],
            }),
          ],
        }),
        now,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "race.created" }),
      );
    });
  });

  describe("listForClass", () => {
    it("returns the teacher listing for a teacher", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.listForClass(teacherIdentity, classId);
      expect(repository.listForTeacher).toHaveBeenCalledWith(classId, now);
      expect(repository.listForStudent).not.toHaveBeenCalled();
    });

    it("returns the student listing for a student", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      await service.listForClass(studentIdentity, classId);
      expect(repository.listForStudent).toHaveBeenCalledWith(
        classId,
        student.id,
        now,
      );
    });

    it("404s for someone with no access to the class", async () => {
      getAccess.mockResolvedValue(null);
      await expect(
        service.listForClass(studentIdentity, classId),
      ).rejects.toThrow("Class not found.");
    });
  });

  describe("getDetail", () => {
    it("gives the teacher the full detail including reference solutions", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      const detail = await service.getDetail(teacherIdentity, raceId);
      expect(detail).toBe(raceForTeacher);
      expect(repository.getForTeacher).toHaveBeenCalledWith(raceId, now);
    });

    it("gives a student the student-safe detail", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      const detail = await service.getDetail(studentIdentity, raceId);
      expect(detail).toBe(raceForStudent);
    });

    it("404s a draft race for a student", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      vi.mocked(repository.getForStudent).mockResolvedValue({
        ...raceForStudent,
        status: "draft",
      });
      await expect(service.getDetail(studentIdentity, raceId)).rejects.toThrow(
        "not found",
      );
    });
  });

  describe("updateSchedule", () => {
    it("rejects a student", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      await expect(
        service.updateSchedule(studentIdentity, raceId, {
          closesAt: "2026-09-11T00:00:00.000Z",
        }),
      ).rejects.toThrow();
      expect(repository.updateSchedule).not.toHaveBeenCalled();
    });

    it("rejects a close time that isn't in the future", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await expect(
        service.updateSchedule(teacherIdentity, raceId, {
          closesAt: "2026-09-09T00:00:00.000Z",
        }),
      ).rejects.toThrow("must be in the future");
      expect(repository.updateSchedule).not.toHaveBeenCalled();
    });

    it("extends the close time without touching scores, reopening the race", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      const updated = await service.updateSchedule(teacherIdentity, raceId, {
        closesAt: "2026-09-11T00:00:00.000Z",
      });
      expect(updated).toBe(raceForTeacher);
      expect(repository.updateSchedule).toHaveBeenCalledWith(
        raceId,
        new Date("2026-09-11T00:00:00.000Z"),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "race.schedule_updated" }),
      );
    });
  });

  describe("getLeaderboard", () => {
    it("returns the leaderboard for a student or teacher with class access", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      const entries = [
        {
          rank: 1,
          studentId: student.id,
          studentName: student.displayName,
          totalScore: 67,
          totalPoints: 100,
          percentage: 67,
        },
      ];
      vi.mocked(repository.listRaceLeaderboard).mockResolvedValue(entries);
      const result = await service.getLeaderboard(studentIdentity, raceId);
      expect(result).toBe(entries);
      expect(repository.listRaceLeaderboard).toHaveBeenCalledWith(raceId);
    });

    it("404s for someone with no access to the class", async () => {
      getAccess.mockResolvedValue(null);
      await expect(
        service.getLeaderboard(studentIdentity, raceId),
      ).rejects.toThrow("not found");
      expect(repository.listRaceLeaderboard).not.toHaveBeenCalled();
    });
  });

  describe("listSubmissions", () => {
    it("rejects a student", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      await expect(
        service.listSubmissions(studentIdentity, raceId),
      ).rejects.toThrow();
      expect(repository.listSubmissions).not.toHaveBeenCalled();
    });

    it("returns the roster for the class teacher", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.listSubmissions(teacherIdentity, raceId);
      expect(repository.listSubmissions).toHaveBeenCalledWith(raceId, classId);
    });
  });

  describe("resetStudent", () => {
    it("rejects a student", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      await expect(
        service.resetStudent(studentIdentity, raceId, student.id),
      ).rejects.toThrow();
      expect(repository.resetStudent).not.toHaveBeenCalled();
    });

    it("wipes the student's progress and audits the action", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.resetStudent(teacherIdentity, raceId, student.id);
      expect(repository.resetStudent).toHaveBeenCalledWith(
        raceId,
        student.id,
        now,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "race.attempt_reset" }),
      );
    });
  });

  describe("resetStudents", () => {
    it("rejects a student", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      await expect(
        service.resetStudents(studentIdentity, raceId, {
          studentIds: [student.id],
        }),
      ).rejects.toThrow();
      expect(repository.resetStudents).not.toHaveBeenCalled();
    });

    it("bulk-resets the given students and audits the action", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.resetStudents(teacherIdentity, raceId, {
        studentIds: [student.id],
      });
      expect(repository.resetStudents).toHaveBeenCalledWith(
        raceId,
        [student.id],
        now,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "race.attempts_bulk_reset" }),
      );
    });
  });

  describe("resetProblem", () => {
    const problemId = "00000000-0000-4000-8000-000000000040";

    it("rejects a student", async () => {
      getAccess.mockResolvedValue({ isTeacher: false, isActiveMember: true });
      await expect(
        service.resetProblem(studentIdentity, raceId, student.id, problemId),
      ).rejects.toThrow();
      expect(repository.resetProblem).not.toHaveBeenCalled();
    });

    it("wipes just that problem's submission and audits the action", async () => {
      getAccess.mockResolvedValue({ isTeacher: true, isActiveMember: false });
      await service.resetProblem(
        teacherIdentity,
        raceId,
        student.id,
        problemId,
      );
      expect(repository.resetProblem).toHaveBeenCalledWith(
        raceId,
        student.id,
        problemId,
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: "race.problem_reset" }),
      );
    });
  });
});
