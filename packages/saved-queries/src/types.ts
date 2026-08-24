import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { SavedQuery } from "@sqweb/contracts";

export interface SavedQueryRepository {
  listOwned(
    ownerId: string,
    workspaceId: string,
  ): Promise<readonly SavedQuery[]>;
  findOwned(id: string, ownerId: string): Promise<SavedQuery | null>;
  create(input: {
    institutionId: string;
    ownerId: string;
    workspaceId: string;
    name: string;
    sql: string;
  }): Promise<SavedQuery>;
  update(
    id: string,
    ownerId: string,
    changes: { name?: string; sql?: string },
  ): Promise<SavedQuery>;
  remove(id: string, ownerId: string): Promise<void>;
}

export interface SavedQueryServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  // A saved query's workspaceId is client-supplied on create — this
  // re-validates the caller actually owns that workspace (the same
  // 404-on-mismatch check WorkspaceService.getWorkspace already does)
  // rather than trusting an arbitrary id straight from the request body.
  verifyWorkspaceOwnership(
    identity: VerifiedIdentity,
    workspaceId: string,
  ): Promise<void>;
  queries: SavedQueryRepository;
  audit: AuditSink;
}
