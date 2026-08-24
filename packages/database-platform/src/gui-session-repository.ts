import { randomUUID } from "node:crypto";

import type {
  GuiSessionCleanupTask,
  GuiSessionFile,
  GuiSessionProvisioningRepository,
  GuiSessionTask,
  ProvisionedGuiContainer,
} from "@sqweb/gui-session";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

interface JavaGuiFileContent {
  id: string;
  name: string;
  sourceCode: string;
}

interface JavaGuiWorkspaceContentColumn {
  files: JavaGuiFileContent[];
  mainFileId: string | null;
}

interface SessionTaskRow extends RowDataPacket {
  session_id: string;
  institution_id: string;
  owner_id: string;
  max_runtime_seconds: number;
  content: JavaGuiWorkspaceContentColumn | null;
}

interface CleanupTaskRow extends RowDataPacket {
  allocation_id: string;
  session_id: string;
  container_ref: string;
  internal_host: string;
  websockify_port: number;
}

async function transaction<T>(
  pool: Pool,
  operation: (connection: PoolConnection) => Promise<T>,
): Promise<T> {
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

// Resolves the currently-saved workspace content into what the container
// admin needs to compile and launch it. Deliberately reads the *current*
// java_gui_workspaces row rather than a frozen snapshot taken at request
// time — see plan section 5 discussion: a student editing between clicking
// Run and the worker's next poll tick (well under a second in practice) is
// an acceptable tradeoff for a personal practice tool, not a correctness
// bug.
function resolveMainClass(content: JavaGuiWorkspaceContentColumn | null): {
  mainClassName: string;
  files: GuiSessionFile[];
} {
  if (!content?.mainFileId) throw new Error("MAIN_FILE_NOT_SET");
  const mainFile = content.files.find((file) => file.id === content.mainFileId);
  if (!mainFile) throw new Error("MAIN_FILE_NOT_SET");
  return {
    mainClassName: mainFile.name.replace(/\.java$/, ""),
    files: content.files.map((file) => ({
      path: file.name,
      content: file.sourceCode,
    })),
  };
}

export class MySqlGuiSessionProvisioningRepository
  implements GuiSessionProvisioningRepository
{
  constructor(private readonly pool: Pool) {}

  async claimRequested(): Promise<GuiSessionTask | null> {
    return transaction(this.pool, async (connection) => {
      const [rows] = await connection.query<SessionTaskRow[]>(
        `SELECT s.id AS session_id, s.institution_id, s.owner_id,
                s.max_runtime_seconds, w.content AS content
           FROM gui_sessions s
           LEFT JOIN java_gui_workspaces w ON w.owner_id = s.owner_id
          WHERE s.state = 'requested'
          ORDER BY s.created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const row = rows[0];
      if (!row) return null;

      let resolved: ReturnType<typeof resolveMainClass>;
      try {
        resolved = resolveMainClass(row.content);
      } catch (error) {
        // Can't provision without a valid main file — fail it here rather
        // than leaving it stuck in 'requested' forever. Platform-api's
        // future create-route validates this up front (see plan section
        // 4); this is defense-in-depth against a stale/edited workspace.
        await connection.execute(
          `UPDATE gui_sessions SET state = 'failed', failure_code = ? WHERE id = ?`,
          [(error as Error).message.slice(0, 80), row.session_id],
        );
        return null;
      }

      await connection.execute(
        `UPDATE gui_sessions SET state = 'provisioning', failure_code = NULL
         WHERE id = ? AND state = 'requested'`,
        [row.session_id],
      );
      return {
        sessionId: row.session_id,
        institutionId: row.institution_id,
        ownerId: row.owner_id,
        maxRuntimeSeconds: row.max_runtime_seconds,
        mainClassName: resolved.mainClassName,
        files: resolved.files,
      };
    });
  }

  async claimCleanup(): Promise<GuiSessionCleanupTask | null> {
    return transaction(this.pool, async (connection) => {
      const [rows] = await connection.query<CleanupTaskRow[]>(
        `SELECT a.id AS allocation_id, a.session_id, a.container_ref,
                a.internal_host, a.websockify_port
           FROM gui_container_allocations a
          WHERE a.cleanup_state IN ('pending', 'failed') AND a.cleanup_attempts < 5
          ORDER BY a.allocated_at, a.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const row = rows[0];
      if (!row) return null;
      await connection.execute(
        `UPDATE gui_container_allocations
            SET cleanup_state = 'cleaning', cleanup_attempts = cleanup_attempts + 1,
                cleanup_error = NULL
          WHERE id = ?`,
        [row.allocation_id],
      );
      return {
        id: row.allocation_id,
        sessionId: row.session_id,
        containerRef: row.container_ref,
        internalHost: row.internal_host,
        websockifyPort: row.websockify_port,
      };
    });
  }

  async completeProvisioning(input: {
    task: GuiSessionTask;
    provisioned: ProvisionedGuiContainer;
    poolInstanceId: string;
  }) {
    await transaction(this.pool, async (connection) => {
      await connection.execute(
        `INSERT INTO gui_container_allocations
         (id, session_id, pool_instance_id, container_ref, internal_host, websockify_port)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          input.provisioned.allocationId,
          input.task.sessionId,
          input.poolInstanceId,
          input.provisioned.containerRef,
          input.provisioned.internalHost,
          input.provisioned.websockifyPort,
        ],
      );
      await connection.execute(
        `UPDATE gui_sessions
            SET state = 'running', failure_code = NULL,
                started_at = CURRENT_TIMESTAMP(3),
                ends_at = DATE_ADD(CURRENT_TIMESTAMP(3), INTERVAL ? SECOND)
          WHERE id = ?`,
        [input.task.maxRuntimeSeconds, input.task.sessionId],
      );
      await connection.execute(
        `UPDATE gui_session_pool_instances SET session_count = session_count + 1
         WHERE id = ?`,
        [input.poolInstanceId],
      );
      await this.insertAudit(
        connection,
        input.task,
        "gui_session.provisioned",
        "succeeded",
      );
    });
  }

  async failProvisioning(sessionId: string, failureCode: string) {
    await transaction(this.pool, async (connection) => {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT institution_id, owner_id FROM gui_sessions WHERE id = ? FOR UPDATE`,
        [sessionId],
      );
      const row = rows[0];
      if (!row) return;
      await connection.execute(
        `UPDATE gui_sessions SET state = 'failed', failure_code = ? WHERE id = ?`,
        [failureCode, sessionId],
      );
      await this.insertAudit(
        connection,
        {
          sessionId,
          institutionId: row.institution_id as string,
          ownerId: row.owner_id as string,
        },
        "gui_session.provisioning_failed",
        "failed",
        failureCode,
      );
    });
  }

  async completeCleanup(allocationId: string) {
    await this.pool.execute(
      `UPDATE gui_container_allocations
          SET cleanup_state = 'complete', cleanup_error = NULL,
              released_at = COALESCE(released_at, CURRENT_TIMESTAMP(3))
        WHERE id = ?`,
      [allocationId],
    );
  }

  async failCleanup(task: GuiSessionCleanupTask, failureCode: string) {
    await this.pool.execute(
      `UPDATE gui_container_allocations
          SET cleanup_state = 'failed', cleanup_error = ? WHERE id = ?`,
      [failureCode, task.id],
    );
  }

  async reapExpiredActive(): Promise<number> {
    const [result] = await this.pool.execute<ResultSetHeader>(
      `UPDATE gui_container_allocations a
         JOIN gui_sessions s ON s.id = a.session_id
          SET a.cleanup_state = 'pending',
              s.state = 'expired'
        WHERE a.cleanup_state = 'active'
          AND s.state = 'running'
          AND s.ends_at IS NOT NULL
          AND s.ends_at < CURRENT_TIMESTAMP(3)`,
    );
    return result.affectedRows;
  }

  private async insertAudit(
    connection: PoolConnection,
    task: { sessionId: string; institutionId: string; ownerId: string },
    action: string,
    result: "succeeded" | "failed",
    reason?: string,
  ) {
    await connection.execute(
      `INSERT INTO audit_events
       (id, institution_id, actor_id, action, target_id, result, reason)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        randomUUID(),
        task.institutionId,
        task.ownerId,
        action,
        task.sessionId,
        result,
        reason ?? null,
      ],
    );
  }
}
