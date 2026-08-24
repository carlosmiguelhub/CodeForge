import { AuthorizationError, type VerifiedIdentity } from "@sqweb/auth";
import type { Section, WorkspaceAccess, WorkspaceKind } from "@sqweb/contracts";

import type { SectionServiceDependencies } from "./types";

export class SectionService {
  constructor(private readonly dependencies: SectionServiceDependencies) {}

  // No identity at all — called from the unauthenticated registration page,
  // before a Firebase account (let alone a platform account) exists.
  async listPublic(): Promise<readonly Section[]> {
    return this.dependencies.sections.listActive(
      this.dependencies.institutionId,
    );
  }

  async listAll(identity: VerifiedIdentity): Promise<readonly Section[]> {
    await this.dependencies.identity.requireActiveAccount(identity, [
      "administrator",
    ]);
    return this.dependencies.sections.listAll(this.dependencies.institutionId);
  }

  async createSection(
    identity: VerifiedIdentity,
    name: string,
  ): Promise<Section> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    const section = await this.dependencies.sections.create({
      institutionId: this.dependencies.institutionId,
      name,
    });
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "section.created",
      targetId: section.id,
      result: "succeeded",
    });
    return section;
  }

  async archiveSection(identity: VerifiedIdentity, id: string): Promise<void> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    const assignedCount = await this.dependencies.sections.countAssignedAccounts(id);
    if (assignedCount > 0) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        `This section still has ${assignedCount} account${assignedCount === 1 ? "" : "s"} assigned to it. Reassign or remove them before removing the section.`,
        400,
      );
    }
    await this.dependencies.sections.archive(id, this.dependencies.institutionId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "section.archived",
      targetId: id,
      result: "succeeded",
    });
  }

  async restoreSection(identity: VerifiedIdentity, id: string): Promise<void> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    await this.dependencies.sections.restore(id, this.dependencies.institutionId);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "section.restored",
      targetId: id,
      result: "succeeded",
    });
  }

  async setLockedWorkspaces(
    identity: VerifiedIdentity,
    id: string,
    lockedWorkspaces: readonly WorkspaceKind[],
  ): Promise<Section> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    const section = await this.dependencies.sections.setLockedWorkspaces(
      id,
      this.dependencies.institutionId,
      lockedWorkspaces,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "section.locked_workspaces_updated",
      targetId: id,
      result: "succeeded",
      reason: JSON.stringify(lockedWorkspaces),
    });
    return section;
  }

  // Only students are ever restricted — teachers always have full access,
  // even if a teacher account happens to carry the same sectionId.
  async assertWorkspaceUnlocked(
    identity: VerifiedIdentity,
    workspace: WorkspaceKind,
  ): Promise<void> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    if (!actor.roles.includes("student") || !actor.sectionId) return;
    const section = await this.dependencies.sections.findById(
      actor.sectionId,
      this.dependencies.institutionId,
    );
    if (section?.lockedWorkspaces.includes(workspace)) {
      throw new AuthorizationError(
        "WORKSPACE_LOCKED",
        "An administrator has locked this workspace for your section.",
        403,
      );
    }
  }

  async getWorkspaceAccess(
    identity: VerifiedIdentity,
  ): Promise<WorkspaceAccess> {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    if (!actor.roles.includes("student") || !actor.sectionId)
      return { lockedWorkspaces: [] };
    const section = await this.dependencies.sections.findById(
      actor.sectionId,
      this.dependencies.institutionId,
    );
    return { lockedWorkspaces: section?.lockedWorkspaces ?? [] };
  }
}
