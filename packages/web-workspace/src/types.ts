import type { AccountProfile, VerifiedIdentity } from "@sqweb/auth";
import type { WebWorkspace, WebWorkspaceContent } from "@sqweb/contracts";

export interface WebWorkspaceRepository {
  getOrCreate(
    institutionId: string,
    ownerId: string,
    blankContent: WebWorkspaceContent,
  ): Promise<WebWorkspace>;
  save(
    institutionId: string,
    ownerId: string,
    content: WebWorkspaceContent,
  ): Promise<WebWorkspace>;
}

export interface WebWorkspaceServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  workspaces: WebWorkspaceRepository;
}
