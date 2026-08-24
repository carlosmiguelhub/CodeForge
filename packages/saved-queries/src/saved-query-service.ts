import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  SavedQueryCreateRequest,
  SavedQueryUpdateRequest,
} from "@sqweb/contracts";

import type { SavedQueryServiceDependencies } from "./types";

export class SavedQueryService {
  constructor(private readonly dependencies: SavedQueryServiceDependencies) {}

  private async requireOwned(identity: VerifiedIdentity, id: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const query = await this.dependencies.queries.findOwned(id, actor.id);
    if (!query)
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Saved query not found.",
        404,
      );
    return { actor, query };
  }

  async listMine(identity: VerifiedIdentity, workspaceId: string) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    return this.dependencies.queries.listOwned(actor.id, workspaceId);
  }

  async createQuery(
    identity: VerifiedIdentity,
    request: SavedQueryCreateRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    await this.dependencies.verifyWorkspaceOwnership(
      identity,
      request.workspaceId,
    );
    const query = await this.dependencies.queries.create({
      institutionId: actor.institutionId,
      ownerId: actor.id,
      workspaceId: request.workspaceId,
      name: request.name,
      sql: request.sql,
    });
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "saved_query.created",
      targetId: query.id,
      result: "succeeded",
    });
    return query;
  }

  async updateQuery(
    identity: VerifiedIdentity,
    id: string,
    request: SavedQueryUpdateRequest,
  ) {
    const { actor } = await this.requireOwned(identity, id);
    return this.dependencies.queries.update(id, actor.id, {
      ...(request.name !== undefined ? { name: request.name } : {}),
      ...(request.sql !== undefined ? { sql: request.sql } : {}),
    });
  }

  async deleteQuery(identity: VerifiedIdentity, id: string) {
    const { actor } = await this.requireOwned(identity, id);
    await this.dependencies.queries.remove(id, actor.id);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "saved_query.deleted",
      targetId: id,
      result: "succeeded",
    });
  }
}
