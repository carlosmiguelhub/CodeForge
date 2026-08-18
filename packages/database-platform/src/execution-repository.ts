import { AuthorizationError } from "@sqweb/auth";
import type {
  AuthorizedWorkspaceExecution,
  ExecutionGrantPayload,
  ExecutionRepository,
  QueryHistoryItem,
} from "@sqweb/execution";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

interface AccessRow extends RowDataPacket {
  actor_id: string;
  institution_id: string;
  workspace_id: string;
  credential_secret_ref: string;
}

interface CountRow extends RowDataPacket {
  count: number;
}

interface HistoryRow extends RowDataPacket {
  id: string;
  workspace_id: string;
  state: QueryHistoryItem["state"];
  statement_classes_json: string | readonly string[];
  duration_ms: number | null;
  rows_returned: number;
  bytes_returned: number;
  started_at: Date;
}

async function transaction<T>(
  pool: Pool,
  operation: (connection: PoolConnection) => Promise<T>,
) {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const result = await operation(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export class MySqlExecutionRepository implements ExecutionRepository {
  constructor(private readonly pool: Pool) {}

  private async resolve(
    connection: Pick<PoolConnection, "query"> | Pool,
    firebaseUid: string,
    grant: ExecutionGrantPayload,
    lock = false,
  ): Promise<AuthorizedWorkspaceExecution> {
    const [rows] = await connection.query<AccessRow[]>(
      `SELECT u.id AS actor_id, m.institution_id, w.id AS workspace_id,
              a.credential_secret_ref
         FROM users u
         JOIN institution_memberships m
           ON m.user_id = u.id AND m.approval_state = 'approved'
          AND m.role IN ('student', 'teacher')
         JOIN workspaces w
           ON w.owner_id = u.id AND w.institution_id = m.institution_id
          AND w.state = 'ready'
         JOIN workspace_allocations a
           ON a.workspace_id = w.id AND a.released_at IS NULL
        WHERE u.firebase_uid = ? AND u.status = 'active' AND w.id = ?
        LIMIT 1${lock ? " FOR UPDATE" : ""}`,
      [firebaseUid, grant.workspaceId],
    );
    const row = rows[0];
    if (
      !row ||
      row.actor_id !== grant.accountId ||
      row.institution_id !== grant.institutionId
    )
      throw new AuthorizationError(
        "WORKSPACE_ACCESS_DENIED",
        "The workspace is unavailable for execution.",
        403,
      );
    return {
      actorId: row.actor_id,
      institutionId: row.institution_id,
      workspaceId: row.workspace_id,
      credentialSecretRef: row.credential_secret_ref,
    };
  }

  async authorizeAndStart(
    input: Parameters<ExecutionRepository["authorizeAndStart"]>[0],
  ) {
    return transaction(this.pool, async (connection) => {
      const access = await this.resolve(
        connection,
        input.firebaseUid,
        input.grant,
        true,
      );
      const [running] = await connection.query<CountRow[]>(
        `SELECT COUNT(*) AS count FROM query_executions
          WHERE actor_id = ? AND state IN ('queued', 'running')`,
        [access.actorId],
      );
      if (Number(running[0]?.count ?? 0) >= 2)
        throw new AuthorizationError(
          "EXECUTION_CONCURRENCY_LIMIT",
          "Two queries are already active for this account.",
          429,
        );
      const [recent] = await connection.query<CountRow[]>(
        `SELECT COUNT(*) AS count FROM query_executions
          WHERE actor_id = ? AND started_at >= CURRENT_TIMESTAMP(3) - INTERVAL 1 MINUTE`,
        [access.actorId],
      );
      if (Number(recent[0]?.count ?? 0) >= 10)
        throw new AuthorizationError(
          "EXECUTION_RATE_LIMIT",
          "The query start limit has been reached. Try again shortly.",
          429,
        );
      await connection.execute(
        `INSERT INTO query_executions
         (id, institution_id, actor_id, workspace_id, statement_hash,
          statement_classes_json, state)
         VALUES (?, ?, ?, ?, ?, ?, 'running')`,
        [
          input.executionId,
          access.institutionId,
          access.actorId,
          access.workspaceId,
          input.statementHash,
          JSON.stringify(input.statementClasses),
        ],
      );
      return access;
    });
  }

  async finish(input: Parameters<ExecutionRepository["finish"]>[0]) {
    await this.pool.execute(
      `UPDATE query_executions
          SET state = IF(state = 'cancelled', 'cancelled', ?), duration_ms = ?,
              rows_returned = ?, bytes_returned = ?, error_category = ?,
              finished_at = CURRENT_TIMESTAMP(3)
        WHERE id = ?`,
      [
        input.state,
        input.durationMs,
        input.rowsReturned,
        input.bytesReturned,
        input.errorCategory ?? null,
        input.executionId,
      ],
    );
  }

  async requestCancellation(executionId: string, firebaseUid: string) {
    const [result] = await this.pool.execute(
      `UPDATE query_executions q
       JOIN users u ON u.id = q.actor_id
          SET q.state = 'cancelled', q.finished_at = CURRENT_TIMESTAMP(3)
        WHERE q.id = ? AND u.firebase_uid = ? AND q.state IN ('queued', 'running')`,
      [executionId, firebaseUid],
    );
    if (Number((result as { affectedRows?: number }).affectedRows ?? 0) > 0)
      return true;
    const [existing] = await this.pool.query<CountRow[]>(
      `SELECT COUNT(*) AS count
         FROM query_executions q
         JOIN users u ON u.id = q.actor_id
        WHERE q.id = ? AND u.firebase_uid = ? AND q.state = 'cancelled'`,
      [executionId, firebaseUid],
    );
    return Number(existing[0]?.count ?? 0) > 0;
  }

  async listHistory(firebaseUid: string, workspaceId: string) {
    const [rows] = await this.pool.query<HistoryRow[]>(
      `SELECT q.id, q.workspace_id, q.state, q.statement_classes_json,
              q.duration_ms, q.rows_returned, q.bytes_returned, q.started_at
         FROM query_executions q
         JOIN users u ON u.id = q.actor_id
        WHERE u.firebase_uid = ? AND q.workspace_id = ?
        ORDER BY q.started_at DESC LIMIT 50`,
      [firebaseUid, workspaceId],
    );
    return rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspace_id,
      state: row.state,
      statementClasses:
        typeof row.statement_classes_json === "string"
          ? (JSON.parse(row.statement_classes_json) as string[])
          : row.statement_classes_json,
      durationMs: row.duration_ms,
      rowsReturned: row.rows_returned,
      bytesReturned: row.bytes_returned,
      startedAt: row.started_at.toISOString(),
    }));
  }

  async resolveForSchema(firebaseUid: string, grant: ExecutionGrantPayload) {
    return this.resolve(this.pool, firebaseUid, grant);
  }
}
