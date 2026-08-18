import { describe, expect, it } from "vitest";

import {
  classCreateRequestSchema,
  invitationCreateRequestSchema,
  executionRequestSchema,
  interactiveExecutionLimits,
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

  it("requires opaque academic identifiers for class creation", () => {
    expect(
      classCreateRequestSchema.safeParse({
        courseId: "DB101",
        termId: "First Term",
        section: "A",
      }).success,
    ).toBe(false);
  });

  it("bounds invitation usage by the approved class-size ceiling", () => {
    expect(
      invitationCreateRequestSchema.safeParse({
        expiresAt: "2026-08-19T00:00:00.000Z",
        usageLimit: 61,
      }).success,
    ).toBe(false);
  });
});
