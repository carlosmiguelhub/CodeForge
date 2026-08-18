import { randomUUID } from "node:crypto";

import type { AuditSink } from "@sqweb/auth";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { auditEvents, platformSchema } from "./schema";

export class MySqlAuditSink implements AuditSink {
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
}
