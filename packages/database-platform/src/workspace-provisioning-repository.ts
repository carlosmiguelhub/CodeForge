import { randomUUID } from "node:crypto";

import type {
  WorkspaceAllocation,
  WorkspaceCleanupTask,
  WorkspaceProvisioningRepository,
  WorkspaceProvisioningTask,
  WorkspaceResetTask,
} from "@sqweb/workspace";
import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";

interface WorkspaceTaskRow extends RowDataPacket {
  workspace_id: string;
  institution_id: string;
  actor_id: string;
  quota_bytes: number;
  template_version_id: string | null;
}

interface ResetTaskRow extends WorkspaceTaskRow {
  reset_id: string;
  allocation_id: string | null;
  database_name: string | null;
  database_user: string | null;
  credential_secret_ref: string | null;
}

interface CleanupTaskRow extends RowDataPacket {
  allocation_id: string;
  workspace_id: string;
  institution_id: string;
  actor_id: string;
  database_name: string;
  database_user: string;
  credential_secret_ref: string;
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

function allocation(row: ResetTaskRow): WorkspaceAllocation | null {
  if (
    !row.allocation_id ||
    !row.database_name ||
    !row.database_user ||
    !row.credential_secret_ref
  )
    return null;
  return {
    id: row.allocation_id,
    databaseName: row.database_name,
    databaseUser: row.database_user,
    credentialSecretRef: row.credential_secret_ref,
  };
}

export class MySqlWorkspaceProvisioningRepository implements WorkspaceProvisioningRepository {
  constructor(private readonly pool: Pool) {}

  async claimRequested(): Promise<WorkspaceProvisioningTask | null> {
    return transaction(this.pool, async (connection) => {
      const [rows] = await connection.query<WorkspaceTaskRow[]>(
        `SELECT id AS workspace_id, institution_id, owner_id AS actor_id,
                quota_bytes, template_version_id
           FROM workspaces WHERE state = 'requested'
           ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const row = rows[0];
      if (!row) return null;
      await connection.execute(
        `UPDATE workspaces SET state = 'provisioning', failure_code = NULL
         WHERE id = ? AND state = 'requested'`,
        [row.workspace_id],
      );
      return {
        workspaceId: row.workspace_id,
        institutionId: row.institution_id,
        actorId: row.actor_id,
        quotaBytes: Number(row.quota_bytes),
        templateVersionId: row.template_version_id,
      };
    });
  }

  async claimReset(): Promise<WorkspaceResetTask | null> {
    return transaction(this.pool, async (connection) => {
      const [rows] = await connection.query<ResetTaskRow[]>(
        `SELECT r.id AS reset_id, w.id AS workspace_id, w.institution_id,
                r.actor_id, w.quota_bytes,
                w.template_version_id, a.id AS allocation_id,
                a.database_name, a.database_user, a.credential_secret_ref
           FROM workspace_resets r
           JOIN workspaces w ON w.id = r.workspace_id
           LEFT JOIN workspace_allocations a
             ON a.workspace_id = w.id AND a.released_at IS NULL
          WHERE r.state = 'requested'
          ORDER BY r.started_at, r.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const row = rows[0];
      if (!row) return null;
      await connection.execute(
        `UPDATE workspace_resets SET state = 'running', started_at = CURRENT_TIMESTAMP(3)
         WHERE id = ? AND state = 'requested'`,
        [row.reset_id],
      );
      return {
        resetId: row.reset_id,
        workspaceId: row.workspace_id,
        institutionId: row.institution_id,
        actorId: row.actor_id,
        quotaBytes: Number(row.quota_bytes),
        templateVersionId: row.template_version_id,
        previousAllocation: allocation(row),
      };
    });
  }

  async claimCleanup(): Promise<WorkspaceCleanupTask | null> {
    return transaction(this.pool, async (connection) => {
      const [rows] = await connection.query<CleanupTaskRow[]>(
        `SELECT a.id AS allocation_id, a.workspace_id, w.institution_id,
                w.owner_id AS actor_id, a.database_name, a.database_user,
                a.credential_secret_ref
           FROM workspace_allocations a
           JOIN workspaces w ON w.id = a.workspace_id
          WHERE a.cleanup_state IN ('pending', 'failed') AND a.cleanup_attempts < 5
          ORDER BY a.released_at, a.id LIMIT 1 FOR UPDATE SKIP LOCKED`,
      );
      const row = rows[0];
      if (!row) return null;
      await connection.execute(
        `UPDATE workspace_allocations
            SET cleanup_state = 'cleaning', cleanup_attempts = cleanup_attempts + 1,
                cleanup_error = NULL
          WHERE id = ?`,
        [row.allocation_id],
      );
      return {
        id: row.allocation_id,
        workspaceId: row.workspace_id,
        institutionId: row.institution_id,
        actorId: row.actor_id,
        databaseName: row.database_name,
        databaseUser: row.database_user,
        credentialSecretRef: row.credential_secret_ref,
      };
    });
  }

  async completeProvisioning(
    input: Parameters<
      WorkspaceProvisioningRepository["completeProvisioning"]
    >[0],
  ) {
    await transaction(this.pool, async (connection) => {
      await this.insertAllocation(connection, input);
      await connection.execute(
        `UPDATE workspaces SET state = 'ready', failure_code = NULL WHERE id = ?`,
        [input.task.workspaceId],
      );
      await connection.execute(
        `UPDATE workspace_pool_instances SET database_count = database_count + 1
         WHERE id = ?`,
        [input.poolInstanceId],
      );
      await this.insertAudit(
        connection,
        input.task,
        "workspace.created",
        "succeeded",
      );
    });
  }

  async completeReset(
    input: Parameters<WorkspaceProvisioningRepository["completeReset"]>[0],
  ) {
    await transaction(this.pool, async (connection) => {
      if (input.task.previousAllocation) {
        await connection.execute(
          `UPDATE workspace_allocations
              SET released_at = CURRENT_TIMESTAMP(3), cleanup_state = 'pending'
           WHERE id = ? AND released_at IS NULL`,
          [input.task.previousAllocation.id],
        );
      }
      await this.insertAllocation(connection, input);
      await connection.execute(
        `UPDATE workspace_resets
         SET state = 'succeeded', finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [input.task.resetId],
      );
      await connection.execute(
        `UPDATE workspaces SET state = 'ready', failure_code = NULL WHERE id = ?`,
        [input.task.workspaceId],
      );
      await this.insertAudit(
        connection,
        input.task,
        "workspace.credential_rotated",
        "succeeded",
      );
    });
  }

  private async insertAllocation(
    connection: PoolConnection,
    input: Parameters<
      WorkspaceProvisioningRepository["completeProvisioning"]
    >[0],
  ) {
    await connection.execute(
      `INSERT INTO workspace_allocations
       (id, workspace_id, pool_instance_id, database_name, database_user,
        credential_secret_ref)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        input.provisioned.allocationId,
        input.task.workspaceId,
        input.poolInstanceId,
        input.provisioned.databaseName,
        input.provisioned.databaseUser,
        input.secretRef,
      ],
    );
  }

  private async insertAudit(
    connection: PoolConnection,
    task: WorkspaceProvisioningTask,
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
        task.actorId,
        action,
        task.workspaceId,
        result,
        reason ?? null,
      ],
    );
  }

  async failProvisioning(workspaceId: string, failureCode: string) {
    await transaction(this.pool, async (connection) => {
      const [rows] = await connection.query<WorkspaceTaskRow[]>(
        `SELECT id AS workspace_id, institution_id, owner_id AS actor_id,
                quota_bytes, template_version_id FROM workspaces WHERE id = ? FOR UPDATE`,
        [workspaceId],
      );
      const row = rows[0];
      if (!row) return;
      await connection.execute(
        `UPDATE workspaces SET state = 'failed', failure_code = ? WHERE id = ?`,
        [failureCode, workspaceId],
      );
      await this.insertAudit(
        connection,
        {
          workspaceId,
          institutionId: row.institution_id,
          actorId: row.actor_id,
          quotaBytes: Number(row.quota_bytes),
          templateVersionId: row.template_version_id,
        },
        "workspace.provisioning_failed",
        "failed",
        failureCode,
      );
    });
  }

  async failReset(task: WorkspaceResetTask, failureCode: string) {
    await transaction(this.pool, async (connection) => {
      await connection.execute(
        `UPDATE workspace_resets
         SET state = 'failed', finished_at = CURRENT_TIMESTAMP(3) WHERE id = ?`,
        [task.resetId],
      );
      await connection.execute(
        `UPDATE workspaces SET state = ?, failure_code = ? WHERE id = ?`,
        [
          task.previousAllocation ? "ready" : "failed",
          failureCode,
          task.workspaceId,
        ],
      );
      await this.insertAudit(
        connection,
        task,
        "workspace.provisioning_failed",
        "failed",
        failureCode,
      );
    });
  }

  async completeCleanup(allocationId: string) {
    await this.pool.execute(
      `UPDATE workspace_allocations
          SET cleanup_state = 'complete', cleanup_error = NULL WHERE id = ?`,
      [allocationId],
    );
  }

  async failCleanup(task: WorkspaceCleanupTask, failureCode: string) {
    await transaction(this.pool, async (connection) => {
      await connection.execute(
        `UPDATE workspace_allocations
            SET cleanup_state = 'failed', cleanup_error = ? WHERE id = ?`,
        [failureCode, task.id],
      );
      await this.insertAudit(
        connection,
        {
          workspaceId: task.workspaceId,
          institutionId: task.institutionId,
          actorId: task.actorId,
          quotaBytes: 1,
          templateVersionId: null,
        },
        "workspace.provisioning_failed",
        "failed",
        `CLEANUP_${failureCode}`.slice(0, 80),
      );
    });
  }
}
