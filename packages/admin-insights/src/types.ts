import type {
  AccountProfile,
  AuditEventListQuery,
  AuditReader,
  AuditSink,
  VerifiedIdentity,
} from "@sqweb/auth";
import type {
  AccountStatus,
  GuiSessionAdminListQuery,
  GuiSessionAdminRecord,
  GuiSessionOverview,
  InfrastructureOverview,
  Role,
  TopContributorRecord,
  WorkspaceAllocationListQuery,
  WorkspaceAllocationRecord,
  WorkspaceUsageStat,
} from "@sqweb/contracts";

export interface ActivityResetSummary {
  readonly sqlExecutionsCleared: number;
  readonly codeExecutionsCleared: number;
  readonly guiSessionsCleared: number;
}

export interface UserUsageSummary {
  readonly workspaceState: string | null;
  readonly erdDiagramCount: number;
  readonly codeFileCount: number;
  readonly savedQueryCount: number;
  readonly sqlExecutionCount: number;
  readonly codeExecutionCount: number;
  readonly guiSessionCount: number;
  readonly lastActiveAt: string | null;
}

export interface UsageReader {
  getUsageForOwner(ownerId: string): Promise<UserUsageSummary>;
  getWorkspaceUsageStats(
    institutionId: string,
  ): Promise<readonly WorkspaceUsageStat[]>;
  getTopContributors(
    institutionId: string,
    limit: number,
  ): Promise<readonly TopContributorRecord[]>;
  resetActivityHistory(
    institutionId: string,
  ): Promise<ActivityResetSummary>;
}

export interface InfrastructureReader {
  getOverview(institutionId: string): Promise<InfrastructureOverview>;
  listAllocations(
    institutionId: string,
    query: WorkspaceAllocationListQuery,
  ): Promise<{
    items: readonly WorkspaceAllocationRecord[];
    total: number;
  }>;
  getGuiSessionOverview(institutionId: string): Promise<GuiSessionOverview>;
  listGuiSessions(
    institutionId: string,
    query: GuiSessionAdminListQuery,
  ): Promise<{
    items: readonly GuiSessionAdminRecord[];
    total: number;
  }>;
}

export interface AdminInsightsServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly Role[],
    ): Promise<AccountProfile>;
  };
  accounts: {
    findByFirebaseUid(firebaseUid: string): Promise<AccountProfile | null>;
    countByRole(institutionId: string): Promise<Readonly<Record<Role, number>>>;
    countByStatus(
      institutionId: string,
    ): Promise<Readonly<Record<AccountStatus, number>>>;
  };
  usage: UsageReader;
  auditReader: AuditReader;
  audit: AuditSink;
  infrastructure: InfrastructureReader;
}

export type { AuditEventListQuery };
