import { describe, expect, it, vi } from "vitest";

import { MySqlWorkspaceAdmin, quoteIdentifier } from "./mysql-workspace-admin";

describe("MySqlWorkspaceAdmin", () => {
  it("rejects identifiers that could escape an administrative statement", () => {
    expect(() => quoteIdentifier("safe_name")).not.toThrow();
    expect(() => quoteIdentifier("db`; DROP DATABASE mysql; --")).toThrow();
  });

  it("grants only workspace-scoped data and schema privileges", async () => {
    const query = vi.fn().mockResolvedValue([[], []]);
    const admin = new MySqlWorkspaceAdmin(
      { query } as never,
      "workspace-mysql",
      3306,
    );
    const result = await admin.provision(
      "00000000-0000-4000-8000-000000000040",
    );
    const grant = String(
      query.mock.calls.find(([sql]) =>
        String(sql).trim().startsWith("GRANT"),
      )?.[0],
    );
    expect(grant).toContain(`ON \`${result.databaseName}\`.*`);
    expect(grant).not.toMatch(
      /\b(FILE|PROCESS|SUPER|CREATE USER|GRANT OPTION)\b/,
    );
    expect(result.credential.password).not.toHaveLength(0);
  });
});
