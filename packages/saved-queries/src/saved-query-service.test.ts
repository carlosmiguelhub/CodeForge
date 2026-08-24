import type { AccountProfile, AuditSink, VerifiedIdentity } from "@sqweb/auth";
import type { SavedQuery } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SavedQueryService } from "./saved-query-service";
import type { SavedQueryRepository } from "./types";

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
const workspaceId = "00000000-0000-4000-8000-000000000020";

const savedQuery: SavedQuery = {
  id: "00000000-0000-4000-8000-000000000040",
  ownerId: actor.id,
  workspaceId,
  name: "Top students",
  sql: "SELECT * FROM students ORDER BY score DESC LIMIT 10;",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

describe("SavedQueryService", () => {
  let repository: SavedQueryRepository;
  let audit: AuditSink;
  let verifyWorkspaceOwnership: ReturnType<
    typeof vi.fn<
      (identity: VerifiedIdentity, workspaceId: string) => Promise<void>
    >
  >;
  let service: SavedQueryService;

  beforeEach(() => {
    repository = {
      listOwned: vi.fn().mockResolvedValue([]),
      findOwned: vi.fn().mockResolvedValue(savedQuery),
      create: vi.fn().mockResolvedValue(savedQuery),
      update: vi.fn().mockResolvedValue({ ...savedQuery, name: "Renamed" }),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    verifyWorkspaceOwnership = vi
      .fn<(identity: VerifiedIdentity, workspaceId: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    service = new SavedQueryService({
      identity: { requireActiveAccount: vi.fn().mockResolvedValue(actor) },
      verifyWorkspaceOwnership,
      queries: repository,
      audit,
    });
  });

  it("creates a query after confirming the workspace is the caller's own, and audits it", async () => {
    const created = await service.createQuery(identity, {
      workspaceId,
      name: savedQuery.name,
      sql: savedQuery.sql,
    });
    expect(verifyWorkspaceOwnership).toHaveBeenCalledWith(
      identity,
      workspaceId,
    );
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: actor.id,
        institutionId: actor.institutionId,
        workspaceId,
        name: savedQuery.name,
        sql: savedQuery.sql,
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "saved_query.created",
        targetId: savedQuery.id,
      }),
    );
    expect(created).toEqual(savedQuery);
  });

  it("rejects creating a query against a workspace the caller doesn't own", async () => {
    verifyWorkspaceOwnership.mockRejectedValue(new Error("not found"));
    await expect(
      service.createQuery(identity, {
        workspaceId,
        name: savedQuery.name,
        sql: savedQuery.sql,
      }),
    ).rejects.toThrow("not found");
    expect(repository.create).not.toHaveBeenCalled();
  });

  it("404s instead of leaking existence when a query isn't owned by the caller", async () => {
    vi.mocked(repository.findOwned).mockResolvedValue(null);
    await expect(
      service.updateQuery(identity, savedQuery.id, { name: "New name" }),
    ).rejects.toThrow("Saved query not found.");
    await expect(service.deleteQuery(identity, savedQuery.id)).rejects.toThrow(
      "Saved query not found.",
    );
  });

  it("updates a query it owns", async () => {
    const updated = await service.updateQuery(identity, savedQuery.id, {
      name: "Renamed",
    });
    expect(repository.update).toHaveBeenCalledWith(savedQuery.id, actor.id, {
      name: "Renamed",
    });
    expect(updated.name).toBe("Renamed");
  });

  it("deletes a query it owns and audits it", async () => {
    await service.deleteQuery(identity, savedQuery.id);
    expect(repository.remove).toHaveBeenCalledWith(savedQuery.id, actor.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "saved_query.deleted",
        targetId: savedQuery.id,
      }),
    );
  });
});
