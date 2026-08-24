import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { Role, Section, WorkspaceKind } from "@sqweb/contracts";

export interface SectionRepository {
  listActive(institutionId: string): Promise<readonly Section[]>;
  listAll(institutionId: string): Promise<readonly Section[]>;
  create(input: { institutionId: string; name: string }): Promise<Section>;
  archive(id: string, institutionId: string): Promise<void>;
  restore(id: string, institutionId: string): Promise<void>;
  countAssignedAccounts(id: string): Promise<number>;
  setLockedWorkspaces(
    id: string,
    institutionId: string,
    lockedWorkspaces: readonly WorkspaceKind[],
  ): Promise<Section>;
  findById(id: string, institutionId: string): Promise<Section | null>;
}

export interface SectionServiceDependencies {
  readonly institutionId: string;
  readonly identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly Role[],
    ): Promise<AccountProfile>;
  };
  readonly sections: SectionRepository;
  readonly audit: AuditSink;
}
