import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  WorkspaceRequest,
  WorkspaceResetRequest,
  WorkspaceSummary,
} from "@sqweb/contracts";

import type { WorkspaceServiceDependencies } from "./types";

const defaultQuotaBytes = 100 * 1024 * 1024;

export class WorkspaceService {
  constructor(private readonly dependencies: WorkspaceServiceDependencies) {}

  private validateKey(key: string | undefined): string {
    if (!key || key.length < 16 || key.length > 128) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "A valid Idempotency-Key is required.",
        400,
      );
    }
    return key;
  }

  async listMine(identity: VerifiedIdentity) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    return this.dependencies.workspaces.listOwned(actor.id);
  }

  async requestWorkspace(
    identity: VerifiedIdentity,
    request: WorkspaceRequest,
    keyValue: string | undefined,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const idempotencyKey = this.validateKey(keyValue);
    if (request.scope === "class") {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "Class-scoped workspaces require an activity assignment and are not available yet.",
        409,
      );
    }
    if (request.templateVersionId) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "Template versions must be selected through an authorized activity assignment.",
        409,
      );
    }
    const existing = await this.dependencies.workspaces.findByIdempotencyKey(
      actor.institutionId,
      actor.id,
      idempotencyKey,
    );
    if (existing) return existing;
    const scoped = await this.dependencies.workspaces.findOwnedScope(
      actor.id,
      request.scope,
      actor.id,
    );
    if (scoped) return scoped;
    const workspace = await this.dependencies.workspaces.createRequested({
      actor,
      request: { ...request, scopeId: actor.id },
      idempotencyKey,
      quotaBytes: defaultQuotaBytes,
    });
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "workspace.requested",
      targetId: workspace.id,
      result: "succeeded",
    });
    return workspace;
  }

  async getWorkspace(
    identity: VerifiedIdentity,
    workspaceId: string,
  ): Promise<WorkspaceSummary> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher", "administrator"],
    );
    const workspace = await this.dependencies.workspaces.findScoped(
      workspaceId,
      actor.institutionId,
    );
    if (!workspace)
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Workspace not found.",
        404,
      );
    if (
      !actor.roles.includes("administrator") &&
      workspace.ownerId !== actor.id
    ) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Workspace not found.",
        404,
      );
    }
    return workspace;
  }

  async requestReset(
    identity: VerifiedIdentity,
    workspaceId: string,
    request: WorkspaceResetRequest,
    keyValue: string | undefined,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    const idempotencyKey = this.validateKey(keyValue);
    const workspace = await this.getWorkspace(identity, workspaceId);
    const existing =
      await this.dependencies.workspaces.findResetByIdempotencyKey(
        workspace.id,
        idempotencyKey,
      );
    if (existing) return existing;
    if (
      workspace.ownerId !== actor.id ||
      !["ready", "failed"].includes(workspace.state)
    ) {
      throw new AuthorizationError(
        "PERMISSION_DENIED",
        "Workspace reset is not currently permitted.",
        403,
      );
    }
    const resetting = await this.dependencies.workspaces.requestReset({
      workspace,
      actor,
      idempotencyKey,
      reason: request.reason,
    });
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "workspace.reset",
      targetId: workspace.id,
      result: "succeeded",
      reason: request.reason,
    });
    return resetting;
  }
}
