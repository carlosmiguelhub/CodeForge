import { randomUUID } from "node:crypto";

import type { JavaGuiWorkspaceContent } from "@sqweb/contracts";
import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { javaGuiWorkspaces, platformSchema } from "./schema";

type Database = MySql2Database<typeof platformSchema>;

function toWorkspace(row: typeof javaGuiWorkspaces.$inferSelect) {
  return {
    ownerId: row.ownerId,
    content: row.content as JavaGuiWorkspaceContent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class MySqlJavaGuiWorkspaceRepository {
  constructor(private readonly database: Database) {}

  async findByOwner(ownerId: string) {
    const rows = await this.database
      .select()
      .from(javaGuiWorkspaces)
      .where(eq(javaGuiWorkspaces.ownerId, ownerId));
    return rows[0] ? toWorkspace(rows[0]) : null;
  }

  async getOrCreate(
    institutionId: string,
    ownerId: string,
    blankContent: JavaGuiWorkspaceContent,
  ) {
    const existing = await this.findByOwner(ownerId);
    if (existing) return existing;
    await this.database
      .insert(javaGuiWorkspaces)
      .values({
        id: randomUUID(),
        institutionId,
        ownerId,
        content: blankContent,
      })
      // Two concurrent first-loads could both miss the row above; the
      // owner_id unique key makes the second insert a harmless no-op
      // update instead of an error.
      .onDuplicateKeyUpdate({ set: { ownerId } });
    const created = await this.findByOwner(ownerId);
    if (!created) throw new Error("Java GUI workspace could not be reloaded.");
    return created;
  }

  async save(
    institutionId: string,
    ownerId: string,
    content: JavaGuiWorkspaceContent,
  ) {
    await this.database
      .insert(javaGuiWorkspaces)
      .values({ id: randomUUID(), institutionId, ownerId, content })
      .onDuplicateKeyUpdate({ set: { content } });
    const saved = await this.findByOwner(ownerId);
    if (!saved) throw new Error("Java GUI workspace could not be reloaded.");
    return saved;
  }
}
