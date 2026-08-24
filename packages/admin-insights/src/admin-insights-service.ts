import { AuthorizationError } from "@sqweb/auth";
import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  ActivityResetRequest,
  GuiSessionAdminListQuery,
  TopContributorListQuery,
  WorkspaceAllocationListQuery,
} from "@sqweb/contracts";

import type {
  AdminInsightsServiceDependencies,
  AuditEventListQuery,
} from "./types";

export class AdminInsightsService {
  constructor(
    private readonly dependencies: AdminInsightsServiceDependencies,
  ) {}

  async getDashboardStats(identity: VerifiedIdentity) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    const [usersByRole, usersByStatus, workspaceUsage] = await Promise.all([
      this.dependencies.accounts.countByRole(actor.institutionId),
      this.dependencies.accounts.countByStatus(actor.institutionId),
      this.dependencies.usage.getWorkspaceUsageStats(actor.institutionId),
    ]);
    const totalUsers = Object.values(usersByStatus).reduce(
      (sum, count) => sum + count,
      0,
    );
    return {
      totalUsers,
      usersByRole,
      usersByStatus,
      workspaceUsage,
    };
  }

  async getUserUsage(identity: VerifiedIdentity, targetFirebaseUid: string) {
    await this.dependencies.identity.requireActiveAccount(identity, [
      "administrator",
    ]);
    const target =
      await this.dependencies.accounts.findByFirebaseUid(targetFirebaseUid);
    if (!target) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    return this.dependencies.usage.getUsageForOwner(target.id);
  }

  async listAuditEvents(
    identity: VerifiedIdentity,
    query: AuditEventListQuery,
  ) {
    await this.dependencies.identity.requireActiveAccount(identity, [
      "administrator",
    ]);
    const result = await this.dependencies.auditReader.listEvents(query);
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  async getInfrastructureOverview(identity: VerifiedIdentity) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    return this.dependencies.infrastructure.getOverview(actor.institutionId);
  }

  async listWorkspaceAllocations(
    identity: VerifiedIdentity,
    query: WorkspaceAllocationListQuery,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    const result = await this.dependencies.infrastructure.listAllocations(
      actor.institutionId,
      query,
    );
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  async listTopContributors(
    identity: VerifiedIdentity,
    query: TopContributorListQuery,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    const items = await this.dependencies.usage.getTopContributors(
      actor.institutionId,
      query.limit,
    );
    return { items };
  }

  async resetActivityHistory(
    identity: VerifiedIdentity,
    request: ActivityResetRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    const result = await this.dependencies.usage.resetActivityHistory(
      actor.institutionId,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "system.activity_reset",
      targetId: actor.institutionId,
      result: "succeeded",
      reason: request.reason,
    });
    return { ...result, resetAt: new Date().toISOString() };
  }

  async getGuiSessionOverview(identity: VerifiedIdentity) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    return this.dependencies.infrastructure.getGuiSessionOverview(
      actor.institutionId,
    );
  }

  async listGuiSessions(
    identity: VerifiedIdentity,
    query: GuiSessionAdminListQuery,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["administrator"],
    );
    const result = await this.dependencies.infrastructure.listGuiSessions(
      actor.institutionId,
      query,
    );
    return { ...result, page: query.page, pageSize: query.pageSize };
  }
}
