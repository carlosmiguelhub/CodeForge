import type {
  CodeWorkspaceContent,
  TopContributorRecord,
  WorkspaceUsageStat,
} from "@sqweb/contracts";
import { countCodeWorkspaceFiles } from "@sqweb/contracts";
import { and, desc, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import {
  codeExecutions,
  codeWorkspaces,
  erdDiagrams,
  guiContainerAllocations,
  guiSessions,
  institutionMemberships,
  platformSchema,
  queryExecutions,
  savedQueries,
  sections,
  users,
  workspaces,
} from "./schema";

type Database = MySql2Database<typeof platformSchema>;

export interface ActivityResetSummary {
  sqlExecutionsCleared: number;
  codeExecutionsCleared: number;
  guiSessionsCleared: number;
}

export interface UserUsageSummary {
  workspaceState: string | null;
  erdDiagramCount: number;
  codeFileCount: number;
  savedQueryCount: number;
  sqlExecutionCount: number;
  codeExecutionCount: number;
  guiSessionCount: number;
  lastActiveAt: string | null;
}

// A raw SQL MAX(...) aggregate is typed `Date | null` for convenience, but
// mysql2 actually returns it as a string, not a Date instance (only plain
// column selects come back pre-parsed via Drizzle's timestamp mode) —
// coerce everything through `new Date(...)` rather than trusting the type.
export function toDateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  return new Date(value as string);
}

// Same mysql2-vs-Drizzle-type mismatch as above, applied to a raw
// `DATE(...)` GROUP BY key: it's typed `string` but can come back as either
// a "YYYY-MM-DD" string or a Date instance — normalize to the string form
// so it reliably matches the calendar-date keys built in application code.
function toDateKey(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

const USAGE_WINDOW_DAYS = 14;

function lastNDates(days: number): string[] {
  const dates: string[] = [];
  const today = new Date();
  for (let offset = days - 1; offset >= 0; offset--) {
    const date = new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() - offset,
      ),
    );
    dates.push(date.toISOString().slice(0, 10));
  }
  return dates;
}

// Only ever called for a single user (an admin viewing one detail panel),
// never list-wide — a handful of lightweight per-owner queries is fine here.
export class MySqlUsageReader {
  constructor(private readonly database: Database) {}

  async getUsageForOwner(ownerId: string): Promise<UserUsageSummary> {
    const [
      [workspaceRow],
      [erdRow],
      [codeWorkspaceRow],
      [savedQueryRow],
      [sqlExecRow],
      [codeExecRow],
      [guiSessionRow],
    ] = await Promise.all([
      this.database
        .select({ state: workspaces.state, updatedAt: workspaces.updatedAt })
        .from(workspaces)
        .where(eq(workspaces.ownerId, ownerId))
        .orderBy(desc(workspaces.updatedAt))
        .limit(1),
      this.database
        .select({
          count: sql<number>`COUNT(*)`,
          lastUpdated: sql<Date | null>`MAX(${erdDiagrams.updatedAt})`,
        })
        .from(erdDiagrams)
        .where(eq(erdDiagrams.ownerId, ownerId)),
      this.database
        .select({
          content: codeWorkspaces.content,
          updatedAt: codeWorkspaces.updatedAt,
        })
        .from(codeWorkspaces)
        .where(eq(codeWorkspaces.ownerId, ownerId)),
      this.database
        .select({
          count: sql<number>`COUNT(*)`,
          lastUpdated: sql<Date | null>`MAX(${savedQueries.updatedAt})`,
        })
        .from(savedQueries)
        .where(eq(savedQueries.ownerId, ownerId)),
      this.database
        .select({
          count: sql<number>`COUNT(*)`,
          lastStarted: sql<Date | null>`MAX(${queryExecutions.startedAt})`,
        })
        .from(queryExecutions)
        .where(eq(queryExecutions.actorId, ownerId)),
      this.database
        .select({
          count: sql<number>`COUNT(*)`,
          lastStarted: sql<Date | null>`MAX(${codeExecutions.startedAt})`,
        })
        .from(codeExecutions)
        .where(eq(codeExecutions.actorId, ownerId)),
      this.database
        .select({
          count: sql<number>`COUNT(*)`,
          lastCreated: sql<Date | null>`MAX(${guiSessions.createdAt})`,
        })
        .from(guiSessions)
        .where(eq(guiSessions.ownerId, ownerId)),
    ]);

    const candidateTimestamps = [
      workspaceRow?.updatedAt,
      erdRow?.lastUpdated,
      codeWorkspaceRow?.updatedAt,
      savedQueryRow?.lastUpdated,
      sqlExecRow?.lastStarted,
      codeExecRow?.lastStarted,
      guiSessionRow?.lastCreated,
    ]
      .map(toDateOrNull)
      .filter((value): value is Date => value !== null);
    const lastActiveAt = candidateTimestamps.length
      ? new Date(
          Math.max(...candidateTimestamps.map((date) => date.getTime())),
        ).toISOString()
      : null;

    return {
      workspaceState: workspaceRow?.state ?? null,
      erdDiagramCount: Number(erdRow?.count ?? 0),
      codeFileCount: codeWorkspaceRow
        ? countCodeWorkspaceFiles(
            (codeWorkspaceRow.content as CodeWorkspaceContent).root,
          )
        : 0,
      savedQueryCount: Number(savedQueryRow?.count ?? 0),
      sqlExecutionCount: Number(sqlExecRow?.count ?? 0),
      codeExecutionCount: Number(codeExecRow?.count ?? 0),
      guiSessionCount: Number(guiSessionRow?.count ?? 0),
      lastActiveAt,
    };
  }

  // Institution-wide, per-workspace-kind totals + a daily trend for the
  // admin dashboard — distinct from `getUsageForOwner` above, which is
  // scoped to a single user's detail panel.
  async getWorkspaceUsageStats(
    institutionId: string,
  ): Promise<WorkspaceUsageStat[]> {
    const since = new Date();
    since.setUTCDate(since.getUTCDate() - (USAGE_WINDOW_DAYS - 1));
    since.setUTCHours(0, 0, 0, 0);

    const [
      sqlTotal,
      sqlDaily,
      codeTotal,
      codeDaily,
      erdTotal,
      erdDaily,
      savedTotal,
      savedDaily,
      guiTotal,
      guiDaily,
    ] = await Promise.all([
      this.database
        .select({ count: sql<number>`COUNT(*)` })
        .from(queryExecutions)
        .where(eq(queryExecutions.institutionId, institutionId)),
      this.database
        .select({
          day: sql`DATE(${queryExecutions.startedAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(queryExecutions)
        .where(
          and(
            eq(queryExecutions.institutionId, institutionId),
            gte(queryExecutions.startedAt, since),
          ),
        )
        .groupBy(sql`DATE(${queryExecutions.startedAt})`),
      this.database
        .select({ count: sql<number>`COUNT(*)` })
        .from(codeExecutions)
        .where(eq(codeExecutions.institutionId, institutionId)),
      this.database
        .select({
          day: sql`DATE(${codeExecutions.startedAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(codeExecutions)
        .where(
          and(
            eq(codeExecutions.institutionId, institutionId),
            gte(codeExecutions.startedAt, since),
          ),
        )
        .groupBy(sql`DATE(${codeExecutions.startedAt})`),
      this.database
        .select({ count: sql<number>`COUNT(*)` })
        .from(erdDiagrams)
        .where(eq(erdDiagrams.institutionId, institutionId)),
      this.database
        .select({
          day: sql`DATE(${erdDiagrams.updatedAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(erdDiagrams)
        .where(
          and(
            eq(erdDiagrams.institutionId, institutionId),
            gte(erdDiagrams.updatedAt, since),
          ),
        )
        .groupBy(sql`DATE(${erdDiagrams.updatedAt})`),
      this.database
        .select({ count: sql<number>`COUNT(*)` })
        .from(savedQueries)
        .where(eq(savedQueries.institutionId, institutionId)),
      this.database
        .select({
          day: sql`DATE(${savedQueries.createdAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(savedQueries)
        .where(
          and(
            eq(savedQueries.institutionId, institutionId),
            gte(savedQueries.createdAt, since),
          ),
        )
        .groupBy(sql`DATE(${savedQueries.createdAt})`),
      this.database
        .select({ count: sql<number>`COUNT(*)` })
        .from(guiSessions)
        .where(eq(guiSessions.institutionId, institutionId)),
      this.database
        .select({
          day: sql`DATE(${guiSessions.createdAt})`,
          count: sql<number>`COUNT(*)`,
        })
        .from(guiSessions)
        .where(
          and(
            eq(guiSessions.institutionId, institutionId),
            gte(guiSessions.createdAt, since),
          ),
        )
        .groupBy(sql`DATE(${guiSessions.createdAt})`),
    ]);

    const dateRange = lastNDates(USAGE_WINDOW_DAYS);
    const toDailyCounts = (rows: readonly { day: unknown; count: number }[]) => {
      const byDay = new Map(
        rows.map((row) => [toDateKey(row.day), Number(row.count)]),
      );
      return dateRange.map((date) => ({ date, count: byDay.get(date) ?? 0 }));
    };

    return [
      {
        workspace: "sql-workbench",
        totalCount: Number(sqlTotal[0]?.count ?? 0),
        dailyCounts: toDailyCounts(sqlDaily),
      },
      {
        workspace: "code-compiler",
        totalCount: Number(codeTotal[0]?.count ?? 0),
        dailyCounts: toDailyCounts(codeDaily),
      },
      {
        workspace: "erd-editor",
        totalCount: Number(erdTotal[0]?.count ?? 0),
        dailyCounts: toDailyCounts(erdDaily),
      },
      {
        workspace: "saved-queries",
        totalCount: Number(savedTotal[0]?.count ?? 0),
        dailyCounts: toDailyCounts(savedDaily),
      },
      {
        workspace: "java-gui-workspace",
        totalCount: Number(guiTotal[0]?.count ?? 0),
        dailyCounts: toDailyCounts(guiDaily),
      },
    ];
  }

  // A leaderboard of active students ranked by total activity across every
  // workspace kind ("contribution"), with a separate tally of the subset
  // that actually succeeded (a passing SQL run, an accepted code run, a GUI
  // session that made it to running/stopped) — five parallel per-owner
  // GROUP BYs merged in application code, the same shape as
  // `getWorkspaceUsageStats` above, rather than one large multi-join query.
  async getTopContributors(
    institutionId: string,
    limit: number,
  ): Promise<TopContributorRecord[]> {
    const [students, sqlStats, codeStats, erdCounts, savedCounts, guiStats] =
      await Promise.all([
        this.database
          .select({
            id: users.id,
            displayName: users.displayName,
            sectionName: sections.name,
          })
          .from(users)
          .innerJoin(
            institutionMemberships,
            and(
              eq(institutionMemberships.userId, users.id),
              eq(institutionMemberships.institutionId, institutionId),
              eq(institutionMemberships.role, "student"),
            ),
          )
          .leftJoin(sections, eq(sections.id, users.sectionId))
          .where(eq(users.status, "active")),
        this.database
          .select({
            actorId: queryExecutions.actorId,
            total: sql<number>`COUNT(*)`,
            successful: sql<number>`SUM(${queryExecutions.state} = 'successful')`,
          })
          .from(queryExecutions)
          .where(eq(queryExecutions.institutionId, institutionId))
          .groupBy(queryExecutions.actorId),
        this.database
          .select({
            actorId: codeExecutions.actorId,
            total: sql<number>`COUNT(*)`,
            successful: sql<number>`SUM(${codeExecutions.status} = 'accepted')`,
          })
          .from(codeExecutions)
          .where(eq(codeExecutions.institutionId, institutionId))
          .groupBy(codeExecutions.actorId),
        this.database
          .select({
            ownerId: erdDiagrams.ownerId,
            total: sql<number>`COUNT(*)`,
          })
          .from(erdDiagrams)
          .where(eq(erdDiagrams.institutionId, institutionId))
          .groupBy(erdDiagrams.ownerId),
        this.database
          .select({
            ownerId: savedQueries.ownerId,
            total: sql<number>`COUNT(*)`,
          })
          .from(savedQueries)
          .where(eq(savedQueries.institutionId, institutionId))
          .groupBy(savedQueries.ownerId),
        this.database
          .select({
            ownerId: guiSessions.ownerId,
            total: sql<number>`COUNT(*)`,
            successful: sql<number>`SUM(${guiSessions.state} IN ('running', 'stopped'))`,
          })
          .from(guiSessions)
          .where(eq(guiSessions.institutionId, institutionId))
          .groupBy(guiSessions.ownerId),
      ]);

    const sqlByActor = new Map(sqlStats.map((row) => [row.actorId, row]));
    const codeByActor = new Map(codeStats.map((row) => [row.actorId, row]));
    const erdByOwner = new Map(
      erdCounts.map((row) => [row.ownerId, Number(row.total)]),
    );
    const savedByOwner = new Map(
      savedCounts.map((row) => [row.ownerId, Number(row.total)]),
    );
    const guiByOwner = new Map(guiStats.map((row) => [row.ownerId, row]));

    return students
      .map((student) => {
        const sqlRow = sqlByActor.get(student.id);
        const codeRow = codeByActor.get(student.id);
        const guiRow = guiByOwner.get(student.id);
        const sqlExecutionCount = Number(sqlRow?.total ?? 0);
        const codeExecutionCount = Number(codeRow?.total ?? 0);
        const erdDiagramCount = erdByOwner.get(student.id) ?? 0;
        const savedQueryCount = savedByOwner.get(student.id) ?? 0;
        const guiSessionCount = Number(guiRow?.total ?? 0);
        return {
          id: student.id,
          displayName: student.displayName,
          sectionName: student.sectionName,
          contributionScore:
            sqlExecutionCount +
            codeExecutionCount +
            erdDiagramCount +
            savedQueryCount +
            guiSessionCount,
          successfulWorkCount:
            Number(sqlRow?.successful ?? 0) +
            Number(codeRow?.successful ?? 0) +
            Number(guiRow?.successful ?? 0),
          sqlExecutionCount,
          codeExecutionCount,
          erdDiagramCount,
          savedQueryCount,
          guiSessionCount,
        };
      })
      .sort((a, b) => {
        if (b.contributionScore !== a.contributionScore)
          return b.contributionScore - a.contributionScore;
        if (b.successfulWorkCount !== a.successfulWorkCount)
          return b.successfulWorkCount - a.successfulWorkCount;
        return a.displayName.localeCompare(b.displayName);
      })
      .slice(0, limit)
      .map((entry, index) => ({ ...entry, rank: index + 1 }));
  }

  // Clears the execution/session *history* that feeds the dashboard and
  // leaderboard numbers above — never the content those numbers are
  // partly derived from (ERD diagrams, saved queries, workspace files),
  // and never anything still in flight:
  //   - a SQL/code run still queued/running/being judged is left alone
  //   - a GUI session still requested/provisioning/running is left alone,
  //     and even a stopped/failed/expired one is skipped if its container
  //     allocation hasn't finished cleanup yet — that row is the
  //     provisioning worker's only record of a container it still needs
  //     to tear down, so deleting it early would leak the container.
  async resetActivityHistory(
    institutionId: string,
  ): Promise<ActivityResetSummary> {
    return this.database.transaction(async (transaction) => {
      const sqlRows = await transaction
        .select({ id: queryExecutions.id })
        .from(queryExecutions)
        .where(
          and(
            eq(queryExecutions.institutionId, institutionId),
            inArray(queryExecutions.state, [
              "successful",
              "failed",
              "timed_out",
              "cancelled",
              "limit_exceeded",
            ]),
          ),
        );
      if (sqlRows.length > 0) {
        await transaction
          .delete(queryExecutions)
          .where(
            inArray(
              queryExecutions.id,
              sqlRows.map((row) => row.id),
            ),
          );
      }

      const codeRows = await transaction
        .select({ id: codeExecutions.id })
        .from(codeExecutions)
        .where(
          and(
            eq(codeExecutions.institutionId, institutionId),
            ne(codeExecutions.status, "processing"),
          ),
        );
      if (codeRows.length > 0) {
        await transaction
          .delete(codeExecutions)
          .where(
            inArray(
              codeExecutions.id,
              codeRows.map((row) => row.id),
            ),
          );
      }

      const guiRows = await transaction
        .select({ id: guiSessions.id })
        .from(guiSessions)
        .leftJoin(
          guiContainerAllocations,
          eq(guiContainerAllocations.sessionId, guiSessions.id),
        )
        .where(
          and(
            eq(guiSessions.institutionId, institutionId),
            inArray(guiSessions.state, ["stopped", "failed", "expired"]),
            or(
              isNull(guiContainerAllocations.id),
              eq(guiContainerAllocations.cleanupState, "complete"),
            ),
          ),
        );
      const guiSessionIds = guiRows.map((row) => row.id);
      if (guiSessionIds.length > 0) {
        await transaction
          .delete(guiContainerAllocations)
          .where(inArray(guiContainerAllocations.sessionId, guiSessionIds));
        await transaction
          .delete(guiSessions)
          .where(inArray(guiSessions.id, guiSessionIds));
      }

      return {
        sqlExecutionsCleared: sqlRows.length,
        codeExecutionsCleared: codeRows.length,
        guiSessionsCleared: guiSessionIds.length,
      };
    });
  }
}
