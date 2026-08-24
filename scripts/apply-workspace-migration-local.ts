import { readFile } from "node:fs/promises";

import { createConnection, type RowDataPacket } from "mysql2/promise";

const databaseUrl = process.env.PLATFORM_DATABASE_URL;
if (process.env.NODE_ENV === "production" || !databaseUrl)
  throw new Error(
    "This migration helper is restricted to configured local development.",
  );

async function main() {
  const connection = await createConnection({
    uri: databaseUrl,
    multipleStatements: true,
  });
  try {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'workspaces'`,
    );
    if (Number(rows[0]?.count ?? 0) > 0) {
      console.log("Workspace migration is already present.");
    } else {
      const migration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0003_workspace_provisioning.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(migration);
      console.log("Workspace migration applied.");
    }
    const [cleanupColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'workspace_allocations'
         AND column_name = 'cleanup_state'`,
    );
    if (Number(cleanupColumns[0]?.count ?? 0) === 0) {
      const cleanupMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0004_workspace_cleanup.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(cleanupMigration);
      console.log("Workspace cleanup migration applied.");
    }
    const [executionTables] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'query_executions'`,
    );
    if (Number(executionTables[0]?.count ?? 0) === 0) {
      const executionMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0005_query_execution.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(executionMigration);
      console.log("Query execution migration applied.");
    }
    const [erdDiagramTables] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'erd_diagrams'`,
    );
    if (Number(erdDiagramTables[0]?.count ?? 0) === 0) {
      const erdDiagramMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0007_erd_diagrams.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(erdDiagramMigration);
      console.log("ERD diagram migration applied.");
    }
    const [codeWorkspaceTables] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'code_workspaces'`,
    );
    if (Number(codeWorkspaceTables[0]?.count ?? 0) === 0) {
      const codeWorkspaceMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0008_code_workspace.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(codeWorkspaceMigration);
      console.log("Code workspace migration applied.");
    }
    const [savedQueryTables] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'saved_queries'`,
    );
    if (Number(savedQueryTables[0]?.count ?? 0) === 0) {
      const savedQueryMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0009_saved_queries.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(savedQueryMigration);
      console.log("Saved query migration applied.");
    }
    const [sectionTables] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'sections'`,
    );
    if (Number(sectionTables[0]?.count ?? 0) === 0) {
      const sectionMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0010_sections.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(sectionMigration);
      console.log("Sections migration applied.");
    }
    const [lockColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'sections'
         AND column_name = 'locked_workspaces_json'`,
    );
    if (Number(lockColumns[0]?.count ?? 0) === 0) {
      const lockMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0011_section_workspace_locks.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(lockMigration);
      console.log("Section workspace locks migration applied.");
    }
    const [maintenanceColumns] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.columns
       WHERE table_schema = DATABASE() AND table_name = 'institutions'
         AND column_name = 'maintenance_mode'`,
    );
    if (Number(maintenanceColumns[0]?.count ?? 0) === 0) {
      const maintenanceMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0012_institution_maintenance.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(maintenanceMigration);
      console.log("Institution maintenance migration applied.");
    }
    const [guiSessionTables] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS count FROM information_schema.tables
       WHERE table_schema = DATABASE() AND table_name = 'gui_sessions'`,
    );
    if (Number(guiSessionTables[0]?.count ?? 0) === 0) {
      const guiSessionMigration = await readFile(
        new URL(
          "../packages/database-platform/migrations/0013_gui_sessions.sql",
          import.meta.url,
        ),
        "utf8",
      );
      await connection.query(guiSessionMigration);
      console.log("GUI session migration applied.");
    }
  } finally {
    await connection.end();
  }
}

void main();
