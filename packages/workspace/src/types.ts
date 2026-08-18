import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { WorkspaceRequest, WorkspaceSummary } from "@sqweb/contracts";

export interface WorkspaceRepository {
  findByIdempotencyKey(
    institutionId: string,
    actorId: string,
    key: string,
  ): Promise<WorkspaceSummary | null>;
  findScoped(
    workspaceId: string,
    institutionId: string,
  ): Promise<WorkspaceSummary | null>;
  findOwnedScope(
    ownerId: string,
    scope: "personal" | "class",
    scopeId: string,
  ): Promise<WorkspaceSummary | null>;
  findResetByIdempotencyKey(
    workspaceId: string,
    key: string,
  ): Promise<WorkspaceSummary | null>;
  listOwned(ownerId: string): Promise<readonly WorkspaceSummary[]>;
  createRequested(input: {
    actor: AccountProfile;
    request: WorkspaceRequest;
    idempotencyKey: string;
    quotaBytes: number;
  }): Promise<WorkspaceSummary>;
  requestReset(input: {
    workspace: WorkspaceSummary;
    actor: AccountProfile;
    idempotencyKey: string;
    reason: string;
  }): Promise<WorkspaceSummary>;
}

export interface WorkspaceServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  workspaces: WorkspaceRepository;
  audit: AuditSink;
}

export interface WorkspaceProvisioningTask {
  readonly workspaceId: string;
  readonly institutionId: string;
  readonly actorId: string;
  readonly quotaBytes: number;
  readonly templateVersionId: string | null;
}

export interface WorkspaceResetTask extends WorkspaceProvisioningTask {
  readonly resetId: string;
  readonly previousAllocation: WorkspaceAllocation | null;
}

export interface WorkspaceCleanupTask extends WorkspaceAllocation {
  readonly workspaceId: string;
  readonly institutionId: string;
  readonly actorId: string;
}

export interface WorkspaceAllocation {
  readonly id: string;
  readonly databaseName: string;
  readonly databaseUser: string;
  readonly credentialSecretRef: string;
}

export interface WorkspaceCredential {
  readonly host: string;
  readonly port: number;
  readonly database: string;
  readonly username: string;
  readonly password: string;
}

export interface ProvisionedWorkspace {
  readonly allocationId: string;
  readonly databaseName: string;
  readonly databaseUser: string;
  readonly credential: WorkspaceCredential;
}

export interface WorkspaceProvisioningRepository {
  claimRequested(): Promise<WorkspaceProvisioningTask | null>;
  claimReset(): Promise<WorkspaceResetTask | null>;
  claimCleanup(): Promise<WorkspaceCleanupTask | null>;
  completeProvisioning(input: {
    task: WorkspaceProvisioningTask;
    provisioned: ProvisionedWorkspace;
    secretRef: string;
    poolInstanceId: string;
  }): Promise<void>;
  completeReset(input: {
    task: WorkspaceResetTask;
    provisioned: ProvisionedWorkspace;
    secretRef: string;
    poolInstanceId: string;
  }): Promise<void>;
  failProvisioning(workspaceId: string, failureCode: string): Promise<void>;
  failReset(task: WorkspaceResetTask, failureCode: string): Promise<void>;
  completeCleanup(allocationId: string): Promise<void>;
  failCleanup(task: WorkspaceCleanupTask, failureCode: string): Promise<void>;
}

export interface WorkspaceDatabaseAdmin {
  provision(workspaceId: string): Promise<ProvisionedWorkspace>;
  remove(allocation: WorkspaceAllocation): Promise<void>;
}

export interface WorkspaceSecretStore {
  put(workspaceId: string, credential: WorkspaceCredential): Promise<string>;
  remove(secretRef: string): Promise<void>;
}
