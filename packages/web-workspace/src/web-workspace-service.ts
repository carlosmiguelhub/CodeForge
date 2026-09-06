import type { VerifiedIdentity } from "@sqweb/auth";
import type {
  WebWorkspaceContent,
  WebWorkspaceSaveRequest,
} from "@sqweb/contracts";

import type { WebWorkspaceServiceDependencies } from "./types";

const blankContent: WebWorkspaceContent = {
  root: {
    id: "root",
    kind: "folder",
    name: "My files",
    children: [
      {
        id: "seed-folder",
        kind: "folder",
        name: "My website",
        children: [
          {
            id: "seed-html",
            kind: "file",
            name: "index.html",
            sourceCode:
              '<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>My website</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello, CodeForge</h1>\n  <p>Edit these files and watch your preview update.</p>\n  <script src="app.js"></script>\n</body>\n</html>\n',
          },
          {
            id: "seed-css",
            kind: "file",
            name: "style.css",
            sourceCode:
              "body {\n  font-family: sans-serif;\n  text-align: center;\n  margin-top: 3rem;\n}\n\nh1 {\n  color: #2563eb;\n  cursor: pointer;\n}\n",
          },
          {
            id: "seed-js",
            kind: "file",
            name: "app.js",
            sourceCode:
              'document.querySelector("h1")?.addEventListener("click", () => {\n  alert("Linked!");\n});\n',
          },
        ],
      },
    ],
  },
  expanded: ["seed-folder"],
  openFileIds: ["seed-html"],
  activeFileId: "seed-html",
};

export class WebWorkspaceService {
  constructor(private readonly dependencies: WebWorkspaceServiceDependencies) {}

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

  async save(identity: VerifiedIdentity, request: WebWorkspaceSaveRequest) {
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
