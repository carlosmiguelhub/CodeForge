import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  CodeWorkspaceContent,
  CodeWorkspaceSaveRequest,
} from "@sqweb/contracts";

import type { CodeWorkspaceServiceDependencies } from "./types";

// A brand-new workspace (this account's very first visit, ever) should
// still show a starter file rather than an empty, confusing file tree —
// this is that one-time seed, not something the client sends.
const blankContent: CodeWorkspaceContent = {
  root: {
    id: "root",
    kind: "folder",
    name: "My files",
    children: [
      {
        id: "seed-folder",
        kind: "folder",
        name: "Practice",
        children: [
          {
            id: "seed-file",
            kind: "file",
            name: "solution.py",
            language: "python",
            sourceCode: 'print("Hello, CodeForge")\n',
          },
        ],
      },
    ],
  },
  expanded: ["seed-folder"],
  openFileIds: ["seed-file"],
  activeFileId: "seed-file",
};

export class CodeWorkspaceService {
  constructor(
    private readonly dependencies: CodeWorkspaceServiceDependencies,
  ) {}

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

  async save(identity: VerifiedIdentity, request: CodeWorkspaceSaveRequest) {
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
