import { randomUUID } from "node:crypto";

import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  JavaGuiWorkspaceContent,
  JavaGuiWorkspaceSaveRequest,
} from "@sqweb/contracts";

import type { GuiWorkspaceServiceDependencies } from "./types";

// A brand-new workspace (this account's very first visit) still shows a
// runnable starter program rather than an empty file tree — generated once
// per process, not sent by the client. javaGuiFileSchema requires real
// uuids (unlike code-workspace's hardcoded string ids), so these are
// generated rather than literal constants.
const seedFileId = randomUUID();
const blankContent: JavaGuiWorkspaceContent = {
  files: [
    {
      id: seedFileId,
      name: "Main.java",
      sourceCode:
        'import javax.swing.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        JFrame frame = new JFrame("CodeForge");\n        frame.setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);\n        frame.setSize(400, 300);\n        frame.add(new JLabel("Hello, CodeForge", SwingConstants.CENTER));\n        frame.setVisible(true);\n    }\n}\n',
    },
  ],
  openFileIds: [seedFileId],
  activeFileId: seedFileId,
  mainFileId: seedFileId,
};

export class GuiWorkspaceService {
  constructor(private readonly dependencies: GuiWorkspaceServiceDependencies) {}

  async get(identity: VerifiedIdentity) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    return this.dependencies.workspaces.getOrCreate(
      actor.institutionId,
      actor.id,
      blankContent,
    );
  }

  async save(
    identity: VerifiedIdentity,
    request: JavaGuiWorkspaceSaveRequest,
  ) {
    const actor = await this.dependencies.identity.requireActiveAccount(
      identity,
      ["student", "teacher"],
    );
    return this.dependencies.workspaces.save(
      actor.institutionId,
      actor.id,
      request.content,
    );
  }
}
