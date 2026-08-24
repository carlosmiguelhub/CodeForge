import type {
  GuiContainerAllocation,
  GuiSessionAccessRepository,
  GuiSessionRecord,
} from "@sqweb/gui-session";
import type {
  Pool,
  PoolConnection,
  ResultSetHeader,
  RowDataPacket,
} from "mysql2/promise";

interface AllocationRow extends RowDataPacket {
  id: string;
  container_ref: string;
  internal_host: string;
  websockify_port: number;
}

interface SessionRow extends RowDataPacket {
  id: string;
  owner_id: string;
  state: GuiSessionRecord["state"];
  main_class_name: string;
  max_runtime_seconds: number;
  failure_code: string | null;
  started_at: Date | null;
  ends_at: Date | null;
  created_at: Date;
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

// Read/write access for platform-api's GuiSessionService and
// gui-execution-api — deliberately separate from
// MySqlGuiSessionProvisioningRepository (that one drives the provisioning
// worker's claim/complete/fail lifecycle; this one answers "create a
// session row" / "what's its current state" / "where do I connect" /
// "mark it stopped").
export class MySqlGuiSessionAccessReader implements GuiSessionAccessRepository {
  constructor(private readonly pool: Pool) {}

  async create(input: {
    id: string;
    institutionId: string;
    ownerId: string;
    mainClassName: string;
    maxRuntimeSeconds: number;
  }): Promise<void> {
    await this.pool.execute(
      `INSERT INTO gui_sessions
       (id, institution_id, owner_id, main_class_name, state, max_runtime_seconds)
       VALUES (?, ?, ?, ?, 'requested', ?)`,
      [
        input.id,
        input.institutionId,
        input.ownerId,
        input.mainClassName,
        input.maxRuntimeSeconds,
      ],
    );
  }

  async get(sessionId: string): Promise<GuiSessionRecord | null> {
    const [rows] = await this.pool.query<SessionRow[]>(
      `SELECT id, owner_id, state, main_class_name, max_runtime_seconds,
              failure_code, started_at, ends_at, created_at
         FROM gui_sessions WHERE id = ?`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      state: row.state,
      mainClassName: row.main_class_name,
      maxRuntimeSeconds: row.max_runtime_seconds,
      failureCode: row.failure_code,
      startedAt: row.started_at ? row.started_at.toISOString() : null,
      endsAt: row.ends_at ? row.ends_at.toISOString() : null,
      createdAt: row.created_at.toISOString(),
    };
  }

  async findAllocation(
    sessionId: string,
  ): Promise<GuiContainerAllocation | null> {
    const [rows] = await this.pool.query<AllocationRow[]>(
      `SELECT id, container_ref, internal_host, websockify_port
         FROM gui_container_allocations
        WHERE session_id = ? AND cleanup_state = 'active'`,
      [sessionId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      id: row.id,
      containerRef: row.container_ref,
      internalHost: row.internal_host,
      websockifyPort: row.websockify_port,
    };
  }

  // Fast-path cleanup trigger — fired immediately on the vnc WebSocket's
  // close event, or on an explicit Stop request, rather than waiting for
  // the provisioning worker's next safety-net poll tick. Handles both a
  // session that's already running (has an active allocation to tear
  // down) and one still queued/provisioning (no allocation yet — just
  // pull it out of the worker's claimable set). A session stopped in the
  // narrow window while the worker is mid-provision can be overwritten
  // back to 'running' by that in-flight completeProvisioning() call — an
  // accepted V1 gap (the safety-net reaper still bounds its lifetime to
  // max_runtime_seconds either way, so nothing leaks indefinitely).
  async markStopped(sessionId: string): Promise<void> {
    await transaction(this.pool, async (connection) => {
      const [result] = await connection.execute<ResultSetHeader>(
        `UPDATE gui_container_allocations a
           JOIN gui_sessions s ON s.id = a.session_id
            SET a.cleanup_state = 'pending',
                s.state = 'stopped'
          WHERE a.session_id = ? AND a.cleanup_state = 'active' AND s.state = 'running'`,
        [sessionId],
      );
      if (result.affectedRows > 0) return;
      await connection.execute(
        `UPDATE gui_sessions SET state = 'stopped'
          WHERE id = ? AND state IN ('requested', 'provisioning')`,
        [sessionId],
      );
    });
  }
}
