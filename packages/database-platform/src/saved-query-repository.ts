import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { platformSchema, savedQueries } from "./schema";

type Database = MySql2Database<typeof platformSchema>;

function toSavedQuery(row: typeof savedQueries.$inferSelect) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    workspaceId: row.workspaceId,
    name: row.name,
    sql: row.sqlText,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class MySqlSavedQueryRepository {
  constructor(private readonly database: Database) {}

  async listOwned(ownerId: string, workspaceId: string) {
    const rows = await this.database
      .select()
      .from(savedQueries)
      .where(
        and(
          eq(savedQueries.ownerId, ownerId),
          eq(savedQueries.workspaceId, workspaceId),
        ),
      );
    return rows.map(toSavedQuery);
  }

  async findOwned(id: string, ownerId: string) {
    const rows = await this.database
      .select()
      .from(savedQueries)
      .where(and(eq(savedQueries.id, id), eq(savedQueries.ownerId, ownerId)));
    return rows[0] ? toSavedQuery(rows[0]) : null;
  }

  async create(input: {
    institutionId: string;
    ownerId: string;
    workspaceId: string;
    name: string;
    sql: string;
  }) {
    const id = randomUUID();
    await this.database.insert(savedQueries).values({
      id,
      institutionId: input.institutionId,
      ownerId: input.ownerId,
      workspaceId: input.workspaceId,
      name: input.name,
      sqlText: input.sql,
    });
    const created = await this.findOwned(id, input.ownerId);
    if (!created) throw new Error("Saved query could not be reloaded.");
    return created;
  }

  async update(
    id: string,
    ownerId: string,
    changes: { name?: string; sql?: string },
  ) {
    await this.database
      .update(savedQueries)
      .set({
        ...(changes.name !== undefined ? { name: changes.name } : {}),
        ...(changes.sql !== undefined ? { sqlText: changes.sql } : {}),
      })
      .where(and(eq(savedQueries.id, id), eq(savedQueries.ownerId, ownerId)));
    const updated = await this.findOwned(id, ownerId);
    if (!updated) throw new Error("Saved query could not be reloaded.");
    return updated;
  }

  async remove(id: string, ownerId: string) {
    await this.database
      .delete(savedQueries)
      .where(and(eq(savedQueries.id, id), eq(savedQueries.ownerId, ownerId)));
  }
}
