import type { AccountProfile } from "@sqweb/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminInsightsService } from "./admin-insights-service";
import type { AdminInsightsServiceDependencies } from "./types";

const administrator: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "admin",
  email: "admin@example.edu",
  displayName: "Administrator",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["administrator"],
  sectionId: null,
  authorizationVersion: 1,
};

const identity = {
  uid: "admin",
  email: administrator.email,
  emailVerified: true,
};

const target: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000020",
  firebaseUid: "student-1",
  email: "student-1@example.edu",
  displayName: "Student One",
  institutionId: administrator.institutionId,
  status: "active",
  roles: ["student"],
  sectionId: null,
  authorizationVersion: 1,
};

describe("AdminInsightsService", () => {
  let dependencies: AdminInsightsServiceDependencies;
  let service: AdminInsightsService;

  beforeEach(() => {
    dependencies = {
      identity: {
        requireActiveAccount: vi.fn().mockResolvedValue(administrator),
      },
      accounts: {
        findByFirebaseUid: vi.fn().mockResolvedValue(target),
        countByRole: vi
          .fn()
          .mockResolvedValue({ student: 4, teacher: 2, administrator: 1 }),
        countByStatus: vi.fn().mockResolvedValue({
          pending_verification: 0,
          pending_approval: 1,
          active: 6,
          suspended: 0,
          deactivated: 0,
        }),
      },
      usage: {
        getUsageForOwner: vi.fn().mockResolvedValue({
          workspaceState: "ready",
          erdDiagramCount: 2,
          codeFileCount: 5,
          savedQueryCount: 1,
          sqlExecutionCount: 10,
          codeExecutionCount: 3,
          guiSessionCount: 4,
          lastActiveAt: "2026-08-19T00:00:00.000Z",
        }),
        getWorkspaceUsageStats: vi.fn().mockResolvedValue([
          { workspace: "sql-workbench", totalCount: 10, dailyCounts: [] },
          { workspace: "code-compiler", totalCount: 3, dailyCounts: [] },
          { workspace: "erd-editor", totalCount: 2, dailyCounts: [] },
          { workspace: "saved-queries", totalCount: 1, dailyCounts: [] },
          { workspace: "java-gui-workspace", totalCount: 4, dailyCounts: [] },
        ]),
        getTopContributors: vi.fn().mockResolvedValue([
          {
            id: target.id,
            rank: 1,
            displayName: target.displayName,
            sectionName: "BSIT-3A",
            contributionScore: 20,
            successfulWorkCount: 12,
            sqlExecutionCount: 10,
            codeExecutionCount: 3,
            erdDiagramCount: 2,
            savedQueryCount: 1,
            guiSessionCount: 4,
          },
        ]),
        resetActivityHistory: vi.fn().mockResolvedValue({
          sqlExecutionsCleared: 8,
          codeExecutionsCleared: 3,
          guiSessionsCleared: 1,
        }),
      },
      auditReader: {
        listEvents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      },
      audit: { record: vi.fn().mockResolvedValue(undefined) },
      infrastructure: {
        getOverview: vi.fn().mockResolvedValue({
          workspacesByState: {
            requested: 0,
            provisioning: 0,
            ready: 6,
            resetting: 0,
            suspended: 0,
            failed: 1,
            expired: 0,
            deleting: 0,
            deleted: 0,
          },
          activeAllocationCount: 6,
          cleanupPendingCount: 0,
          cleanupFailedCount: 0,
          poolInstances: [],
        }),
        listAllocations: vi.fn().mockResolvedValue({ items: [], total: 0 }),
        getGuiSessionOverview: vi.fn().mockResolvedValue({
          sessionsByState: {
            requested: 0,
            provisioning: 1,
            running: 2,
            stopped: 4,
            failed: 0,
            expired: 1,
          },
          activeContainerCount: 3,
        }),
        listGuiSessions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      },
    };
    service = new AdminInsightsService(dependencies);
  });

  it("rejects a non-administrator before touching any repository", async () => {
    vi.mocked(dependencies.identity.requireActiveAccount).mockRejectedValue(
      Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" }),
    );
    await expect(service.getDashboardStats(identity)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(dependencies.accounts.countByRole).not.toHaveBeenCalled();
  });

  it("sums usersByStatus into totalUsers for the dashboard", async () => {
    const stats = await service.getDashboardStats(identity);
    expect(stats.totalUsers).toBe(7);
    expect(stats.usersByRole).toEqual({
      student: 4,
      teacher: 2,
      administrator: 1,
    });
  });

  it("includes per-workspace usage stats in the dashboard", async () => {
    const stats = await service.getDashboardStats(identity);
    expect(dependencies.usage.getWorkspaceUsageStats).toHaveBeenCalledWith(
      administrator.institutionId,
    );
    expect(stats.workspaceUsage).toEqual([
      { workspace: "sql-workbench", totalCount: 10, dailyCounts: [] },
      { workspace: "code-compiler", totalCount: 3, dailyCounts: [] },
      { workspace: "erd-editor", totalCount: 2, dailyCounts: [] },
      { workspace: "saved-queries", totalCount: 1, dailyCounts: [] },
      { workspace: "java-gui-workspace", totalCount: 4, dailyCounts: [] },
    ]);
  });

  it("404s user usage for an unknown target", async () => {
    vi.mocked(dependencies.accounts.findByFirebaseUid).mockResolvedValue(null);
    await expect(
      service.getUserUsage(identity, "ghost-uid"),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("resolves the target's account id before reading usage", async () => {
    const usage = await service.getUserUsage(identity, target.firebaseUid);
    expect(dependencies.usage.getUsageForOwner).toHaveBeenCalledWith(target.id);
    expect(usage.erdDiagramCount).toBe(2);
  });

  it("delegates audit event listing and echoes the page/pageSize back", async () => {
    const result = await service.listAuditEvents(identity, {
      page: 2,
      pageSize: 10,
    });
    expect(dependencies.auditReader.listEvents).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
    });
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 0 });
  });

  it("scopes the infrastructure overview to the actor's institution", async () => {
    const overview = await service.getInfrastructureOverview(identity);
    expect(dependencies.infrastructure.getOverview).toHaveBeenCalledWith(
      administrator.institutionId,
    );
    expect(overview.activeAllocationCount).toBe(6);
  });

  it("delegates allocation listing and echoes the page/pageSize back", async () => {
    const result = await service.listWorkspaceAllocations(identity, {
      page: 2,
      pageSize: 10,
    });
    expect(dependencies.infrastructure.listAllocations).toHaveBeenCalledWith(
      administrator.institutionId,
      { page: 2, pageSize: 10 },
    );
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 0 });
  });

  it("scopes the top contributors leaderboard to the actor's institution", async () => {
    const result = await service.listTopContributors(identity, { limit: 25 });
    expect(dependencies.usage.getTopContributors).toHaveBeenCalledWith(
      administrator.institutionId,
      25,
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ rank: 1, contributionScore: 20 });
  });

  it("resets activity history and records an audit event with the reason", async () => {
    const result = await service.resetActivityHistory(identity, {
      reason: "Clearing test data before the term starts",
    });
    expect(dependencies.usage.resetActivityHistory).toHaveBeenCalledWith(
      administrator.institutionId,
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith({
      actorId: administrator.id,
      action: "system.activity_reset",
      targetId: administrator.institutionId,
      result: "succeeded",
      reason: "Clearing test data before the term starts",
    });
    expect(result).toMatchObject({
      sqlExecutionsCleared: 8,
      codeExecutionsCleared: 3,
      guiSessionsCleared: 1,
    });
    expect(result.resetAt).toEqual(expect.any(String));
  });

  it("rejects a non-administrator reset before touching any table", async () => {
    vi.mocked(dependencies.identity.requireActiveAccount).mockRejectedValue(
      Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" }),
    );
    await expect(
      service.resetActivityHistory(identity, { reason: "not an admin" }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(dependencies.usage.resetActivityHistory).not.toHaveBeenCalled();
    expect(dependencies.audit.record).not.toHaveBeenCalled();
  });

  it("scopes the GUI session overview to the actor's institution", async () => {
    const overview = await service.getGuiSessionOverview(identity);
    expect(
      dependencies.infrastructure.getGuiSessionOverview,
    ).toHaveBeenCalledWith(administrator.institutionId);
    expect(overview.activeContainerCount).toBe(3);
  });

  it("delegates GUI session listing and echoes the page/pageSize back", async () => {
    const result = await service.listGuiSessions(identity, {
      page: 2,
      pageSize: 10,
    });
    expect(dependencies.infrastructure.listGuiSessions).toHaveBeenCalledWith(
      administrator.institutionId,
      { page: 2, pageSize: 10 },
    );
    expect(result).toMatchObject({ page: 2, pageSize: 10, total: 0 });
  });
});
