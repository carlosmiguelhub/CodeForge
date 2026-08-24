import type { AccountProfile, VerifiedIdentity } from "@sqweb/auth";
import type {
  JavaGuiWorkspace,
  JavaGuiWorkspaceContent,
} from "@sqweb/contracts";

export interface JavaGuiWorkspaceRepository {
  getOrCreate(
    institutionId: string,
    ownerId: string,
    blankContent: JavaGuiWorkspaceContent,
  ): Promise<JavaGuiWorkspace>;
  save(
    institutionId: string,
    ownerId: string,
    content: JavaGuiWorkspaceContent,
  ): Promise<JavaGuiWorkspace>;
}

export interface GuiWorkspaceServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  workspaces: JavaGuiWorkspaceRepository;
}
