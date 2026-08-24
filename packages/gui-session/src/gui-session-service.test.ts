import type { AccountProfile, AuditSink } from "@sqweb/auth";
import type { JavaGuiWorkspaceContent } from "@sqweb/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { GuiSessionService } from "./gui-session-service";
import type {
  GuiSessionGrantIssuer,
  GuiSessionServiceDependencies,
} from "./service-types";
import type { GuiSessionAccessRepository, GuiSessionRecord } from "./types";

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

const mainFileId = "00000000-0000-4000-8000-000000000020";
const content: JavaGuiWorkspaceContent = {
  files: [{ id: mainFileId, name: "Main.java", sourceCode: "public class Main {}" }],
  openFileIds: [mainFileId],
  activeFileId: mainFileId,
  mainFileId,
};

const runningRecord: GuiSessionRecord = {
  id: "00000000-0000-4000-8000-000000000050",
  ownerId: actor.id,
  state: "running",
  mainClassName: "Main",
  maxRuntimeSeconds: 600,
  failureCode: null,
  startedAt: "2026-08-24T00:00:00.000Z",
  endsAt: "2026-08-24T00:10:00.000Z",
  createdAt: "2026-08-24T00:00:00.000Z",
};

function setup() {
  const sections = { assertWorkspaceUnlocked: vi.fn().mockResolvedValue(undefined) };
  const workspaces = { save: vi.fn().mockResolvedValue(undefined) };
  const sessions: GuiSessionAccessRepository = {
    create: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(runningRecord),
    markStopped: vi.fn().mockResolvedValue(undefined),
  };
  const grantSigner: GuiSessionGrantIssuer = {
    issueGuiSession: vi.fn().mockReturnValue({ token: "signed-grant-token" }),
  };
  const audit: AuditSink = { record: vi.fn().mockResolvedValue(undefined) };
  const dependencies: GuiSessionServiceDependencies = {
    identity: { requireActiveAccount: vi.fn().mockResolvedValue(actor) },
    sections,
    workspaces,
    sessions,
    grantSigner,
    audit,
    maxRuntimeSeconds: 600,
    grantLifetimeSeconds: 630,
  };
  return {
    service: new GuiSessionService(dependencies),
    sections,
    workspaces,
    sessions,
    grantSigner,
    audit,
  };
}

describe("GuiSessionService", () => {
  let helpers: ReturnType<typeof setup>;

  beforeEach(() => {
    helpers = setup();
  });

  it("checks the workspace lock before creating a session", async () => {
    await helpers.service.createSession(identity, { content });
    expect(helpers.sections.assertWorkspaceUnlocked).toHaveBeenCalledWith(
      identity,
      "java-gui-workspace",
    );
  });

  it("saves the submitted content before creating the session row", async () => {
    await helpers.service.createSession(identity, { content });
    expect(helpers.workspaces.save).toHaveBeenCalledWith(
      actor.institutionId,
      actor.id,
      content,
    );
    expect(helpers.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        institutionId: actor.institutionId,
        ownerId: actor.id,
        mainClassName: "Main",
        maxRuntimeSeconds: 600,
      }),
    );
  });

  it("returns the grant only from the create response", async () => {
    const result = await helpers.service.createSession(identity, { content });
    expect(result.grant).toBe("signed-grant-token");
    expect(result.state).toBe("requested");
  });

  it("rejects a create request with no main file marked", async () => {
    await expect(
      helpers.service.createSession(identity, {
        content: { ...content, mainFileId: null },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(helpers.sessions.create).not.toHaveBeenCalled();
  });

  it("never returns a grant from getSession", async () => {
    const result = await helpers.service.getSession(
      identity,
      runningRecord.id,
    );
    expect(result.grant).toBeNull();
    expect(result.state).toBe("running");
  });

  it("404s getSession for a session owned by someone else", async () => {
    vi.mocked(helpers.sessions.get).mockResolvedValue({
      ...runningRecord,
      ownerId: "00000000-0000-4000-8000-000000000099",
    });
    await expect(
      helpers.service.getSession(identity, runningRecord.id),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("404s getSession for an unknown session", async () => {
    vi.mocked(helpers.sessions.get).mockResolvedValue(null);
    await expect(
      helpers.service.getSession(identity, "ghost"),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("stops the caller's own session and audits it", async () => {
    await helpers.service.stopSession(identity, runningRecord.id);
    expect(helpers.sessions.markStopped).toHaveBeenCalledWith(runningRecord.id);
    expect(helpers.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "gui_session.stopped" }),
    );
  });

  it("refuses to stop a session owned by someone else", async () => {
    vi.mocked(helpers.sessions.get).mockResolvedValue({
      ...runningRecord,
      ownerId: "00000000-0000-4000-8000-000000000099",
    });
    await expect(
      helpers.service.stopSession(identity, runningRecord.id),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(helpers.sessions.markStopped).not.toHaveBeenCalled();
  });
});
