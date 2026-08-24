import { randomUUID } from "node:crypto";

import type { AuditEventListQuery, AuditReader, AuditSink } from "@sqweb/auth";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { auditEvents, platformSchema, users } from "./schema";

export class MySqlAuditSink implements AuditSink, AuditReader {
  constructor(
    private readonly database: MySql2Database<typeof platformSchema>,
    private readonly institutionId: string,
  ) {}

  async record(event: Parameters<AuditSink["record"]>[0]): Promise<void> {
    await this.database.insert(auditEvents).values({
      id: randomUUID(),
      institutionId: this.institutionId,
      actorId: event.actorId,
      action: event.action,
      targetId: event.targetId,
      result: event.result,
      ...(event.reason ? { reason: event.reason } : {}),
    });
  }

  async listEvents(query: AuditEventListQuery) {
    const filters = [eq(auditEvents.institutionId, this.institutionId)];
    if (query.action) filters.push(eq(auditEvents.action, query.action));
    if (query.actorId) filters.push(eq(auditEvents.actorId, query.actorId));
    if (query.targetId) filters.push(eq(auditEvents.targetId, query.targetId));
    if (query.from) filters.push(gte(auditEvents.occurredAt, new Date(query.from)));
    if (query.to) filters.push(lte(auditEvents.occurredAt, new Date(query.to)));
    const where = and(...filters);

    const [rows, [totalRow]] = await Promise.all([
      this.database
        .select({ event: auditEvents, actorDisplayName: users.displayName })
        .from(auditEvents)
        .leftJoin(users, eq(users.id, auditEvents.actorId))
        .where(where)
        .orderBy(desc(auditEvents.occurredAt))
        .limit(query.pageSize)
        .offset((query.page - 1) * query.pageSize),
      this.database
        .select({ count: sql<number>`COUNT(*)` })
        .from(auditEvents)
        .where(where),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.event.id,
        actorId: row.event.actorId,
        actorDisplayName: row.actorDisplayName ?? null,
        action: row.event.action,
        targetId: row.event.targetId,
        result: row.event.result,
        reason: row.event.reason,
        occurredAt: row.event.occurredAt.toISOString(),
      })),
      total: Number(totalRow?.count ?? 0),
    };
  }
}
