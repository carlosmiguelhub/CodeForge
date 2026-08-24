import type { AccountProfile, AuditSink } from "@sqweb/auth";
import type { WorkspaceSummary } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { WorkspaceRepository } from "./types";
import { WorkspaceService } from "./workspace-service";

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

const requested: WorkspaceSummary = {
  id: "00000000-0000-4000-8000-000000000030",
  ownerId: actor.id,
  scope: "personal",
  scopeId: actor.id,
  state: "requested",
  quotaBytes: 100 * 1024 * 1024,
  templateVersionId: null,
  expiresAt: null,
  failureCode: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("WorkspaceService", () => {
  let repository: WorkspaceRepository;
  let audit: AuditSink;
  let service: WorkspaceService;

  beforeEach(() => {
    repository = {
      findByIdempotencyKey: vi.fn().mockResolvedValue(null),
      findScoped: vi.fn().mockResolvedValue(requested),
      findOwnedScope: vi.fn().mockResolvedValue(null),
      findResetByIdempotencyKey: vi.fn().mockResolvedValue(null),
      listOwned: vi.fn().mockResolvedValue([]),
      createRequested: vi.fn().mockResolvedValue(requested),
      requestReset: vi
        .fn()
        .mockResolvedValue({ ...requested, state: "resetting" }),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new WorkspaceService({
      identity: { requireActiveAccount: vi.fn().mockResolvedValue(actor) },
      workspaces: repository,
      audit,
    });
  });

  it("creates a server-bound personal request with the approved quota", async () => {
    await service.requestWorkspace(
      { uid: "student", email: actor.email, emailVerified: true },
      { scope: "personal" },
      "request-key-0000000001",
    );
    expect(repository.createRequested).toHaveBeenCalledWith(
      expect.objectContaining({
        quotaBytes: 100 * 1024 * 1024,
        request: expect.objectContaining({ scopeId: actor.id }),
      }),
    );
  });

  it("returns the original workspace for an idempotent retry", async () => {
    vi.mocked(repository.findByIdempotencyKey).mockResolvedValue(requested);
    expect(
      await service.requestWorkspace(
        { uid: "student", email: actor.email, emailVerified: true },
        { scope: "personal" },
        "request-key-0000000001",
      ),
    ).toEqual(requested);
    expect(repository.createRequested).not.toHaveBeenCalled();
  });

  it("rejects a client-selected template version", async () => {
    await expect(
      service.requestWorkspace(
        { uid: "student", email: actor.email, emailVerified: true },
        { scope: "personal", templateVersionId: crypto.randomUUID() },
        "request-key-0000000001",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED", statusCode: 409 });
  });

  it("conceals another user's workspace", async () => {
    vi.mocked(repository.findScoped).mockResolvedValue({
      ...requested,
      ownerId: crypto.randomUUID(),
    });
    await expect(
      service.getWorkspace(
        { uid: "student", email: actor.email, emailVerified: true },
        requested.id,
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND", statusCode: 404 });
  });
});
