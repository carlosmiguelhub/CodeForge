import type { AccountProfile } from "@sqweb/auth";
import type { JavaGuiWorkspace } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuiWorkspaceService } from "./gui-workspace-service";
import type { JavaGuiWorkspaceRepository } from "./types";

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

const workspace: JavaGuiWorkspace = {
  ownerId: actor.id,
  content: {
    files: [
      {
        id: "00000000-0000-4000-8000-000000000020",
        name: "Main.java",
        sourceCode: "public class Main {}",
      },
    ],
    openFileIds: ["00000000-0000-4000-8000-000000000020"],
    activeFileId: "00000000-0000-4000-8000-000000000020",
    mainFileId: "00000000-0000-4000-8000-000000000020",
  },
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("GuiWorkspaceService", () => {
  let repository: JavaGuiWorkspaceRepository;
  let service: GuiWorkspaceService;

  beforeEach(() => {
    repository = {
      getOrCreate: vi.fn().mockResolvedValue(workspace),
      save: vi.fn().mockResolvedValue(workspace),
    };
    service = new GuiWorkspaceService({
      identity: { requireActiveAccount: vi.fn().mockResolvedValue(actor) },
      workspaces: repository,
    });
  });

  it("gets or creates the caller's own workspace, seeded with a runnable starter", async () => {
    const result = await service.get(identity);
    expect(repository.getOrCreate).toHaveBeenCalledWith(
      actor.institutionId,
      actor.id,
      expect.objectContaining({
        files: expect.arrayContaining([
          expect.objectContaining({ name: "Main.java" }),
        ]),
        mainFileId: expect.any(String),
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
