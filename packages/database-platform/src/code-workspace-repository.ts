import { randomUUID } from "node:crypto";

import type { CodeWorkspaceContent } from "@sqweb/contracts";
import { eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { codeWorkspaces, platformSchema } from "./schema";

type Database = MySql2Database<typeof platformSchema>;

function toWorkspace(row: typeof codeWorkspaces.$inferSelect) {
  return {
    ownerId: row.ownerId,
    content: row.content as CodeWorkspaceContent,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class MySqlCodeWorkspaceRepository {
  constructor(private readonly database: Database) {}

  async findByOwner(ownerId: string) {
    const rows = await this.database
      .select()
      .from(codeWorkspaces)
      .where(eq(codeWorkspaces.ownerId, ownerId));
    return rows[0] ? toWorkspace(rows[0]) : null;
  }

  async getOrCreate(
    institutionId: string,
    ownerId: string,
    blankContent: CodeWorkspaceContent,
  ) {
    const existing = await this.findByOwner(ownerId);
    if (existing) return existing;
    await this.database
      .insert(codeWorkspaces)
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
    if (!created) throw new Error("Code workspace could not be reloaded.");
    return created;
  }

  async save(
    institutionId: string,
    ownerId: string,
    content: CodeWorkspaceContent,
  ) {
    await this.database
      .insert(codeWorkspaces)
      .values({ id: randomUUID(), institutionId, ownerId, content })
      .onDuplicateKeyUpdate({ set: { content } });
    const saved = await this.findByOwner(ownerId);
    if (!saved) throw new Error("Code workspace could not be reloaded.");
    return saved;
  }
}
