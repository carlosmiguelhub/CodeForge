import { describe, expect, it } from "vitest";

import {
  accountListQuerySchema,
  adminCreateUserRequestSchema,
  auditEventListQuerySchema,
  activityCreateRequestSchema,
  activityForStudentSchema,
  activitySchema,
  executionRequestSchema,
  interactiveExecutionLimits,
  raceForStudentSchema,
  rolePermissions,
} from "./index";

describe("foundation contracts", () => {
  it("never grants platform administration to students or teachers", () => {
    expect(rolePermissions.student).not.toContain("platform:manage_settings");
    expect(rolePermissions.teacher).not.toContain("platform:manage_settings");
  });

  it("does not give administrators SQL workspace execution authority", () => {
    expect(rolePermissions.administrator).not.toContain(
      "workspace:execute_own",
    );
  });

  it("keeps approved interactive limits at or below policy ceilings", () => {
    expect(interactiveExecutionLimits).toEqual({
      timeoutMs: 10_000,
      maxStatements: 5,
      maxRowsPerResult: 1_000,
      maxResultSets: 5,
      maxOutputBytes: 5 * 1024 * 1024,
    });
  });

  it("rejects empty execution SQL", () => {
    const result = executionRequestSchema.safeParse({
      grant: "opaque",
      sql: "",
      selection: { mode: "current" },
      transactionMode: "auto",
    });

    expect(result.success).toBe(false);
  });

  it("defaults the account list page/pageSize and rejects a zero page", () => {
    expect(accountListQuerySchema.parse({})).toEqual({ page: 1, pageSize: 20 });
    expect(accountListQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("rejects duplicate roles when an admin creates a user", () => {
    const result = adminCreateUserRequestSchema.safeParse({
      email: "new@example.edu",
      displayName: "New Person",
      roles: ["student", "student"],
    });
    expect(result.success).toBe(false);
  });

  it("accepts a unique multi-role admin user creation request", () => {
    const result = adminCreateUserRequestSchema.safeParse({
      email: "new@example.edu",
      displayName: "New Person",
      roles: ["student", "teacher"],
    });
    expect(result.success).toBe(true);
  });

  it("defaults the audit event list page/pageSize", () => {
    expect(auditEventListQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });
  });

  it("allows an activity answer key that expects no output", () => {
    const result = activityCreateRequestSchema.safeParse({
      title: "Silent program",
      instructions: "Do not print anything.",
      language: "python",
      allowRetake: false,
      testCases: [{ stdin: "", expectedStdout: "" }],
    });
    expect(result.success).toBe(true);
  });

  it("defaults new grading fields in an older activity response", () => {
    const parsed = activitySchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      classId: "22222222-2222-4222-8222-222222222222",
      title: "Legacy activity",
      instructions: "Print hello",
      language: "python",
      starterCode: null,
      allowRetake: false,
      createdAt: "2026-09-10T00:00:00.000Z",
      testCases: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          stdin: "",
          expectedStdout: "hello",
          orderIndex: 0,
        },
      ],
      memberCount: 1,
      passedCount: 0,
      zeroedCount: 0,
    });

    expect(parsed.comparisonMode).toBe("suffix_exact");
    expect(parsed.numericTolerance).toBeNull();
    expect(parsed.referenceSolution).toBeNull();
    expect(parsed.testCases[0]).toMatchObject({
      isHidden: false,
      showExpectedOutput: false,
    });
  });

  it("never exposes a reference solution on the student-facing activity schema, even if the payload carries one", () => {
    const parsed = activityForStudentSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      classId: "22222222-2222-4222-8222-222222222222",
      title: "Legacy activity",
      instructions: "Print hello",
      language: "python",
      starterCode: null,
      // A hypothetical backend bug leaking the answer key — the schema
      // itself must not be the thing standing between a student and it.
      referenceSolution: 'print("hello")',
      allowRetake: false,
      createdAt: "2026-09-10T00:00:00.000Z",
      testCases: [],
      attempt: null,
    });
    expect(parsed).not.toHaveProperty("referenceSolution");
  });

  it("never exposes a race problem's reference solution on the student-facing race schema, even if the payload carries one", () => {
    const parsed = raceForStudentSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      classId: "22222222-2222-4222-8222-222222222222",
      title: "Code Quiz #1",
      durationMinutes: 120,
      opensAt: "2026-09-10T00:00:00.000Z",
      closesAt: "2026-09-10T03:00:00.000Z",
      status: "open",
      availability: "open",
      totalPoints: 100,
      createdAt: "2026-09-09T00:00:00.000Z",
      problems: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          orderIndex: 0,
          title: "Even or Odd",
          instructions: "Print Even or Odd.",
          language: "python",
          starterCode: null,
          // A hypothetical backend bug leaking the answer key — the schema
          // itself must not be the thing standing between a student and it.
          referenceSolution: 'print("Even")',
          points: 100,
          testCases: [],
          attempt: null,
        },
      ],
      attempt: null,
    });
    expect(parsed.problems[0]).not.toHaveProperty("referenceSolution");
  });

  it("requires numeric answer keys and a tolerance in numeric mode", () => {
    const missingTolerance = activityCreateRequestSchema.safeParse({
      title: "Average",
      instructions: "Print the average.",
      language: "python",
      allowRetake: false,
      comparisonMode: "numeric",
      testCases: [{ stdin: "1 2", expectedStdout: "1.5" }],
    });
    const nonNumericKey = activityCreateRequestSchema.safeParse({
      title: "Average",
      instructions: "Print the average.",
      language: "python",
      allowRetake: false,
      comparisonMode: "numeric",
      numericTolerance: 0.001,
      testCases: [{ stdin: "1 2", expectedStdout: "Average: 1.5" }],
    });
    expect(missingTolerance.success).toBe(false);
    expect(nonNumericKey.success).toBe(false);
  });

  it("does not allow a hidden test to expose its expected output", () => {
    const result = activityCreateRequestSchema.safeParse({
      title: "Hidden case",
      instructions: "Solve it.",
      language: "python",
      allowRetake: false,
      testCases: [
        {
          stdin: "secret",
          expectedStdout: "answer",
          isHidden: true,
          showExpectedOutput: true,
        },
      ],
    });
    expect(result.success).toBe(false);
  });
});
