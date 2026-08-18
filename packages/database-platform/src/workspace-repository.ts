import { randomUUID } from "node:crypto";

import type { WorkspaceRepository } from "@sqweb/workspace";
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";

import { platformSchema, workspaceResets, workspaces } from "./schema";

type Database = MySql2Database<typeof platformSchema>;

function summary(row: typeof workspaces.$inferSelect) {
  return {
    id: row.id,
    ownerId: row.ownerId,
    scope: row.scopeType,
    scopeId: row.scopeId,
    state: row.state,
    quotaBytes: row.quotaBytes,
    templateVersionId: row.templateVersionId,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    failureCode: row.failureCode,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export class MySqlWorkspaceRepository implements WorkspaceRepository {
  constructor(private readonly database: Database) {}

  async findByIdempotencyKey(
    institutionId: string,
    actorId: string,
    key: string,
  ) {
    const rows = await this.database
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.institutionId, institutionId),
          eq(workspaces.ownerId, actorId),
          eq(workspaces.idempotencyKey, key),
        ),
      );
    return rows[0] ? summary(rows[0]) : null;
  }

  async findScoped(workspaceId: string, institutionId: string) {
    const rows = await this.database
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.id, workspaceId),
          eq(workspaces.institutionId, institutionId),
        ),
      );
    return rows[0] ? summary(rows[0]) : null;
  }

  async findOwnedScope(
    ownerId: string,
    scope: "personal" | "class",
    scopeId: string,
  ) {
    const rows = await this.database
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.ownerId, ownerId),
          eq(workspaces.scopeType, scope),
          eq(workspaces.scopeId, scopeId),
        ),
      );
    return rows[0] ? summary(rows[0]) : null;
  }

  async findResetByIdempotencyKey(workspaceId: string, key: string) {
    const rows = await this.database
      .select({ workspace: workspaces })
      .from(workspaceResets)
      .innerJoin(workspaces, eq(workspaceResets.workspaceId, workspaces.id))
      .where(
        and(
          eq(workspaceResets.workspaceId, workspaceId),
          eq(workspaceResets.idempotencyKey, key),
        ),
      );
    return rows[0] ? summary(rows[0].workspace) : null;
  }

  async listOwned(ownerId: string) {
    const rows = await this.database
      .select()
      .from(workspaces)
      .where(eq(workspaces.ownerId, ownerId));
    return rows.map(summary);
  }

  async createRequested(
    input: Parameters<WorkspaceRepository["createRequested"]>[0],
  ) {
    const id = randomUUID();
    await this.database.insert(workspaces).values({
      id,
      institutionId: input.actor.institutionId,
      ownerId: input.actor.id,
      scopeType: input.request.scope,
      scopeId: input.request.scopeId ?? input.actor.id,
      templateVersionId: input.request.templateVersionId ?? null,
      quotaBytes: input.quotaBytes,
      idempotencyKey: input.idempotencyKey,
    });
    const created = await this.findScoped(id, input.actor.institutionId);
    if (!created) throw new Error("Workspace request could not be reloaded.");
    return created;
  }

  async requestReset(
    input: Parameters<WorkspaceRepository["requestReset"]>[0],
  ) {
    await this.database.transaction(async (transaction) => {
      await transaction
        .insert(workspaceResets)
        .values({
          id: randomUUID(),
          workspaceId: input.workspace.id,
          actorId: input.actor.id,
          reason: input.reason,
          idempotencyKey: input.idempotencyKey,
        })
        .onDuplicateKeyUpdate({
          set: { idempotencyKey: input.idempotencyKey },
        });
      await transaction
        .update(workspaces)
        .set({ state: "resetting" })
        .where(eq(workspaces.id, input.workspace.id));
    });
    const changed = await this.findScoped(
      input.workspace.id,
      input.actor.institutionId,
    );
    if (!changed) throw new Error("Workspace reset could not be reloaded.");
    return changed;
  }
}
