import type { AccountProfile, VerifiedIdentity } from "@sqweb/auth";
import type { CodeWorkspace, CodeWorkspaceContent } from "@sqweb/contracts";

export interface CodeWorkspaceRepository {
  getOrCreate(
    institutionId: string,
    ownerId: string,
    blankContent: CodeWorkspaceContent,
  ): Promise<CodeWorkspace>;
  save(
    institutionId: string,
    ownerId: string,
    content: CodeWorkspaceContent,
  ): Promise<CodeWorkspace>;
}

export interface CodeWorkspaceServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  workspaces: CodeWorkspaceRepository;
}
