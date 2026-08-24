import { randomUUID } from "node:crypto";

import type { WorkspaceKind } from "@sqweb/contracts";
import { workspaceKindSchema } from "@sqweb/contracts";
import { and, eq, isNull, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { platformSchema, sections, users } from "./schema";

type Database = MySql2Database<typeof platformSchema>;

function toSection(row: typeof sections.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    lockedWorkspaces: workspaceKindSchema
      .array()
      .catch([])
      .parse(row.lockedWorkspaces ?? []),
  };
}

export class MySqlSectionRepository {
  constructor(private readonly database: Database) {}

  async listActive(institutionId: string) {
    const rows = await this.database
      .select()
      .from(sections)
      .where(
        and(
          eq(sections.institutionId, institutionId),
          isNull(sections.archivedAt),
        ),
      );
    return rows.map(toSection);
  }

  async listAll(institutionId: string) {
    const rows = await this.database
      .select({ section: sections, memberCount: sql<number>`COUNT(${users.id})` })
      .from(sections)
      .leftJoin(users, eq(users.sectionId, sections.id))
      .where(eq(sections.institutionId, institutionId))
      .groupBy(sections.id);
    return rows.map((row) => ({
      ...toSection(row.section),
      memberCount: Number(row.memberCount),
    }));
  }

  async create(input: { institutionId: string; name: string }) {
    const id = randomUUID();
    await this.database.insert(sections).values({
      id,
      institutionId: input.institutionId,
      name: input.name,
    });
    const [created] = await this.database
      .select()
      .from(sections)
      .where(eq(sections.id, id));
    if (!created) throw new Error("Section could not be reloaded.");
    return toSection(created);
  }

  async countAssignedAccounts(id: string) {
    const [row] = await this.database
      .select({ count: sql<number>`COUNT(*)` })
      .from(users)
      .where(eq(users.sectionId, id));
    return Number(row?.count ?? 0);
  }

  async archive(id: string, institutionId: string) {
    await this.database
      .update(sections)
      .set({ archivedAt: new Date() })
      .where(and(eq(sections.id, id), eq(sections.institutionId, institutionId)));
  }

  async restore(id: string, institutionId: string) {
    await this.database
      .update(sections)
      .set({ archivedAt: null })
      .where(and(eq(sections.id, id), eq(sections.institutionId, institutionId)));
  }

  async setLockedWorkspaces(
    id: string,
    institutionId: string,
    lockedWorkspaces: readonly WorkspaceKind[],
  ) {
    await this.database
      .update(sections)
      .set({ lockedWorkspaces: [...lockedWorkspaces] })
      .where(and(eq(sections.id, id), eq(sections.institutionId, institutionId)));
    const [updated] = await this.database
      .select()
      .from(sections)
      .where(eq(sections.id, id));
    if (!updated) throw new Error("Section could not be reloaded.");
    return toSection(updated);
  }

  async findById(id: string, institutionId: string) {
    const [row] = await this.database
      .select()
      .from(sections)
      .where(and(eq(sections.id, id), eq(sections.institutionId, institutionId)));
    return row ? toSection(row) : null;
  }
}
