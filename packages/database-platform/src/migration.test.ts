import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const migrationUrl = new URL(
  "../migrations/0001_identity.sql",
  import.meta.url,
);
const classroomMigrationUrl = new URL(
  "../migrations/0002_classroom_core.sql",
  import.meta.url,
);
const workspaceMigrationUrl = new URL(
  "../migrations/0003_workspace_provisioning.sql",
  import.meta.url,
);
const workspaceCleanupMigrationUrl = new URL(
  "../migrations/0004_workspace_cleanup.sql",
  import.meta.url,
);

describe("identity migration boundary", () => {
  it("creates only identity, membership, and audit platform tables", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(tables).toEqual([
      "institutions",
      "users",
      "institution_memberships",
      "audit_events",
    ]);
    expect(sql).not.toMatch(/workspace|student_database|credential/i);
  });

  it("enforces unique Firebase identity and membership constraints", async () => {
    const sql = await readFile(migrationUrl, "utf8");
    expect(sql).toContain("UNIQUE KEY users_firebase_uid_uq (firebase_uid)");
    expect(sql).toContain(
      "UNIQUE KEY memberships_institution_user_role_uq (institution_id, user_id, role)",
    );
    expect(sql).toContain(
      "FOREIGN KEY (institution_id) REFERENCES institutions(id)",
    );
  });
});

describe("classroom migration boundary", () => {
  it("creates only approved academic and classroom tables", async () => {
    const sql = await readFile(classroomMigrationUrl, "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(tables).toEqual([
      "departments",
      "programs",
      "terms",
      "courses",
      "classes",
      "class_teachers",
      "enrollments",
      "class_invites",
    ]);
    expect(sql).not.toMatch(/workspace|credential|query_execution/i);
  });

  it("enforces enrollment uniqueness and bounded invitation usage", async () => {
    const sql = await readFile(classroomMigrationUrl, "utf8");
    expect(sql).toContain(
      "UNIQUE KEY enrollments_class_student_uq (class_id, student_id)",
    );
    expect(sql).toContain(
      "CONSTRAINT class_invites_usage_limit_ck CHECK (usage_limit BETWEEN 1 AND 60)",
    );
    expect(sql).toContain("UNIQUE KEY class_invites_code_hash_uq (code_hash)");
    expect(sql).not.toMatch(/plaintext|invite_code VARCHAR/i);
  });
});

describe("workspace migration boundary", () => {
  it("stores only credential references and server-generated allocation names", async () => {
    const sql = await readFile(workspaceMigrationUrl, "utf8");
    expect(sql).toContain("credential_secret_ref VARCHAR(255) NOT NULL");
    expect(sql).not.toMatch(/credential_password|plaintext_secret|user_sql/i);
    expect(sql).toContain("UNIQUE KEY workspaces_idempotency_uq");
    expect(sql).toContain("workspaces_quota_ck");
  });

  it("persists retired-allocation cleanup for bounded retries", async () => {
    const sql = await readFile(workspaceCleanupMigrationUrl, "utf8");
    expect(sql).toContain("cleanup_state");
    expect(sql).toContain("cleanup_attempts");
  });
});
