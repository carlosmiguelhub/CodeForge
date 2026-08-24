import { randomUUID } from "node:crypto";

import type { ErdDiagramContent } from "@sqweb/contracts";
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { erdDiagrams, platformSchema } from "./schema";

type Database = MySql2Database<typeof platformSchema>;

function summary(row: typeof erdDiagrams.$inferSelect) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function full(row: typeof erdDiagrams.$inferSelect) {
  return { ...summary(row), content: row.content as ErdDiagramContent };
}

export class MySqlErdDiagramRepository {
  constructor(private readonly database: Database) {}

  async listOwned(ownerId: string) {
    const rows = await this.database
      .select()
      .from(erdDiagrams)
      .where(eq(erdDiagrams.ownerId, ownerId));
    return rows.map(summary);
  }

  async findOwned(id: string, ownerId: string) {
    const rows = await this.database
      .select()
      .from(erdDiagrams)
      .where(and(eq(erdDiagrams.id, id), eq(erdDiagrams.ownerId, ownerId)));
    return rows[0] ? full(rows[0]) : null;
  }

  async create(input: {
    institutionId: string;
    ownerId: string;
    name: string;
    content: ErdDiagramContent;
  }) {
    const id = randomUUID();
    await this.database.insert(erdDiagrams).values({
      id,
      institutionId: input.institutionId,
      ownerId: input.ownerId,
      name: input.name,
      content: input.content,
    });
    const created = await this.findOwned(id, input.ownerId);
    if (!created) throw new Error("ERD diagram could not be reloaded.");
    return created;
  }

  async rename(id: string, ownerId: string, name: string) {
    await this.database
      .update(erdDiagrams)
      .set({ name })
      .where(and(eq(erdDiagrams.id, id), eq(erdDiagrams.ownerId, ownerId)));
    const renamed = await this.findOwned(id, ownerId);
    if (!renamed) throw new Error("ERD diagram could not be reloaded.");
    return renamed;
  }

  async saveContent(id: string, ownerId: string, content: ErdDiagramContent) {
    await this.database
      .update(erdDiagrams)
      .set({ content })
      .where(and(eq(erdDiagrams.id, id), eq(erdDiagrams.ownerId, ownerId)));
    const saved = await this.findOwned(id, ownerId);
    if (!saved) throw new Error("ERD diagram could not be reloaded.");
    return saved;
  }

  async remove(id: string, ownerId: string) {
    await this.database
      .delete(erdDiagrams)
      .where(and(eq(erdDiagrams.id, id), eq(erdDiagrams.ownerId, ownerId)));
  }
}
