import { describe, expect, it } from "vitest";

import {
  accountListQuerySchema,
  adminCreateUserRequestSchema,
  auditEventListQuerySchema,
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
});
