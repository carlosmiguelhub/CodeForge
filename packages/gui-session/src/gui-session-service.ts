import { randomUUID } from "node:crypto";

import { AuthorizationError, type VerifiedIdentity } from "@sqweb/auth";
import type { GuiSession, GuiSessionCreateRequest } from "@sqweb/contracts";

import type { GuiSessionServiceDependencies } from "./service-types";

function resolveMainClassName(
  content: GuiSessionCreateRequest["content"],
): string {
  if (!content.mainFileId)
    throw new AuthorizationError(
      "VALIDATION_FAILED",
      "Mark one file as the main class before running.",
      400,
    );
  const mainFile = content.files.find(
    (file) => file.id === content.mainFileId,
  );
  if (!mainFile)
    throw new AuthorizationError(
      "VALIDATION_FAILED",
      "The main file no longer exists in this workspace.",
      400,
    );
  return mainFile.name.replace(/\.java$/, "");
}

export class GuiSessionService {
  constructor(private readonly dependencies: GuiSessionServiceDependencies) {}

  async createSession(
    identity: VerifiedIdentity,
    request: GuiSessionCreateRequest,
  ): Promise<GuiSession> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    await this.dependencies.sections.assertWorkspaceUnlocked(
      identity,
      "java-gui-workspace",
    );

    const mainClassName = resolveMainClassName(request.content);

    // Saved before the session row is created, so the provisioning
    // worker's later claim (which re-reads the *current* saved content —
    // see MySqlGuiSessionProvisioningRepository) sees exactly what the
    // student clicked Run on.
    await this.dependencies.workspaces.save(
      actor.institutionId,
      actor.id,
      request.content,
    );

    const sessionId = randomUUID();
    await this.dependencies.sessions.create({
      id: sessionId,
      institutionId: actor.institutionId,
      ownerId: actor.id,
      mainClassName,
      maxRuntimeSeconds: this.dependencies.maxRuntimeSeconds,
    });

    const { token } = this.dependencies.grantSigner.issueGuiSession(
      actor,
      sessionId,
      this.dependencies.grantLifetimeSeconds,
    );

    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "gui_session.requested",
      targetId: sessionId,
      result: "succeeded",
    });

    return {
      id: sessionId,
      state: "requested",
      mainClassName,
      maxRuntimeSeconds: this.dependencies.maxRuntimeSeconds,
      failureCode: null,
      grant: token,
      startedAt: null,
      endsAt: null,
      createdAt: new Date().toISOString(),
    };
  }

  async getSession(
    identity: VerifiedIdentity,
    sessionId: string,
  ): Promise<GuiSession> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher", "administrator"],
    );
    const record = await this.requireOwnedSession(sessionId, actor.id, actor.roles);
    return {
      id: record.id,
      state: record.state,
      mainClassName: record.mainClassName,
      maxRuntimeSeconds: record.maxRuntimeSeconds,
      failureCode: record.failureCode,
      grant: null,
      startedAt: record.startedAt,
      endsAt: record.endsAt,
      createdAt: record.createdAt,
    };
  }

  async stopSession(
    identity: VerifiedIdentity,
    sessionId: string,
  ): Promise<void> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher", "administrator"],
    );
    await this.requireOwnedSession(sessionId, actor.id, actor.roles);
    await this.dependencies.sessions.markStopped(sessionId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "gui_session.stopped",
      targetId: sessionId,
      result: "succeeded",
    });
  }

  private async requireOwnedSession(
    sessionId: string,
    actorId: string,
    actorRoles: readonly string[],
  ) {
    const record = await this.dependencies.sessions.get(sessionId);
    if (!record)
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Session not found.",
        404,
      );
    if (!actorRoles.includes("administrator") && record.ownerId !== actorId)
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Session not found.",
        404,
      );
    return record;
  }
}
