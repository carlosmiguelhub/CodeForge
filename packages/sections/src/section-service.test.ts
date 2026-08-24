import type { AccountProfile, AuditSink } from "@sqweb/auth";
import type { Section } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SectionService } from "./section-service";
import type { SectionRepository, SectionServiceDependencies } from "./types";

const institutionId = "00000000-0000-4000-8000-000000000001";

const administrator: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "admin",
  email: "admin@example.edu",
  displayName: "Administrator",
  institutionId,
  status: "active",
  roles: ["administrator"],
  sectionId: null,
  authorizationVersion: 1,
};

const identity = {
  uid: "admin",
  email: administrator.email,
  emailVerified: true,
};

const section: Section = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "BSIT-3A",
  archivedAt: null,
  createdAt: "2026-08-22T00:00:00.000Z",
  lockedWorkspaces: [],
};

const student: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000030",
  firebaseUid: "student",
  email: "student@example.edu",
  displayName: "Student",
  institutionId,
  status: "active",
  roles: ["student"],
  sectionId: section.id,
  authorizationVersion: 1,
};
const studentIdentity = {
  uid: "student",
  email: student.email,
  emailVerified: true,
};

const teacher: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000040",
  firebaseUid: "teacher",
  email: "teacher@example.edu",
  displayName: "Teacher",
  institutionId,
  status: "active",
  roles: ["teacher"],
  sectionId: section.id,
  authorizationVersion: 1,
};
const teacherIdentity = {
  uid: "teacher",
  email: teacher.email,
  emailVerified: true,
};

describe("SectionService", () => {
  let repository: SectionRepository;
  let audit: AuditSink;
  let service: SectionService;
  let dependencies: SectionServiceDependencies;

  beforeEach(() => {
    repository = {
      listActive: vi.fn().mockResolvedValue([section]),
      listAll: vi.fn().mockResolvedValue([section]),
      create: vi.fn().mockResolvedValue(section),
      archive: vi.fn().mockResolvedValue(undefined),
      restore: vi.fn().mockResolvedValue(undefined),
      countAssignedAccounts: vi.fn().mockResolvedValue(0),
      setLockedWorkspaces: vi
        .fn()
        .mockResolvedValue({ ...section, lockedWorkspaces: ["sql-workbench"] }),
      findById: vi.fn().mockResolvedValue(section),
    };
    audit = { record: vi.fn().mockResolvedValue(undefined) };
    dependencies = {
      institutionId,
      identity: {
        requireActiveAccount: vi.fn().mockResolvedValue(administrator),
      },
      sections: repository,
      audit,
    };
    service = new SectionService(dependencies);
  });

  it("lists active sections publicly, without any identity check", async () => {
    const result = await service.listPublic();
    expect(result).toEqual([section]);
    expect(repository.listActive).toHaveBeenCalledWith(institutionId);
    expect(dependencies.identity.requireActiveAccount).not.toHaveBeenCalled();
  });

  it("requires an administrator to list every section", async () => {
    vi.mocked(dependencies.identity.requireActiveAccount).mockRejectedValue(
      Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" }),
    );
    await expect(service.listAll(identity)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
    expect(repository.listAll).not.toHaveBeenCalled();
  });

  it("creates a section and audits it", async () => {
    const created = await service.createSection(identity, "BSIT-3A");
    expect(repository.create).toHaveBeenCalledWith({
      institutionId,
      name: "BSIT-3A",
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "section.created",
        targetId: section.id,
      }),
    );
    expect(created).toEqual(section);
  });

  it("archives a section and audits it", async () => {
    await service.archiveSection(identity, section.id);
    expect(repository.archive).toHaveBeenCalledWith(section.id, institutionId);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "section.archived",
        targetId: section.id,
      }),
    );
  });

  it("refuses to archive a section with accounts still assigned to it", async () => {
    repository.countAssignedAccounts = vi.fn().mockResolvedValue(3);
    await expect(
      service.archiveSection(identity, section.id),
    ).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: expect.stringContaining("3 accounts"),
    });
    expect(repository.archive).not.toHaveBeenCalled();
  });

  it("restores an archived section and audits it", async () => {
    await service.restoreSection(identity, section.id);
    expect(repository.restore).toHaveBeenCalledWith(section.id, institutionId);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "section.restored",
        targetId: section.id,
      }),
    );
  });

  it("requires an administrator to restore a section", async () => {
    vi.mocked(dependencies.identity.requireActiveAccount).mockRejectedValue(
      Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" }),
    );
    await expect(
      service.restoreSection(identity, section.id),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(repository.restore).not.toHaveBeenCalled();
  });

  it("sets locked workspaces and audits it", async () => {
    const updated = await service.setLockedWorkspaces(identity, section.id, [
      "sql-workbench",
    ]);
    expect(repository.setLockedWorkspaces).toHaveBeenCalledWith(
      section.id,
      institutionId,
      ["sql-workbench"],
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "section.locked_workspaces_updated",
        targetId: section.id,
        reason: JSON.stringify(["sql-workbench"]),
      }),
    );
    expect(updated.lockedWorkspaces).toEqual(["sql-workbench"]);
  });

  it("requires an administrator to set locked workspaces", async () => {
    vi.mocked(dependencies.identity.requireActiveAccount).mockRejectedValue(
      Object.assign(new Error("denied"), { code: "PERMISSION_DENIED" }),
    );
    await expect(
      service.setLockedWorkspaces(identity, section.id, ["sql-workbench"]),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(repository.setLockedWorkspaces).not.toHaveBeenCalled();
  });

  describe("assertWorkspaceUnlocked", () => {
    it("never restricts a teacher, even in a locked section", async () => {
      vi.mocked(dependencies.identity.requireActiveAccount).mockResolvedValue(
        teacher,
      );
      repository.findById = vi
        .fn()
        .mockResolvedValue({ ...section, lockedWorkspaces: ["sql-workbench"] });
      await expect(
        service.assertWorkspaceUnlocked(teacherIdentity, "sql-workbench"),
      ).resolves.toBeUndefined();
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it("does not restrict a student with no section", async () => {
      vi.mocked(dependencies.identity.requireActiveAccount).mockResolvedValue({
        ...student,
        sectionId: null,
      });
      await expect(
        service.assertWorkspaceUnlocked(studentIdentity, "sql-workbench"),
      ).resolves.toBeUndefined();
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it("throws WORKSPACE_LOCKED for a student in a section with that workspace locked", async () => {
      vi.mocked(dependencies.identity.requireActiveAccount).mockResolvedValue(
        student,
      );
      repository.findById = vi
        .fn()
        .mockResolvedValue({ ...section, lockedWorkspaces: ["sql-workbench"] });
      await expect(
        service.assertWorkspaceUnlocked(studentIdentity, "sql-workbench"),
      ).rejects.toMatchObject({ code: "WORKSPACE_LOCKED" });
    });

    it("resolves for a student in a section without that workspace locked", async () => {
      vi.mocked(dependencies.identity.requireActiveAccount).mockResolvedValue(
        student,
      );
      repository.findById = vi
        .fn()
        .mockResolvedValue({ ...section, lockedWorkspaces: ["code-compiler"] });
      await expect(
        service.assertWorkspaceUnlocked(studentIdentity, "sql-workbench"),
      ).resolves.toBeUndefined();
    });
  });

  describe("getWorkspaceAccess", () => {
    it("returns the section's locked list for a student", async () => {
      vi.mocked(dependencies.identity.requireActiveAccount).mockResolvedValue(
        student,
      );
      repository.findById = vi
        .fn()
        .mockResolvedValue({ ...section, lockedWorkspaces: ["erd-editor"] });
      await expect(
        service.getWorkspaceAccess(studentIdentity),
      ).resolves.toEqual({ lockedWorkspaces: ["erd-editor"] });
    });

    it("returns an empty list for a teacher", async () => {
      vi.mocked(dependencies.identity.requireActiveAccount).mockResolvedValue(
        teacher,
      );
      repository.findById = vi
        .fn()
        .mockResolvedValue({ ...section, lockedWorkspaces: ["erd-editor"] });
      await expect(
        service.getWorkspaceAccess(teacherIdentity),
      ).resolves.toEqual({ lockedWorkspaces: [] });
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });
});
