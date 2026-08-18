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
  } finally {
    await connection.end();
  }
}

void main();
