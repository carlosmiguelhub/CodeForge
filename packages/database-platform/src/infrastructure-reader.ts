import type {
  AllocationCleanupState,
  GuiSessionAdminListQuery,
  GuiSessionAdminRecord,
  GuiSessionOverview,
  GuiSessionState,
  InfrastructureOverview,
  PoolInstanceSummary,
  WorkspaceAllocationListQuery,
  WorkspaceAllocationRecord,
  WorkspaceState,
} from "@sqweb/contracts";
import { and, eq, inArray, like, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import {
  guiSessions,
  platformSchema,
  users,
  workspaceAllocations,
  workspacePoolInstances,
  workspaces,
} from "./schema";

type Database = MySql2Database<typeof platformSchema>;

const WORKSPACE_STATES: readonly WorkspaceState[] = [
  "requested",
  "provisioning",
  "ready",
  "resetting",
  "suspended",
  "failed",
  "expired",
  "deleting",
  "deleted",
];

const GUI_SESSION_STATES: readonly GuiSessionState[] = [
  "requested",
  "provisioning",
  "running",
  "stopped",
  "failed",
  "expired",
];

export class MySqlInfrastructureReader {
  constructor(private readonly database: Database) {}

  async getOverview(institutionId: string): Promise<InfrastructureOverview> {
    const [stateRows, poolRows, activeRow, pendingRow, failedRow] =
      await Promise.all([
        this.database
          .select({
            state: workspaces.state,
            count: sql<number>`COUNT(*)`,
          })
          .from(workspaces)
          .where(eq(workspaces.institutionId, institutionId))
          .groupBy(workspaces.state),
        this.database
          .select({
            id: workspacePoolInstances.id,
            environment: workspacePoolInstances.environment,
            region: workspacePoolInstances.region,
            state: workspacePoolInstances.state,
            databaseCount: workspacePoolInstances.databaseCount,
            createdAt: workspacePoolInstances.createdAt,
          })
          .from(workspacePoolInstances),
        this.database
          .select({ count: sql<number>`COUNT(*)` })
          .from(workspaceAllocations)
          .innerJoin(
            workspaces,
            eq(workspaceAllocations.workspaceId, workspaces.id),
          )
          .where(
            and(
              eq(workspaces.institutionId, institutionId),
              eq(workspaceAllocations.cleanupState, "active"),
            ),
          ),
        this.database
          .select({ count: sql<number>`COUNT(*)` })
          .from(workspaceAllocations)
          .innerJoin(
            workspaces,
            eq(workspaceAllocations.workspaceId, workspaces.id),
          )
          .where(
            and(
              eq(workspaces.institutionId, institutionId),
              inArray(workspaceAllocations.cleanupState, [
                "pending",
                "cleaning",
              ]),
            ),
          ),
        this.database
          .select({ count: sql<number>`COUNT(*)` })
          .from(workspaceAllocations)
          .innerJoin(
            workspaces,
            eq(workspaceAllocations.workspaceId, workspaces.id),
          )
          .where(
            and(
              eq(workspaces.institutionId, institutionId),
              eq(workspaceAllocations.cleanupState, "failed"),
            ),
          ),
      ]);

    const workspacesByState = Object.fromEntries(
      WORKSPACE_STATES.map((state) => [state, 0]),
    ) as Record<WorkspaceState, number>;
    for (const row of stateRows) {
      workspacesByState[row.state] = Number(row.count);
    }

    const poolInstances: PoolInstanceSummary[] = poolRows.map((row) => ({
      id: row.id,
      environment: row.environment,
      region: row.region,
      state: row.state,
      databaseCount: row.databaseCount,
      createdAt: row.createdAt.toISOString(),
    }));

    return {
      workspacesByState,
      activeAllocationCount: Number(activeRow[0]?.count ?? 0),
      cleanupPendingCount: Number(pendingRow[0]?.count ?? 0),
      cleanupFailedCount: Number(failedRow[0]?.count ?? 0),
      poolInstances,
    };
  }

  async listAllocations(
    institutionId: string,
    query: WorkspaceAllocationListQuery,
  ): Promise<{
    items: readonly WorkspaceAllocationRecord[];
    total: number;
  }> {
    const conditions = [eq(workspaces.institutionId, institutionId)];
    if (query.cleanupState) {
      conditions.push(
        eq(
          workspaceAllocations.cleanupState,
          query.cleanupState as AllocationCleanupState,
        ),
      );
    }
    if (query.search) {
      const term = `%${query.search}%`;
      const searchCondition = or(
        like(users.displayName, term),
        like(users.email, term),
        like(workspaceAllocations.databaseName, term),
      );
      if (searchCondition) conditions.push(searchCondition);
    }
    const where = and(...conditions);

    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows] = await Promise.all([
      this.database
        .select({
          id: workspaceAllocations.id,
          workspaceId: workspaceAllocations.workspaceId,
          ownerDisplayName: users.displayName,
          ownerEmail: users.email,
          workspaceState: workspaces.state,
          databaseName: workspaceAllocations.databaseName,
          databaseUser: workspaceAllocations.databaseUser,
          poolEnvironment: workspacePoolInstances.environment,
          poolRegion: workspacePoolInstances.region,
          cleanupState: workspaceAllocations.cleanupState,
          cleanupAttempts: workspaceAllocations.cleanupAttempts,
          cleanupError: workspaceAllocations.cleanupError,
          allocatedAt: workspaceAllocations.allocatedAt,
          releasedAt: workspaceAllocations.releasedAt,
        })
        .from(workspaceAllocations)
        .innerJoin(
          workspaces,
          eq(workspaceAllocations.workspaceId, workspaces.id),
        )
        .innerJoin(users, eq(workspaces.ownerId, users.id))
        .innerJoin(
          workspacePoolInstances,
          eq(workspaceAllocations.poolInstanceId, workspacePoolInstances.id),
        )
        .where(where)
        .orderBy(sql`${workspaceAllocations.allocatedAt} DESC`)
        .limit(query.pageSize)
        .offset(offset),
      this.database
        .select({ count: sql<number>`COUNT(*)` })
        .from(workspaceAllocations)
        .innerJoin(
          workspaces,
          eq(workspaceAllocations.workspaceId, workspaces.id),
        )
        .innerJoin(users, eq(workspaces.ownerId, users.id))
        .where(where),
    ]);

    const items: WorkspaceAllocationRecord[] = rows.map((row) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      ownerDisplayName: row.ownerDisplayName,
      ownerEmail: row.ownerEmail,
      workspaceState: row.workspaceState,
      databaseName: row.databaseName,
      databaseUser: row.databaseUser,
      poolEnvironment: row.poolEnvironment,
      poolRegion: row.poolRegion,
      cleanupState: row.cleanupState,
      cleanupAttempts: row.cleanupAttempts,
      cleanupError: row.cleanupError,
      allocatedAt: row.allocatedAt.toISOString(),
      releasedAt: row.releasedAt ? row.releasedAt.toISOString() : null,
    }));

    return { items, total: Number(totalRows[0]?.count ?? 0) };
  }

  // Java GUI Workspace's Docker containers are a separate infrastructure
  // resource from the MySQL pool above — one gui_sessions row per container
  // run, not a persistent allocation — so it gets its own overview/list pair
  // rather than being folded into `getOverview`/`listAllocations`.
  async getGuiSessionOverview(
    institutionId: string,
  ): Promise<GuiSessionOverview> {
    const stateRows = await this.database
      .select({ state: guiSessions.state, count: sql<number>`COUNT(*)` })
      .from(guiSessions)
      .where(eq(guiSessions.institutionId, institutionId))
      .groupBy(guiSessions.state);

    const sessionsByState = Object.fromEntries(
      GUI_SESSION_STATES.map((state) => [state, 0]),
    ) as Record<GuiSessionState, number>;
    let activeContainerCount = 0;
    for (const row of stateRows) {
      sessionsByState[row.state] = Number(row.count);
      if (row.state === "provisioning" || row.state === "running") {
        activeContainerCount += Number(row.count);
      }
    }

    return { sessionsByState, activeContainerCount };
  }

  async listGuiSessions(
    institutionId: string,
    query: GuiSessionAdminListQuery,
  ): Promise<{ items: readonly GuiSessionAdminRecord[]; total: number }> {
    const conditions = [eq(guiSessions.institutionId, institutionId)];
    if (query.state) conditions.push(eq(guiSessions.state, query.state));
    if (query.search) {
      const term = `%${query.search}%`;
      const searchCondition = or(
        like(users.displayName, term),
        like(users.email, term),
        like(guiSessions.mainClassName, term),
      );
      if (searchCondition) conditions.push(searchCondition);
    }
    const where = and(...conditions);

    const offset = (query.page - 1) * query.pageSize;
    const [rows, totalRows] = await Promise.all([
      this.database
        .select({
          id: guiSessions.id,
          ownerDisplayName: users.displayName,
          ownerEmail: users.email,
          mainClassName: guiSessions.mainClassName,
          state: guiSessions.state,
          maxRuntimeSeconds: guiSessions.maxRuntimeSeconds,
          startedAt: guiSessions.startedAt,
          endsAt: guiSessions.endsAt,
          createdAt: guiSessions.createdAt,
        })
        .from(guiSessions)
        .innerJoin(users, eq(guiSessions.ownerId, users.id))
        .where(where)
        .orderBy(sql`${guiSessions.createdAt} DESC`)
        .limit(query.pageSize)
        .offset(offset),
      this.database
        .select({ count: sql<number>`COUNT(*)` })
        .from(guiSessions)
        .innerJoin(users, eq(guiSessions.ownerId, users.id))
        .where(where),
    ]);

    const items: GuiSessionAdminRecord[] = rows.map((row) => ({
      id: row.id,
      ownerDisplayName: row.ownerDisplayName,
      ownerEmail: row.ownerEmail,
      mainClassName: row.mainClassName,
      state: row.state,
      maxRuntimeSeconds: row.maxRuntimeSeconds,
      startedAt: row.startedAt ? row.startedAt.toISOString() : null,
      endsAt: row.endsAt ? row.endsAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }));

    return { items, total: Number(totalRows[0]?.count ?? 0) };
  }
}
