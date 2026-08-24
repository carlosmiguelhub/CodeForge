import type { AccountProfile } from "@sqweb/auth";
import type { CodeWorkspace } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CodeWorkspaceService } from "./code-workspace-service";
import type { CodeWorkspaceRepository } from "./types";

const actor: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "student",
  email: "student@example.edu",
  displayName: "Student",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["student"],
  sectionId: null,
  authorizationVersion: 1,
};

const identity = { uid: "student", email: actor.email, emailVerified: true };

const workspace: CodeWorkspace = {
  ownerId: actor.id,
  content: {
    root: { id: "root", kind: "folder", name: "My files", children: [] },
    expanded: [],
    openFileIds: [],
    activeFileId: "",
  },
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("CodeWorkspaceService", () => {
  let repository: CodeWorkspaceRepository;
  let service: CodeWorkspaceService;

  beforeEach(() => {
    repository = {
      getOrCreate: vi.fn().mockResolvedValue(workspace),
      save: vi.fn().mockResolvedValue(workspace),
    };
    service = new CodeWorkspaceService({
      identity: { requireActiveAccount: vi.fn().mockResolvedValue(actor) },
      workspaces: repository,
    });
  });

  it("gets or creates the caller's own workspace, seeded with a starter file", async () => {
    const result = await service.get(identity);
    expect(repository.getOrCreate).toHaveBeenCalledWith(
      actor.institutionId,
      actor.id,
      expect.objectContaining({
        root: expect.objectContaining({ name: "My files" }),
        activeFileId: "seed-file",
      }),
    );
    expect(result).toEqual(workspace);
  });

  it("saves content scoped to the caller", async () => {
    await service.save(identity, { content: workspace.content });
    expect(repository.save).toHaveBeenCalledWith(
      actor.institutionId,
      actor.id,
      workspace.content,
    );
  });
});
