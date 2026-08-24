import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { JavaGuiWorkspaceContent, WorkspaceKind } from "@sqweb/contracts";

import type { GuiSessionAccessRepository } from "./types";

export interface GuiSessionGrantIssuer {
  issueGuiSession(
    account: AccountProfile,
    sessionId: string,
    lifetimeSeconds: number,
  ): { token: string };
}

export interface GuiSessionServiceDependencies {
  identity: {
    requireActiveAccount(
      identity: VerifiedIdentity,
      roles?: readonly ("student" | "teacher" | "administrator")[],
    ): Promise<AccountProfile>;
  };
  sections: {
    assertWorkspaceUnlocked(
      identity: VerifiedIdentity,
      workspace: WorkspaceKind,
    ): Promise<void>;
  };
  // Saves the just-submitted content before creating the session row, so
  // the provisioning worker's later claim (which re-reads the *current*
  // saved content, see MySqlGuiSessionProvisioningRepository) sees exactly
  // what the student clicked Run on.
  workspaces: {
    save(
      institutionId: string,
      ownerId: string,
      content: JavaGuiWorkspaceContent,
    ): Promise<unknown>;
  };
  sessions: GuiSessionAccessRepository;
  grantSigner: GuiSessionGrantIssuer;
  audit: AuditSink;
  maxRuntimeSeconds: number;
  grantLifetimeSeconds: number;
}
