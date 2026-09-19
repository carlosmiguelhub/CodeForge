import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  RaceGradingService,
  type RaceGradingRepository,
} from "./race-grading-service";
import type { CodeJudgeClient } from "./code-judge-client";

const identity = {
  uid: "student-uid",
  email: "student@example.edu",
  emailVerified: true,
};
const actorId = "00000000-0000-4000-8000-000000000010";
const raceId = "00000000-0000-4000-8000-000000000020";
const classId = "00000000-0000-4000-8000-000000000030";
const problemId = "00000000-0000-4000-8000-000000000040";
const testCaseId1 = "00000000-0000-4000-8000-000000000041";
const testCaseId2 = "00000000-0000-4000-8000-000000000042";
const testCaseId3 = "00000000-0000-4000-8000-000000000043";
const attemptId = "00000000-0000-4000-8000-000000000050";

const now = new Date("2026-09-10T01:00:00.000Z");

const race = {
  id: raceId,
  classId,
  durationMinutes: 120,
  opensAt: new Date("2026-09-10T00:00:00.000Z"),
  closesAt: new Date("2026-09-10T03:00:00.000Z"),
  status: "open" as const,
};

const problem = {
  id: problemId,
  language: "python" as const,
  comparisonMode: "normalized_exact" as const,
  numericTolerance: null,
  points: 100,
  testCases: [
    { id: testCaseId1, stdin: "1", expectedStdout: "one" },
    { id: testCaseId2, stdin: "2", expectedStdout: "two" },
    { id: testCaseId3, stdin: "3", expectedStdout: "three" },
  ],
};

const inProgressAttempt = {
  id: attemptId,
  status: "in_progress" as const,
  startedAt: new Date("2026-09-10T00:45:00.000Z"),
  submittedAt: null,
  violationCount: 0,
};

describe("RaceGradingService", () => {
  let codeJudge: CodeJudgeClient;
  let repository: RaceGradingRepository;
  let service: RaceGradingService;

  beforeEach(() => {
    codeJudge = { run: vi.fn() };
    repository = {
      resolveActorId: vi.fn().mockResolvedValue(actorId),
      getRaceForGrading: vi.fn().mockResolvedValue(race),
      getProblemForGrading: vi.fn().mockResolvedValue(problem),
      isActiveMember: vi.fn().mockResolvedValue(true),
      getAttempt: vi.fn().mockResolvedValue(inProgressAttempt),
      getOrCreateAttempt: vi.fn().mockResolvedValue(inProgressAttempt),
      markAttemptTimedOut: vi.fn().mockResolvedValue(undefined),
      finishAttempt: vi.fn().mockResolvedValue(undefined),
      recordViolation: vi.fn().mockResolvedValue(1),
      getProblemSubmission: vi.fn().mockResolvedValue(null),
      upsertProblemRun: vi.fn().mockResolvedValue(undefined),
      submitProblem: vi.fn().mockResolvedValue(true),
      // Defaults to "more problems remain" so existing tests below aren't
      // implicitly exercising the auto-finish path; the dedicated
      // "auto-finishes" test overrides these to simulate the last problem.
      countProblems: vi.fn().mockResolvedValue(3),
      countSubmittedProblems: vi.fn().mockResolvedValue(1),
    };
    service = new RaceGradingService({
      codeJudge,
      races: repository,
      now: () => now,
    });
  });

  describe("startAttempt", () => {
    it("creates a fresh attempt within the race's window", async () => {
      vi.mocked(repository.getAttempt).mockResolvedValue(null);
      const attempt = await service.startAttempt(identity, raceId);
      expect(repository.getOrCreateAttempt).toHaveBeenCalledWith(
        raceId,
        actorId,
        now,
      );
      expect(attempt.status).toBe("in_progress");
      // The race's closesAt directly — not this attempt's own startedAt
      // (00:45) plus duration — so every student shares one synced
      // deadline and a teacher's later schedule extension always applies.
      expect(attempt.deadlineAt).toBe("2026-09-10T03:00:00.000Z");
    });

    it("rejects starting before the race opens", async () => {
      vi.mocked(repository.getRaceForGrading).mockResolvedValue({
        ...race,
        opensAt: new Date("2026-09-11T00:00:00.000Z"),
      });
      await expect(service.startAttempt(identity, raceId)).rejects.toThrow(
        "has not opened yet",
      );
    });

    it("rejects starting after the race closes", async () => {
      vi.mocked(repository.getRaceForGrading).mockResolvedValue({
        ...race,
        closesAt: new Date("2026-09-09T00:00:00.000Z"),
      });
      await expect(service.startAttempt(identity, raceId)).rejects.toThrow(
        "is closed",
      );
    });

    it("rejects restarting an attempt that has already ended", async () => {
      vi.mocked(repository.getAttempt).mockResolvedValue({
        ...inProgressAttempt,
        status: "submitted",
      });
      await expect(service.startAttempt(identity, raceId)).rejects.toThrow(
        "already ended",
      );
    });
  });

  describe("runProblem", () => {
    it("grades against all test cases without finalizing anything", async () => {
      vi.mocked(codeJudge.run)
        .mockResolvedValueOnce({
          status: "accepted",
          stdout: "one",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 5,
          memoryKb: 10,
        })
        .mockResolvedValueOnce({
          status: "accepted",
          stdout: "wrong",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 5,
          memoryKb: 10,
        })
        .mockResolvedValueOnce({
          status: "accepted",
          stdout: "three",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 5,
          memoryKb: 10,
        });
      const result = await service.runProblem(
        identity,
        raceId,
        problemId,
        "code",
      );
      expect(result.passed).toBe(false);
      expect(result.results.filter((r) => r.passed)).toHaveLength(2);
      expect(repository.upsertProblemRun).toHaveBeenCalledWith(
        expect.objectContaining({
          attemptId,
          problemId,
          passedTestCaseCount: 2,
          totalTestCaseCount: 3,
        }),
      );
      expect(repository.submitProblem).not.toHaveBeenCalled();
    });

    it("rejects when no attempt has been started", async () => {
      vi.mocked(repository.getAttempt).mockResolvedValue(null);
      await expect(
        service.runProblem(identity, raceId, problemId, "code"),
      ).rejects.toThrow("Start the race");
    });

    it("marks the attempt timed out and rejects once the deadline has passed", async () => {
      const lateService = new RaceGradingService({
        codeJudge,
        races: repository,
        now: () => new Date("2026-09-10T03:30:00.000Z"),
      });
      await expect(
        lateService.runProblem(identity, raceId, problemId, "code"),
      ).rejects.toThrow("deadline has passed");
      expect(repository.markAttemptTimedOut).toHaveBeenCalledWith(attemptId);
    });

    it("rejects running a problem that's already been submitted", async () => {
      vi.mocked(repository.getProblemSubmission).mockResolvedValue({
        submitted: true,
        passedTestCaseCount: 3,
        totalTestCaseCount: 3,
        score: 100,
      });
      await expect(
        service.runProblem(identity, raceId, problemId, "code"),
      ).rejects.toThrow("already been submitted");
    });
  });

  describe("submitProblem", () => {
    it("awards partial credit proportional to the fraction of test cases passed", async () => {
      vi.mocked(codeJudge.run)
        .mockResolvedValueOnce({
          status: "accepted",
          stdout: "one",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 5,
          memoryKb: 10,
        })
        .mockResolvedValueOnce({
          status: "accepted",
          stdout: "two",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 5,
          memoryKb: 10,
        })
        .mockResolvedValueOnce({
          status: "accepted",
          stdout: "wrong",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 5,
          memoryKb: 10,
        });
      const result = await service.submitProblem(
        identity,
        raceId,
        problemId,
        "code",
      );
      // 2 of 3 test cases passed, 100 points -> round(100 * 2/3) = 67
      expect(result.score).toBe(67);
      expect(result.passedTestCaseCount).toBe(2);
      expect(result.totalTestCaseCount).toBe(3);
      expect(repository.submitProblem).toHaveBeenCalledWith(
        expect.objectContaining({ attemptId, problemId, score: 67 }),
      );
    });

    it("rejects a second submission for the same problem", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "one",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 5,
        memoryKb: 10,
      });
      vi.mocked(repository.submitProblem).mockResolvedValue(false);
      await expect(
        service.submitProblem(identity, raceId, problemId, "code"),
      ).rejects.toThrow("already been submitted");
    });

    it("rejects submitting after the deadline has passed", async () => {
      const lateService = new RaceGradingService({
        codeJudge,
        races: repository,
        now: () => new Date("2026-09-10T03:30:00.000Z"),
      });
      await expect(
        lateService.submitProblem(identity, raceId, problemId, "code"),
      ).rejects.toThrow("deadline has passed");
      expect(repository.submitProblem).not.toHaveBeenCalled();
    });

    it("auto-finishes the attempt once the last unsubmitted problem is submitted", async () => {
      vi.mocked(repository.countProblems).mockResolvedValue(1);
      vi.mocked(repository.countSubmittedProblems).mockResolvedValue(1);
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "one",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 5,
        memoryKb: 10,
      });
      await service.submitProblem(identity, raceId, problemId, "code");
      expect(repository.finishAttempt).toHaveBeenCalledWith(attemptId, now);
    });

    it("doesn't finish the attempt while problems remain unsubmitted", async () => {
      vi.mocked(repository.countProblems).mockResolvedValue(3);
      vi.mocked(repository.countSubmittedProblems).mockResolvedValue(1);
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "one",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 5,
        memoryKb: 10,
      });
      await service.submitProblem(identity, raceId, problemId, "code");
      expect(repository.finishAttempt).not.toHaveBeenCalled();
    });
  });

  describe("finishAttempt", () => {
    it("finishes the attempt early, locking out remaining problems", async () => {
      const result = await service.finishAttempt(identity, raceId);
      expect(repository.finishAttempt).toHaveBeenCalledWith(attemptId, now);
      expect(result.attempt.status).toBe("submitted");
    });
  });

  describe("recordViolation", () => {
    it("returns the updated violation count without ending the attempt", async () => {
      vi.mocked(repository.recordViolation).mockResolvedValue(2);
      const result = await service.recordViolation(identity, raceId);
      expect(result.attempt.violationCount).toBe(2);
      expect(result.attempt.status).toBe("in_progress");
      expect(repository.finishAttempt).not.toHaveBeenCalled();
    });

    it("never force-finishes the attempt no matter how many violations accrue", async () => {
      vi.mocked(repository.recordViolation).mockResolvedValue(12);
      const result = await service.recordViolation(identity, raceId);
      expect(repository.finishAttempt).not.toHaveBeenCalled();
      expect(result.attempt.status).toBe("in_progress");
      expect(result.attempt.violationCount).toBe(12);
    });

    it("doesn't double-count a violation reported after the attempt already ended", async () => {
      vi.mocked(repository.getAttempt).mockResolvedValue({
        ...inProgressAttempt,
        status: "submitted",
        submittedAt: now,
      });
      const result = await service.recordViolation(identity, raceId);
      expect(repository.recordViolation).not.toHaveBeenCalled();
      expect(result.attempt.status).toBe("submitted");
    });
  });
});
