import { randomUUID } from "node:crypto";

import type { WebWorkspaceContent } from "@sqweb/contracts";
import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { platformSchema, webWorkspaces } from "./schema";

type Database = MySql2Database<typeof platformSchema>;

function toWorkspace(row: typeof webWorkspaces.$inferSelect) {
  return {
    ownerId: row.ownerId,
    content: row.content as WebWorkspaceContent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class MySqlWebWorkspaceRepository {
  constructor(private readonly database: Database) {}

  async findByOwner(ownerId: string) {
    const rows = await this.database
      .select()
      .from(webWorkspaces)
      .where(eq(webWorkspaces.ownerId, ownerId));
    return rows[0] ? toWorkspace(rows[0]) : null;
  }

  async getOrCreate(
    institutionId: string,
    ownerId: string,
    blankContent: WebWorkspaceContent,
  ) {
    const existing = await this.findByOwner(ownerId);
    if (existing) return existing;
    await this.database
      .insert(webWorkspaces)
      .values({
        id: randomUUID(),
        institutionId,
        ownerId,
        content: blankContent,
      })
      .onDuplicateKeyUpdate({ set: { ownerId } });
    const created = await this.findByOwner(ownerId);
    if (!created) throw new Error("Web workspace could not be reloaded.");
    return created;
  }

  async save(
    institutionId: string,
    ownerId: string,
    content: WebWorkspaceContent,
  ) {
    await this.database
      .insert(webWorkspaces)
      .values({ id: randomUUID(), institutionId, ownerId, content })
      .onDuplicateKeyUpdate({ set: { content } });
    const saved = await this.findByOwner(ownerId);
    if (!saved) throw new Error("Web workspace could not be reloaded.");
    return saved;
  }
}
