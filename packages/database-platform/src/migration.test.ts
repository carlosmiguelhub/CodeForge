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
const queryExecutionMigrationUrl = new URL(
  "../migrations/0005_query_execution.sql",
  import.meta.url,
);
const erdDiagramMigrationUrl = new URL(
  "../migrations/0007_erd_diagrams.sql",
  import.meta.url,
);
const codeWorkspaceMigrationUrl = new URL(
  "../migrations/0008_code_workspace.sql",
  import.meta.url,
);
const savedQueryMigrationUrl = new URL(
  "../migrations/0009_saved_queries.sql",
  import.meta.url,
);
const sectionsMigrationUrl = new URL(
  "../migrations/0010_sections.sql",
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

  it("stores bounded execution metadata without SQL text", async () => {
    const sql = await readFile(queryExecutionMigrationUrl, "utf8");
    expect(sql).toContain("statement_hash CHAR(64)");
    expect(sql).toContain("rows_returned");
    expect(sql).not.toMatch(/sql_text|sql_content|credential_secret_ref/i);
  });
});

describe("erd diagram migration boundary", () => {
  it("creates only the erd_diagrams table, owned per-user", async () => {
    const sql = await readFile(erdDiagramMigrationUrl, "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(tables).toEqual(["erd_diagrams"]);
    expect(sql).toContain("KEY erd_diagrams_owner_idx (owner_id)");
    expect(sql).toContain(
      "CONSTRAINT erd_diagrams_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id)",
    );
    expect(sql).toContain("content JSON NOT NULL");
  });
});

describe("code workspace migration boundary", () => {
  it("creates one owner-unique workspace table and one execution-history table", async () => {
    const sql = await readFile(codeWorkspaceMigrationUrl, "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(tables).toEqual(["code_workspaces", "code_executions"]);
    expect(sql).toContain("UNIQUE KEY code_workspaces_owner_uq (owner_id)");
    expect(sql).toContain(
      "CONSTRAINT code_workspaces_owner_fk FOREIGN KEY (owner_id) REFERENCES users(id)",
    );
    expect(sql).toContain("INDEX code_executions_actor_started_idx");
    expect(sql).not.toMatch(/source_code|stdin|stdout/i);
  });
});

describe("saved query migration boundary", () => {
  it("ties each saved query to both its owner and a specific workspace", async () => {
    const sql = await readFile(savedQueryMigrationUrl, "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(tables).toEqual(["saved_queries"]);
    expect(sql).toContain(
      "KEY saved_queries_owner_workspace_idx (owner_id, workspace_id)",
    );
    expect(sql).toContain(
      "CONSTRAINT saved_queries_workspace_fk FOREIGN KEY (workspace_id) REFERENCES workspaces(id)",
    );
    expect(sql).toContain("sql_text TEXT NOT NULL");
  });
});

describe("sections migration boundary", () => {
  it("creates an admin-managed section list and links it from users", async () => {
    const sql = await readFile(sectionsMigrationUrl, "utf8");
    const tables = [...sql.matchAll(/CREATE TABLE ([a-z_]+)/g)].map(
      (match) => match[1],
    );
    expect(tables).toEqual(["sections"]);
    expect(sql).toContain(
      "UNIQUE KEY sections_institution_name_uq (institution_id, name)",
    );
    expect(sql).toContain("ALTER TABLE users");
    expect(sql).toContain(
      "ADD CONSTRAINT users_section_fk FOREIGN KEY (section_id) REFERENCES sections(id) ON DELETE SET NULL",
    );
    // Sections are archived (soft-removed), never dropped — existing
    // students' historical section reference must survive a removal.
    expect(sql).toContain("archived_at TIMESTAMP(3) NULL");
    expect(sql).not.toMatch(/DROP TABLE|DELETE FROM/i);
  });
});
