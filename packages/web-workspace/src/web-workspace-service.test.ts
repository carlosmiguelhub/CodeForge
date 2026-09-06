import type { AccountProfile } from "@sqweb/auth";
import type { WebWorkspace } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { WebWorkspaceService } from "./web-workspace-service";
import type { WebWorkspaceRepository } from "./types";

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

const workspace: WebWorkspace = {
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

describe("WebWorkspaceService", () => {
  let repository: WebWorkspaceRepository;
  let service: WebWorkspaceService;

  beforeEach(() => {
    repository = {
      getOrCreate: vi.fn().mockResolvedValue(workspace),
      save: vi.fn().mockResolvedValue(workspace),
    };
    service = new WebWorkspaceService({
      identity: { requireActiveAccount: vi.fn().mockResolvedValue(actor) },
      workspaces: repository,
    });
  });

  it("gets or creates a linked HTML, CSS, and JavaScript starter", async () => {
    const result = await service.get(identity);
    expect(repository.getOrCreate).toHaveBeenCalledWith(
      actor.institutionId,
      actor.id,
      expect.objectContaining({
        root: expect.objectContaining({
          children: [
            expect.objectContaining({
              children: expect.arrayContaining([
                expect.objectContaining({ name: "index.html" }),
                expect.objectContaining({ name: "style.css" }),
                expect.objectContaining({ name: "app.js" }),
              ]),
            }),
          ],
        }),
        activeFileId: "seed-html",
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
