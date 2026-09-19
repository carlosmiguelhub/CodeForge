import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiGenerationUnavailableError,
  type AiActivityGeneratorClient,
} from "./ai-activity-generator-client";
import {
  ActivityGradingService,
  type ActivityGradingRepository,
} from "./activity-grading-service";
import type { CodeJudgeClient } from "./code-judge-client";

const identity = {
  uid: "student-uid",
  email: "student@example.edu",
  emailVerified: true,
};
const actorId = "00000000-0000-4000-8000-000000000010";
const activityId = "00000000-0000-4000-8000-000000000020";
const classId = "00000000-0000-4000-8000-000000000030";
const testCaseId = "00000000-0000-4000-8000-000000000040";
const attemptId = "00000000-0000-4000-8000-000000000050";

const activity = {
  id: activityId,
  classId,
  language: "python" as const,
  allowRetake: false,
  comparisonMode: "normalized_exact" as const,
  numericTolerance: null,
  points: 100,
  deadlineAt: null,
  locked: false,
  testCases: [{ id: testCaseId, stdin: "", expectedStdout: "Hello\n" }],
};

describe("ActivityGradingService", () => {
  let codeJudge: CodeJudgeClient;
  let repository: ActivityGradingRepository;
  let aiGenerator: AiActivityGeneratorClient;
  let service: ActivityGradingService;

  beforeEach(() => {
    codeJudge = { run: vi.fn() };
    aiGenerator = { generate: vi.fn() };
    repository = {
      resolveActorId: vi.fn().mockResolvedValue(actorId),
      getForGrading: vi.fn().mockResolvedValue(activity),
      isActiveMember: vi.fn().mockResolvedValue(true),
      getOrCreateAttempt: vi.fn().mockResolvedValue({
        id: attemptId,
        status: "in_progress",
        violationCount: 0,
        submittedAt: null,
        sourceCode: null,
      }),
      recordTestRuns: vi.fn().mockResolvedValue(undefined),
      markAttemptPassed: vi.fn().mockResolvedValue(undefined),
      markAttemptSubmittedIncomplete: vi.fn().mockResolvedValue(undefined),
      resetAttemptToInProgress: vi.fn().mockResolvedValue(undefined),
      saveAttemptSourceCode: vi.fn().mockResolvedValue(undefined),
      recordViolation: vi.fn().mockResolvedValue(1),
      zeroAttempt: vi.fn().mockResolvedValue(undefined),
      recordIntegrityFlags: vi.fn().mockResolvedValue(undefined),
    };
    service = new ActivityGradingService({
      codeJudge,
      activities: repository,
      aiGenerator,
    });
  });

  describe("verifyReferenceSolution", () => {
    it("grades the reference solution against every test case without touching the repository", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Hello\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.verifyReferenceSolution({
        language: "python",
        comparisonMode: "normalized_exact",
        numericTolerance: null,
        referenceSolution: 'print("Hello")',
        testCases: [{ stdin: "", expectedStdout: "Hello" }],
      });
      expect(result.passed).toBe(true);
      expect(result.results).toEqual([
        {
          index: 0,
          passed: true,
          actualStdout: "Hello\n",
          status: "passed",
          message: null,
        },
      ]);
      expect(repository.resolveActorId).not.toHaveBeenCalled();
      expect(repository.getForGrading).not.toHaveBeenCalled();
      expect(repository.getOrCreateAttempt).not.toHaveBeenCalled();
      expect(repository.recordTestRuns).not.toHaveBeenCalled();
    });

    it("reports a wrong-answer result when the reference solution doesn't match its own answer key", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Goodbye\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.verifyReferenceSolution({
        language: "python",
        comparisonMode: "normalized_exact",
        numericTolerance: null,
        referenceSolution: 'print("Goodbye")',
        testCases: [{ stdin: "", expectedStdout: "Hello" }],
      });
      expect(result.passed).toBe(false);
      expect(result.results[0]).toMatchObject({
        index: 0,
        passed: false,
        status: "wrong_answer",
      });
    });

    it("short-circuits remaining test cases on a compile error", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "compile_error",
        stdout: null,
        stderr: null,
        compileOutput: "SyntaxError",
        message: null,
        timeMs: null,
        memoryKb: null,
      });
      const result = await service.verifyReferenceSolution({
        language: "python",
        comparisonMode: "normalized_exact",
        numericTolerance: null,
        referenceSolution: "print(",
        testCases: [
          { stdin: "", expectedStdout: "Hello" },
          { stdin: "", expectedStdout: "World" },
        ],
      });
      expect(codeJudge.run).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(2);
      expect(result.results[1]).toMatchObject({ index: 1, status: "not_run" });
    });
  });

  describe("generateActivity", () => {
    const draft = {
      title: "Sum two numbers",
      instructions: "Read two integers and print their sum.",
      starterCode: null,
      referenceSolution: "a, b = map(int, input().split())\nprint(a + b)",
      testCases: [
        { stdin: "1 2", expectedStdout: "3", isHidden: false },
        { stdin: "5 7", expectedStdout: "12", isHidden: true },
      ],
    };

    it("returns the draft along with a self-verification against its own test cases", async () => {
      vi.mocked(aiGenerator.generate).mockResolvedValue(draft);
      vi.mocked(codeJudge.run)
        .mockResolvedValueOnce({
          status: "accepted",
          stdout: "3\n",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 10,
          memoryKb: 100,
        })
        .mockResolvedValueOnce({
          status: "accepted",
          stdout: "12\n",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 10,
          memoryKb: 100,
        });
      const result = await service.generateActivity({
        topic: "sum two numbers",
        language: "python",
        difficulty: "beginner",
        testCaseCount: 2,
      });
      expect(aiGenerator.generate).toHaveBeenCalledWith({
        topic: "sum two numbers",
        language: "python",
        difficulty: "beginner",
        testCaseCount: 2,
      });
      expect(result.title).toBe(draft.title);
      expect(result.testCases).toEqual(draft.testCases);
      expect(result.verification.passed).toBe(true);
      expect(result.verification.results).toHaveLength(2);
    });

    it("reports a failed self-verification when the AI's draft is self-inconsistent", async () => {
      vi.mocked(aiGenerator.generate).mockResolvedValue(draft);
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "wrong\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.generateActivity({
        topic: "sum two numbers",
        language: "python",
        difficulty: "beginner",
        testCaseCount: 2,
      });
      expect(result.verification.passed).toBe(false);
    });

    it("maps an unconfigured AI generator to a 503", async () => {
      vi.mocked(aiGenerator.generate).mockRejectedValue(
        new AiGenerationUnavailableError("not configured"),
      );
      await expect(
        service.generateActivity({
          topic: "x",
          language: "python",
          difficulty: "beginner",
          testCaseCount: 2,
        }),
      ).rejects.toMatchObject({
        code: "AI_GENERATION_UNAVAILABLE",
        statusCode: 503,
      });
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    it("maps a generic AI generator failure to a 502", async () => {
      vi.mocked(aiGenerator.generate).mockRejectedValue(
        new Error("OpenAI request failed with status 500"),
      );
      await expect(
        service.generateActivity({
          topic: "x",
          language: "python",
          difficulty: "beginner",
          testCaseCount: 2,
        }),
      ).rejects.toMatchObject({
        code: "AI_GENERATION_FAILED",
        statusCode: 502,
      });
    });
  });

  describe("testCode", () => {
    it("never finalizes the attempt, even when every test case passes", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Hello  \n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.testCode(
        identity,
        activityId,
        'print("Hello")',
      );
      expect(result.passed).toBe(true);
      expect(result.attempt.status).toBe("in_progress");
      expect(repository.markAttemptPassed).not.toHaveBeenCalled();
      expect(repository.markAttemptSubmittedIncomplete).not.toHaveBeenCalled();
      expect(repository.saveAttemptSourceCode).toHaveBeenCalledWith(
        attemptId,
        'print("Hello")',
      );
      expect(repository.recordTestRuns).toHaveBeenCalledWith(attemptId, [
        {
          testCaseId,
          passed: true,
          actualStdout: "Hello  \n",
          status: "passed",
          message: null,
        },
      ]);
    });

    it("reports a failing test case without locking the attempt", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Goodbye\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.testCode(
        identity,
        activityId,
        'print("Goodbye")',
      );
      expect(result.passed).toBe(false);
      expect(result.results[0]).toMatchObject({
        status: "wrong_answer",
        message: "Output did not match the answer key.",
      });
      expect(result.attempt.status).toBe("in_progress");
      expect(repository.markAttemptPassed).not.toHaveBeenCalled();
      expect(repository.markAttemptSubmittedIncomplete).not.toHaveBeenCalled();
    });

    it("short-circuits remaining test cases on a compile error instead of resubmitting", async () => {
      const twoCaseActivity = {
        ...activity,
        testCases: [
          { id: testCaseId, stdin: "", expectedStdout: "Hello\n" },
          {
            id: "00000000-0000-4000-8000-000000000041",
            stdin: "",
            expectedStdout: "x",
          },
        ],
      };
      vi.mocked(repository.getForGrading).mockResolvedValue(twoCaseActivity);
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "compile_error",
        stdout: null,
        stderr: null,
        compileOutput: "SyntaxError",
        message: null,
        timeMs: null,
        memoryKb: null,
      });
      const result = await service.testCode(identity, activityId, "bad(");
      expect(codeJudge.run).toHaveBeenCalledTimes(1);
      expect(result.results).toHaveLength(2);
      expect(result.results.every((r) => !r.passed)).toBe(true);
      expect(result.results[0]?.status).toBe("compile_error");
      expect(result.results[0]?.message).toBe("SyntaxError");
      expect(result.results[1]?.status).toBe("not_run");
    });

    it("ignores whitespace layout in token comparison mode", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        comparisonMode: "token",
        testCases: [{ ...activity.testCases[0]!, expectedStdout: "1 2\n3" }],
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "1\n2    3\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.testCode(identity, activityId, "code");
      expect(result.passed).toBe(true);
    });

    it("accepts numeric output within the teacher's tolerance", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        comparisonMode: "numeric",
        numericTolerance: 0.001,
        testCases: [
          { ...activity.testCases[0]!, expectedStdout: "3.14159 2.000" },
        ],
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "3.1416\n2",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.testCode(identity, activityId, "code");
      expect(result.passed).toBe(true);
    });

    it("accepts a prompt before the answer key in suffix comparison mode", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        comparisonMode: "suffix_exact",
        testCases: [{ ...activity.testCases[0]!, expectedStdout: "Even" }],
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Please input your number: Even",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.testCode(identity, activityId, "code");
      expect(result.passed).toBe(true);
    });

    it("rejects suffix comparison mode when the tail itself is wrong", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        comparisonMode: "suffix_exact",
        testCases: [{ ...activity.testCases[0]!, expectedStdout: "Even" }],
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Please input your number: Odd",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.testCode(identity, activityId, "code");
      expect(result.passed).toBe(false);
    });

    it("supports an answer key that expects no output", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        testCases: [{ ...activity.testCases[0]!, expectedStdout: "" }],
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: null,
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.testCode(identity, activityId, "code");
      expect(result.passed).toBe(true);
    });

    it("404s grading for a student who isn't a member of the activity's class", async () => {
      vi.mocked(repository.isActiveMember).mockResolvedValue(false);
      await expect(
        service.testCode(identity, activityId, "code"),
      ).rejects.toThrow("Activity not found.");
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    it("rejects testing an attempt already zeroed for violations", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "zeroed_violation",
        violationCount: 4,
        submittedAt: "2026-09-10T00:00:00.000Z",
        sourceCode: null,
      });
      await expect(
        service.testCode(identity, activityId, "code"),
      ).rejects.toThrow("zeroed for too many lockdown violations");
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    it("rejects testing a manually locked activity even for an in-progress attempt", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        locked: true,
      });
      await expect(
        service.testCode(identity, activityId, "code"),
      ).rejects.toThrow("This activity is locked");
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    it("rejects testing once the deadline has passed, even for an in-progress attempt", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        deadlineAt: new Date("2026-09-01T00:00:00.000Z"),
      });
      const now = new Date("2026-09-02T00:00:00.000Z");
      service = new ActivityGradingService({
        codeJudge,
        activities: repository,
        aiGenerator,
        now: () => now,
      });
      await expect(
        service.testCode(identity, activityId, "code"),
      ).rejects.toThrow("This activity is locked");
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    it("still allows testing before the deadline", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Hello  \n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        deadlineAt: new Date("2026-09-05T00:00:00.000Z"),
      });
      const now = new Date("2026-09-02T00:00:00.000Z");
      service = new ActivityGradingService({
        codeJudge,
        activities: repository,
        aiGenerator,
        now: () => now,
      });
      const result = await service.testCode(
        identity,
        activityId,
        'print("Hello")',
      );
      expect(result.passed).toBe(true);
    });

    it("rejects testing again once submitted when the activity doesn't allow retakes", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "passed",
        violationCount: 1,
        submittedAt: "2026-09-10T00:00:00.000Z",
        sourceCode: null,
      });
      await expect(
        service.testCode(identity, activityId, "code"),
      ).rejects.toThrow("already been submitted and locked");
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    it("resets a submitted-incomplete attempt back to in_progress when retakes are allowed", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        allowRetake: true,
      });
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "submitted_incomplete",
        violationCount: 2,
        submittedAt: "2026-09-10T00:00:00.000Z",
        sourceCode: null,
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Goodbye\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.testCode(identity, activityId, "code");
      expect(repository.resetAttemptToInProgress).toHaveBeenCalledWith(
        attemptId,
      );
      expect(result.attempt.violationCount).toBe(0);
      expect(result.attempt.status).toBe("in_progress");
    });

    it("never records integrity flags, even against a suspicious constant-output submission", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        testCases: [
          { id: "case-a", stdin: "1", expectedStdout: "2" },
          { id: "case-b", stdin: "2", expectedStdout: "4" },
        ],
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "hardcoded\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      await service.testCode(identity, activityId, 'print("hardcoded")');
      expect(repository.recordIntegrityFlags).not.toHaveBeenCalled();
    });
  });

  describe("submitAttempt", () => {
    it("marks the attempt passed when every test case matches", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Hello  \n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.submitAttempt(
        identity,
        activityId,
        'print("Hello")',
      );
      expect(result.passed).toBe(true);
      expect(result.attempt.status).toBe("passed");
      expect(repository.markAttemptPassed).toHaveBeenCalledWith(attemptId);
      expect(repository.markAttemptSubmittedIncomplete).not.toHaveBeenCalled();
    });

    it("marks the attempt submitted_incomplete when a test case doesn't match", async () => {
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Goodbye\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.submitAttempt(
        identity,
        activityId,
        'print("Goodbye")',
      );
      expect(result.passed).toBe(false);
      expect(result.attempt.status).toBe("submitted_incomplete");
      expect(repository.markAttemptSubmittedIncomplete).toHaveBeenCalledWith(
        attemptId,
      );
      expect(repository.markAttemptPassed).not.toHaveBeenCalled();
    });

    it("rejects submitting again once passed when the activity doesn't allow retakes", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "passed",
        violationCount: 1,
        submittedAt: "2026-09-10T00:00:00.000Z",
        sourceCode: null,
      });
      await expect(
        service.submitAttempt(identity, activityId, "code"),
      ).rejects.toThrow("already been submitted and locked");
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    it("rejects submitting an attempt already zeroed for violations", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "zeroed_violation",
        violationCount: 4,
        submittedAt: "2026-09-10T00:00:00.000Z",
        sourceCode: null,
      });
      await expect(
        service.submitAttempt(identity, activityId, "code"),
      ).rejects.toThrow("zeroed for too many lockdown violations");
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    it("allows resubmitting once passed when the activity allows retakes, resetting strikes to zero", async () => {
      vi.mocked(repository.getForGrading).mockResolvedValue({
        ...activity,
        allowRetake: true,
      });
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "passed",
        violationCount: 2,
        submittedAt: "2026-09-10T00:00:00.000Z",
        sourceCode: null,
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Hello\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.submitAttempt(
        identity,
        activityId,
        'print("Hello")',
      );
      expect(repository.resetAttemptToInProgress).toHaveBeenCalledWith(
        attemptId,
      );
      expect(result.passed).toBe(true);
      expect(result.attempt.violationCount).toBe(0);
    });

    it("applies no deduction when violations are at the allowance", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "in_progress",
        violationCount: 5,
        submittedAt: null,
        sourceCode: null,
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Hello\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.submitAttempt(
        identity,
        activityId,
        'print("Hello")',
      );
      expect(result.attempt.score).toBe(100);
    });

    it("deducts points for violations over the allowance", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "in_progress",
        violationCount: 7, // 2 excess over the 5-violation allowance
        submittedAt: null,
        sourceCode: null,
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Hello\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.submitAttempt(
        identity,
        activityId,
        'print("Hello")',
      );
      // 100 points * 2.5% * 2 excess = 5 points off.
      expect(result.attempt.score).toBe(95);
    });

    it("floors the deducted score at 0 for a large violation count", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "in_progress",
        violationCount: 100,
        submittedAt: null,
        sourceCode: null,
      });
      vi.mocked(codeJudge.run).mockResolvedValue({
        status: "accepted",
        stdout: "Hello\n",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 10,
        memoryKb: 100,
      });
      const result = await service.submitAttempt(
        identity,
        activityId,
        'print("Hello")',
      );
      expect(result.attempt.score).toBe(0);
    });

    it("404s submitting for a student who isn't a member of the activity's class", async () => {
      vi.mocked(repository.isActiveMember).mockResolvedValue(false);
      await expect(
        service.submitAttempt(identity, activityId, "code"),
      ).rejects.toThrow("Activity not found.");
      expect(codeJudge.run).not.toHaveBeenCalled();
    });

    describe("integrity flags", () => {
      it("flags a submission that ignores non-empty stdin (H1)", async () => {
        vi.mocked(repository.getForGrading).mockResolvedValue({
          ...activity,
          testCases: [
            { id: testCaseId, stdin: "5", expectedStdout: "Hello\n" },
          ],
        });
        vi.mocked(codeJudge.run).mockResolvedValue({
          status: "accepted",
          stdout: "Hello\n",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 10,
          memoryKb: 100,
        });
        await service.submitAttempt(identity, activityId, 'print("Hello")');
        expect(repository.recordIntegrityFlags).toHaveBeenCalledWith(
          attemptId,
          [expect.objectContaining({ kind: "input_ignored" })],
        );
      });

      it("doesn't flag a submission that does read stdin (H1 negative)", async () => {
        vi.mocked(repository.getForGrading).mockResolvedValue({
          ...activity,
          testCases: [{ id: testCaseId, stdin: "5", expectedStdout: "5\n" }],
        });
        vi.mocked(codeJudge.run).mockResolvedValue({
          status: "accepted",
          stdout: "5\n",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 10,
          memoryKb: 100,
        });
        await service.submitAttempt(identity, activityId, "print(input())");
        expect(repository.recordIntegrityFlags).not.toHaveBeenCalled();
      });

      it("flags a submission whose output doesn't vary across differing inputs (H2)", async () => {
        vi.mocked(repository.getForGrading).mockResolvedValue({
          ...activity,
          testCases: [
            { id: "case-a", stdin: "1", expectedStdout: "2" },
            { id: "case-b", stdin: "2", expectedStdout: "4" },
          ],
        });
        vi.mocked(codeJudge.run).mockResolvedValue({
          status: "accepted",
          stdout: "2\n",
          stderr: null,
          compileOutput: null,
          message: null,
          timeMs: 10,
          memoryKb: 100,
        });
        await service.submitAttempt(
          identity,
          activityId,
          "print(input()); print(2)",
        );
        expect(repository.recordIntegrityFlags).toHaveBeenCalledWith(
          attemptId,
          expect.arrayContaining([
            expect.objectContaining({ kind: "output_invariant" }),
          ]),
        );
      });

      it("doesn't flag a submission whose output genuinely varies with input (H2 negative)", async () => {
        vi.mocked(repository.getForGrading).mockResolvedValue({
          ...activity,
          testCases: [
            { id: "case-a", stdin: "1", expectedStdout: "2" },
            { id: "case-b", stdin: "2", expectedStdout: "4" },
          ],
        });
        vi.mocked(codeJudge.run)
          .mockResolvedValueOnce({
            status: "accepted",
            stdout: "2\n",
            stderr: null,
            compileOutput: null,
            message: null,
            timeMs: 10,
            memoryKb: 100,
          })
          .mockResolvedValueOnce({
            status: "accepted",
            stdout: "4\n",
            stderr: null,
            compileOutput: null,
            message: null,
            timeMs: 10,
            memoryKb: 100,
          });
        await service.submitAttempt(
          identity,
          activityId,
          "n = int(input()); print(n * 2)",
        );
        expect(repository.recordIntegrityFlags).not.toHaveBeenCalled();
      });

      it("never flags when nothing actually executed (compile error)", async () => {
        vi.mocked(repository.getForGrading).mockResolvedValue({
          ...activity,
          testCases: [
            { id: testCaseId, stdin: "5", expectedStdout: "Hello\n" },
          ],
        });
        vi.mocked(codeJudge.run).mockResolvedValue({
          status: "compile_error",
          stdout: null,
          stderr: null,
          compileOutput: "SyntaxError",
          message: null,
          timeMs: null,
          memoryKb: null,
        });
        await service.submitAttempt(identity, activityId, "bad(");
        expect(repository.recordIntegrityFlags).not.toHaveBeenCalled();
      });
    });
  });

  describe("recordViolation", () => {
    it("records the strike and returns a warning without ending the attempt", async () => {
      vi.mocked(repository.recordViolation).mockResolvedValue(2);
      const result = await service.recordViolation(
        identity,
        activityId,
        "tab_switch",
      );
      expect(repository.recordViolation).toHaveBeenCalledWith(
        attemptId,
        "tab_switch",
      );
      expect(result.attempt).toEqual({
        status: "in_progress",
        violationCount: 2,
        submittedAt: null,
        score: null,
        sourceCode: null,
      });
      expect(repository.zeroAttempt).not.toHaveBeenCalled();
    });

    it("never zeroes the attempt no matter how many violations accrue", async () => {
      vi.mocked(repository.recordViolation).mockResolvedValue(12);
      const result = await service.recordViolation(
        identity,
        activityId,
        "fullscreen_exit",
      );
      expect(repository.zeroAttempt).not.toHaveBeenCalled();
      expect(result.attempt.status).toBe("in_progress");
      expect(result.attempt.violationCount).toBe(12);
    });

    it("doesn't double-count a violation reported after the attempt is already terminal", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "passed",
        violationCount: 1,
        submittedAt: "2026-09-10T00:00:00.000Z",
        sourceCode: null,
      });
      const result = await service.recordViolation(
        identity,
        activityId,
        "tab_switch",
      );
      expect(repository.recordViolation).not.toHaveBeenCalled();
      expect(result.attempt.status).toBe("passed");
      // Within the allowance (1 violation) — no deduction.
      expect(result.attempt.score).toBe(100);
    });

    it("reflects the deduction when reporting on an already-passed attempt over the allowance", async () => {
      vi.mocked(repository.getOrCreateAttempt).mockResolvedValue({
        id: attemptId,
        status: "passed",
        violationCount: 6, // 1 excess over the 5-violation allowance
        submittedAt: "2026-09-10T00:00:00.000Z",
        sourceCode: null,
      });
      const result = await service.recordViolation(
        identity,
        activityId,
        "tab_switch",
      );
      // 100 points * 2.5% * 1 excess = 2.5 -> rounds to 3 points off.
      expect(result.attempt.score).toBe(97);
    });
  });
});
