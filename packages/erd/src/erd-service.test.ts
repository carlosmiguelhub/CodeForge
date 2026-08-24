import type { AccountProfile, AuditSink } from "@sqweb/auth";
import type { ErdDiagram } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ErdService } from "./erd-service";
import type { ErdDiagramRepository } from "./types";

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

const diagram: ErdDiagram = {
  id: "00000000-0000-4000-8000-000000000040",
  ownerId: actor.id,
  name: "Untitled diagram",
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
  content: {
    nodes: [],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    entityColumns: [],
  },
};

describe("ErdService", () => {
  let repository: ErdDiagramRepository;
  let audit: AuditSink;
  let service: ErdService;

  beforeEach(() => {
    repository = {
      listOwned: vi.fn().mockResolvedValue([]),
      findOwned: vi.fn().mockResolvedValue(diagram),
      create: vi.fn().mockResolvedValue(diagram),
      rename: vi.fn().mockResolvedValue({ ...diagram, name: "Renamed" }),
      saveContent: vi.fn().mockResolvedValue(diagram),
      remove: vi.fn().mockResolvedValue(undefined),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    service = new ErdService({
      identity: { requireActiveAccount: vi.fn().mockResolvedValue(actor) },
      diagrams: repository,
      audit,
    });
  });

  it("creates a diagram owned by the caller and audits it", async () => {
    const created = await service.createDiagram(identity, {});
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: actor.id,
        institutionId: actor.institutionId,
        name: "Untitled diagram",
      }),
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "erd_diagram.created",
        targetId: diagram.id,
      }),
    );
    expect(created).toEqual(diagram);
  });

  it("honors a client-supplied name on create", async () => {
    await service.createDiagram(identity, { name: "Library schema" });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Library schema" }),
    );
  });

  it("honors client-supplied content on create, e.g. a generated ERD", async () => {
    const generatedContent = {
      nodes: [{ id: "n1" }],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
      entityColumns: [],
    };
    await service.createDiagram(identity, { content: generatedContent });
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ content: generatedContent }),
    );
  });

  it("404s instead of leaking existence when a diagram isn't owned by the caller", async () => {
    vi.mocked(repository.findOwned).mockResolvedValue(null);
    await expect(service.getDiagram(identity, diagram.id)).rejects.toThrow(
      "ERD diagram not found.",
    );
    await expect(
      service.renameDiagram(identity, diagram.id, { name: "New name" }),
    ).rejects.toThrow("ERD diagram not found.");
    await expect(
      service.saveContent(identity, diagram.id, { content: diagram.content }),
    ).rejects.toThrow("ERD diagram not found.");
    await expect(service.deleteDiagram(identity, diagram.id)).rejects.toThrow(
      "ERD diagram not found.",
    );
  });

  it("renames a diagram it owns", async () => {
    const renamed = await service.renameDiagram(identity, diagram.id, {
      name: "Renamed",
    });
    expect(repository.rename).toHaveBeenCalledWith(
      diagram.id,
      actor.id,
      "Renamed",
    );
    expect(renamed.name).toBe("Renamed");
  });

  it("saves content without recording an audit event", async () => {
    await service.saveContent(identity, diagram.id, {
      content: diagram.content,
    });
    expect(repository.saveContent).toHaveBeenCalledWith(
      diagram.id,
      actor.id,
      diagram.content,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("deletes a diagram it owns and audits it", async () => {
    await service.deleteDiagram(identity, diagram.id);
    expect(repository.remove).toHaveBeenCalledWith(diagram.id, actor.id);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "erd_diagram.deleted",
        targetId: diagram.id,
      }),
    );
  });
});
