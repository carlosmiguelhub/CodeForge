import type {
  AccountListQuery,
  AccountProfile,
  AccountRepository,
  AdminAccountCreation,
  IdentityServiceDependencies,
  RegistrationInput,
  RoleAssignmentChange,
  RoleRemoval,
} from "@sqweb/auth";
import { IdentityService } from "@sqweb/auth";
import { AdminInsightsService } from "@sqweb/admin-insights";
import type { SectionRepository } from "@sqweb/sections";
import { SectionService } from "@sqweb/sections";
import type { WorkspaceRepository } from "@sqweb/workspace";
import { WorkspaceService } from "@sqweb/workspace";
import type { ErdDiagramRepository } from "@sqweb/erd";
import { ErdService } from "@sqweb/erd";
import type { CodeWorkspaceRepository } from "@sqweb/code-workspace";
import { CodeWorkspaceService } from "@sqweb/code-workspace";
import type { SavedQueryRepository } from "@sqweb/saved-queries";
import { SavedQueryService } from "@sqweb/saved-queries";
import type { JavaGuiWorkspaceRepository } from "@sqweb/gui-workspace";
import { GuiWorkspaceService } from "@sqweb/gui-workspace";
import type { GuiSessionAccessRepository } from "@sqweb/gui-session";
import { GuiSessionService } from "@sqweb/gui-session";
import { ExecutionGrantSigner } from "@sqweb/execution";
import type { AccountStatus, Role } from "@sqweb/contracts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildServer } from "./server";

const institutionId = "00000000-0000-4000-8000-000000000001";

class MemoryAccounts implements AccountRepository {
  readonly accounts = new Map<string, AccountProfile>();

  async findByFirebaseUid(firebaseUid: string) {
    return this.accounts.get(firebaseUid) ?? null;
  }

  async register(input: RegistrationInput) {
    const profile: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: input.identity.uid,
      email: input.identity.email,
      displayName: input.displayName,
      institutionId: input.institutionId,
      status: input.requestedRole === "student" ? "active" : "pending_approval",
      roles: input.requestedRole === "student" ? ["student"] : [],
      sectionId: input.sectionId ?? null,
      authorizationVersion: 1,
    };
    this.accounts.set(profile.firebaseUid, profile);
    return profile;
  }

  async changeStatus(input: {
    targetFirebaseUid: string;
    nextStatus: Extract<AccountStatus, "active" | "suspended" | "deactivated">;
  }) {
    const target = this.accounts.get(input.targetFirebaseUid);
    if (!target) throw new Error("not found");
    const changed: AccountProfile = {
      ...target,
      status: input.nextStatus,
      roles: input.nextStatus === "active" ? ["teacher"] : [],
      authorizationVersion: target.authorizationVersion + 1,
    };
    this.accounts.set(changed.firebaseUid, changed);
    return changed;
  }

  async updateDisplayName(firebaseUid: string, displayName: string) {
    const target = this.accounts.get(firebaseUid);
    if (!target) throw new Error("not found");
    const updated: AccountProfile = { ...target, displayName };
    this.accounts.set(firebaseUid, updated);
    return updated;
  }

  async listAccounts(institutionId: string, query: AccountListQuery) {
    let items = [...this.accounts.values()].filter(
      (account) => account.institutionId === institutionId,
    );
    if (query.role) {
      const { role } = query;
      items = items.filter((account) => account.roles.includes(role));
    }
    if (query.status) items = items.filter((a) => a.status === query.status);
    if (query.sectionId)
      items = items.filter((a) => a.sectionId === query.sectionId);
    if (query.search) {
      const term = query.search.toLowerCase();
      items = items.filter(
        (a) =>
          a.email.toLowerCase().includes(term) ||
          a.displayName.toLowerCase().includes(term),
      );
    }
    const total = items.length;
    const start = (query.page - 1) * query.pageSize;
    return { items: items.slice(start, start + query.pageSize), total };
  }

  async createByAdmin(input: AdminAccountCreation) {
    const profile: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: input.firebaseUid,
      email: input.email,
      displayName: input.displayName,
      institutionId: input.institutionId,
      status: "active",
      roles: [...input.roles],
      sectionId: null,
      authorizationVersion: 1,
    };
    this.accounts.set(profile.firebaseUid, profile);
    return profile;
  }

  async assignRole(input: RoleAssignmentChange) {
    const target = this.accounts.get(input.targetFirebaseUid);
    if (!target) throw new Error("not found");
    const updated: AccountProfile = {
      ...target,
      roles: target.roles.includes(input.role)
        ? target.roles
        : [...target.roles, input.role],
    };
    this.accounts.set(updated.firebaseUid, updated);
    return updated;
  }

  async assignSection(
    firebaseUid: string,
    _institutionId: string,
    sectionId: string | null,
  ) {
    const target = this.accounts.get(firebaseUid);
    if (!target) throw new Error("not found");
    const updated: AccountProfile = { ...target, sectionId };
    this.accounts.set(updated.firebaseUid, updated);
    return updated;
  }

  async removeRole(input: RoleRemoval) {
    const target = this.accounts.get(input.targetFirebaseUid);
    if (!target) throw new Error("not found");
    const updated: AccountProfile = {
      ...target,
      roles: target.roles.filter((role) => role !== input.role),
    };
    this.accounts.set(updated.firebaseUid, updated);
    return updated;
  }

  async deleteAccount(firebaseUid: string) {
    this.accounts.delete(firebaseUid);
  }

  async countByRole(institutionId: string) {
    const result: Record<Role, number> = {
      student: 0,
      teacher: 0,
      administrator: 0,
    };
    for (const account of this.accounts.values()) {
      if (account.institutionId !== institutionId) continue;
      for (const role of account.roles) result[role] += 1;
    }
    return result;
  }

  async countByStatus(institutionId: string) {
    const result: Record<AccountStatus, number> = {
      pending_verification: 0,
      pending_approval: 0,
      active: 0,
      suspended: 0,
      deactivated: 0,
    };
    for (const account of this.accounts.values()) {
      if (account.institutionId !== institutionId) continue;
      result[account.status] += 1;
    }
    return result;
  }

  async listActiveFirebaseUidsExcludingRole(
    institutionId: string,
    excludedRole: Role,
  ) {
    return [...this.accounts.values()]
      .filter(
        (account) =>
          account.institutionId === institutionId &&
          !account.roles.includes(excludedRole),
      )
      .map((account) => account.firebaseUid);
  }
}

class MemoryInstitutions {
  state = { enabled: false, message: null as string | null };

  async getMaintenanceState() {
    return this.state;
  }

  async setMaintenanceState(
    _institutionId: string,
    enabled: boolean,
    message: string | null,
  ) {
    this.state = { enabled, message };
  }
}

const servers: Array<Awaited<ReturnType<typeof buildServer>>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function setup(actor?: AccountProfile) {
  const accounts = new MemoryAccounts();
  if (actor) accounts.accounts.set(actor.firebaseUid, actor);
  const institutions = new MemoryInstitutions();
  const dependencies: IdentityServiceDependencies = {
    accounts,
    institutions,
    tokens: {
      verifyIdToken: vi.fn(async (token) => ({
        uid: token,
        email: `${token}@example.edu`,
        emailVerified: true,
      })),
    },
    appCheck: {
      verifyToken: vi.fn(async (token) => {
        if (token !== "valid-app") throw new Error("invalid");
      }),
    },
    claims: { writeClaims: vi.fn().mockResolvedValue(undefined) },
    audit: { record: vi.fn().mockResolvedValue(undefined) },
    provisioner: {
      createUser: vi.fn(async (input: { email: string }) => ({
        firebaseUid: `provisioned-${input.email}`,
      })),
      deleteUser: vi.fn().mockResolvedValue(undefined),
      setPassword: vi.fn().mockResolvedValue(undefined),
      revokeSessions: vi.fn().mockResolvedValue(undefined),
    },
    institutionId,
  };
  const identity = new IdentityService(dependencies);
  const usageReader = {
    getUsageForOwner: vi.fn().mockResolvedValue({
      workspaceState: null,
      erdDiagramCount: 0,
      codeFileCount: 0,
      savedQueryCount: 0,
      sqlExecutionCount: 0,
      codeExecutionCount: 0,
      guiSessionCount: 0,
      lastActiveAt: null,
    }),
    getWorkspaceUsageStats: vi.fn().mockResolvedValue([
      { workspace: "sql-workbench", totalCount: 0, dailyCounts: [] },
      { workspace: "code-compiler", totalCount: 0, dailyCounts: [] },
      { workspace: "erd-editor", totalCount: 0, dailyCounts: [] },
      { workspace: "saved-queries", totalCount: 0, dailyCounts: [] },
      { workspace: "java-gui-workspace", totalCount: 0, dailyCounts: [] },
    ]),
    getTopContributors: vi.fn().mockResolvedValue([]),
    resetActivityHistory: vi.fn().mockResolvedValue({
      sqlExecutionsCleared: 0,
      codeExecutionsCleared: 0,
      guiSessionsCleared: 0,
    }),
  };
  const auditReader = {
    listEvents: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  const infrastructureReader = {
    getOverview: vi.fn().mockResolvedValue({
      workspacesByState: {
        requested: 0,
        provisioning: 0,
        ready: 0,
        resetting: 0,
        suspended: 0,
        failed: 0,
        expired: 0,
        deleting: 0,
        deleted: 0,
      },
      activeAllocationCount: 0,
      cleanupPendingCount: 0,
      cleanupFailedCount: 0,
      poolInstances: [],
    }),
    listAllocations: vi.fn().mockResolvedValue({ items: [], total: 0 }),
    getGuiSessionOverview: vi.fn().mockResolvedValue({
      sessionsByState: {
        requested: 0,
        provisioning: 0,
        running: 0,
        stopped: 0,
        failed: 0,
        expired: 0,
      },
      activeContainerCount: 0,
    }),
    listGuiSessions: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  };
  const adminInsights = new AdminInsightsService({
    identity,
    accounts,
    usage: usageReader,
    auditReader,
    audit: dependencies.audit,
    infrastructure: infrastructureReader,
  });
  const sectionRepository: SectionRepository = {
    listActive: vi.fn().mockResolvedValue([]),
    listAll: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (input) => ({
      id: crypto.randomUUID(),
      name: input.name,
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: [],
    })),
    countAssignedAccounts: vi.fn().mockResolvedValue(0),
    archive: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    setLockedWorkspaces: vi
      .fn()
      .mockImplementation(async (id, _institutionId, lockedWorkspaces) => ({
        id,
        name: "BSIT-3A",
        archivedAt: null,
        createdAt: "2026-08-18T00:00:00.000Z",
        lockedWorkspaces,
      })),
    findById: vi.fn().mockResolvedValue(null),
  };
  const section = new SectionService({
    institutionId,
    identity,
    sections: sectionRepository,
    audit: dependencies.audit,
  });
  const workspaceRepository: WorkspaceRepository = {
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findScoped: vi.fn().mockResolvedValue(null),
    findOwnedScope: vi.fn().mockResolvedValue(null),
    findResetByIdempotencyKey: vi.fn().mockResolvedValue(null),
    listOwned: vi.fn().mockResolvedValue([]),
    createRequested: vi.fn(),
    requestReset: vi.fn(),
  };
  const erdDiagramRepository: ErdDiagramRepository = {
    listOwned: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    rename: vi.fn(),
    saveContent: vi.fn(),
    remove: vi.fn(),
  };
  const blankCodeWorkspaceContent = {
    root: {
      id: "root",
      kind: "folder" as const,
      name: "My files",
      children: [],
    },
    expanded: [],
    openFileIds: [],
    activeFileId: "",
  };
  const codeWorkspaceRepository: CodeWorkspaceRepository = {
    getOrCreate: vi.fn().mockResolvedValue({
      ownerId: "unused",
      content: blankCodeWorkspaceContent,
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
    }),
    save: vi.fn(),
  };
  const workspaceService = new WorkspaceService({
    identity,
    workspaces: workspaceRepository,
    audit: dependencies.audit,
  });
  const savedQueryRepository: SavedQueryRepository = {
    listOwned: vi.fn().mockResolvedValue([]),
    findOwned: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };
  const guiWorkspaceRepository: JavaGuiWorkspaceRepository = {
    getOrCreate: vi.fn().mockResolvedValue({
      ownerId: "unused",
      content: {
        files: [],
        openFileIds: [],
        activeFileId: null,
        mainFileId: null,
      },
      createdAt: "2026-08-18T00:00:00.000Z",
      updatedAt: "2026-08-18T00:00:00.000Z",
    }),
    save: vi.fn(),
  };
  const guiSessionRepository: GuiSessionAccessRepository = {
    create: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    markStopped: vi.fn().mockResolvedValue(undefined),
  };
  const executionGrantSigner = new ExecutionGrantSigner(
    "test-execution-secret-that-is-at-least-32-chars",
  );
  const server = await buildServer({
    identity,
    adminInsights,
    section,
    workspace: workspaceService,
    erd: new ErdService({
      identity,
      diagrams: erdDiagramRepository,
      audit: dependencies.audit,
    }),
    codeWorkspace: new CodeWorkspaceService({
      identity,
      workspaces: codeWorkspaceRepository,
    }),
    savedQuery: new SavedQueryService({
      identity,
      verifyWorkspaceOwnership: async (verified, workspaceId) => {
        await workspaceService.getWorkspace(verified, workspaceId);
      },
      queries: savedQueryRepository,
      audit: dependencies.audit,
    }),
    guiWorkspace: new GuiWorkspaceService({
      identity,
      workspaces: guiWorkspaceRepository,
    }),
    guiSession: new GuiSessionService({
      identity,
      sections: section,
      workspaces: guiWorkspaceRepository,
      sessions: guiSessionRepository,
      grantSigner: executionGrantSigner,
      audit: dependencies.audit,
      maxRuntimeSeconds: 600,
      grantLifetimeSeconds: 630,
    }),
    executionGrantSigner,
    allowedOrigins: ["http://localhost:3000"],
    logger: false,
  });
  servers.push(server);
  return {
    server,
    accounts,
    institutions,
    workspaceRepository,
    erdDiagramRepository,
    codeWorkspaceRepository,
    savedQueryRepository,
    guiWorkspaceRepository,
    guiSessionRepository,
    executionGrantSigner,
    sectionRepository,
    usageReader,
    auditReader,
    dependencies,
  };
}

describe("platform identity API", () => {
  it("rejects an unauthenticated profile request", async () => {
    const { server } = await setup();
    const response = await server.inject({ method: "GET", url: "/v1/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED");
  });

  it("rejects an unauthenticated profile update", async () => {
    const { server } = await setup();
    const response = await server.inject({
      method: "PATCH",
      url: "/v1/me",
      payload: { displayName: "New Name" },
    });
    expect(response.statusCode).toBe(401);
  });

  it("updates the caller's display name", async () => {
    const student: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "student-1",
      email: "student-1@example.edu",
      displayName: "Original Name",
      institutionId,
      status: "active",
      roles: ["student"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(student);
    const response = await server.inject({
      method: "PATCH",
      url: "/v1/me",
      headers: { authorization: "Bearer student-1" },
      payload: { displayName: "  Updated Name  " },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ displayName: "Updated Name" });
  });

  it("rejects an empty display name on profile update", async () => {
    const student: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "student-1",
      email: "student-1@example.edu",
      displayName: "Original Name",
      institutionId,
      status: "active",
      roles: ["student"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(student);
    const response = await server.inject({
      method: "PATCH",
      url: "/v1/me",
      headers: { authorization: "Bearer student-1" },
      payload: { displayName: " " },
    });
    expect(response.statusCode).toBe(400);
  });

  it("registers a verified teacher in pending approval state", async () => {
    const { server } = await setup();
    const response = await server.inject({
      method: "POST",
      url: "/v1/registrations",
      headers: {
        authorization: "Bearer new-teacher",
        "x-firebase-appcheck": "valid-app",
        origin: "http://localhost:3000",
      },
      payload: { displayName: "New Teacher", requestedRole: "teacher" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      status: "pending_approval",
      roles: [],
    });
  });

  it("requires App Check for registration", async () => {
    const { server } = await setup();
    const response = await server.inject({
      method: "POST",
      url: "/v1/registrations",
      headers: { authorization: "Bearer new-student" },
      payload: { displayName: "New Student", requestedRole: "student" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("requires a section when self-registering as a student", async () => {
    const { server } = await setup();
    const response = await server.inject({
      method: "POST",
      url: "/v1/registrations",
      headers: {
        authorization: "Bearer new-student",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { displayName: "New Student", requestedRole: "student" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.fieldErrors).toEqual([
      expect.objectContaining({ path: "sectionId" }),
    ]);
  });

  it("registers a student with their selected section", async () => {
    const { server } = await setup();
    const sectionId = "00000000-0000-4000-8000-000000000050";
    const response = await server.inject({
      method: "POST",
      url: "/v1/registrations",
      headers: {
        authorization: "Bearer new-student",
        "x-firebase-appcheck": "valid-app",
      },
      payload: {
        displayName: "New Student",
        requestedRole: "student",
        sectionId,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ status: "active", sectionId });
  });

  it("requires administrator role and App Check to list accounts", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "pending",
        email: "pending@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Pending Teacher",
      requestedRole: "teacher",
    });

    const missingAppCheck = await server.inject({
      method: "GET",
      url: "/v1/admin/users?status=pending_approval",
      headers: { authorization: "Bearer admin" },
    });
    expect(missingAppCheck.statusCode).toBe(403);

    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/users?status=pending_approval",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      items: [
        expect.objectContaining({
          firebaseUid: "pending",
          status: "pending_approval",
        }),
      ],
    });
  });

  it("filters the account list by section", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts } = await setup(administrator);
    const sectionId = "00000000-0000-4000-8000-000000000060";
    await accounts.register({
      identity: {
        uid: "in-section",
        email: "in-section@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "In Section",
      requestedRole: "student",
      sectionId,
    });
    await accounts.register({
      identity: {
        uid: "no-section",
        email: "no-section@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "No Section",
      requestedRole: "student",
    });

    const response = await server.inject({
      method: "GET",
      url: `/v1/admin/users?sectionId=${sectionId}`,
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      total: 1,
      items: [expect.objectContaining({ firebaseUid: "in-section" })],
    });
  });

  it("paginates the account list", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts } = await setup(administrator);
    for (let index = 0; index < 3; index += 1) {
      await accounts.register({
        identity: {
          uid: `student-${index}`,
          email: `student-${index}@example.edu`,
          emailVerified: true,
        },
        institutionId,
        displayName: `Student ${index}`,
        requestedRole: "student",
      });
    }
    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/users?page=1&pageSize=2",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.items).toHaveLength(2);
    // The administrator account created in setup() plus 3 students.
    expect(body.total).toBe(4);
  });

  it("creates a user through the admin endpoint", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, dependencies } = await setup(administrator);
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/users",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: {
        email: "new-teacher@example.edu",
        displayName: "New Teacher",
        roles: ["teacher"],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      email: "new-teacher@example.edu",
      status: "active",
      roles: ["teacher"],
    });
    expect(dependencies.provisioner.deleteUser).not.toHaveBeenCalled();
  });

  it("assigns and removes a role for an existing user", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "student-x",
        email: "student-x@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student X",
      requestedRole: "student",
    });

    const assign = await server.inject({
      method: "POST",
      url: "/v1/admin/users/student-x/roles",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { role: "teacher" },
    });
    expect(assign.statusCode).toBe(200);
    expect(assign.json().roles).toEqual(
      expect.arrayContaining(["student", "teacher"]),
    );

    const remove = await server.inject({
      method: "DELETE",
      url: "/v1/admin/users/student-x/roles/student",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(remove.statusCode).toBe(200);
    expect(remove.json().roles).toEqual(["teacher"]);
  });

  it("lets an administrator reassign a student's section", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts, dependencies } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "student-section",
        email: "student-section@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student Section",
      requestedRole: "student",
    });
    const sectionId = "00000000-0000-4000-8000-000000000054";

    const response = await server.inject({
      method: "PATCH",
      url: "/v1/admin/users/student-section/section",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { sectionId },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sectionId });
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.section_assigned" }),
    );
  });

  it("lets an administrator unassign a student's section", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts } = await setup(administrator);
    const sectionId = "00000000-0000-4000-8000-000000000055";
    await accounts.register({
      identity: {
        uid: "student-unassign",
        email: "student-unassign@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student Unassign",
      requestedRole: "student",
      sectionId,
    });

    const response = await server.inject({
      method: "PATCH",
      url: "/v1/admin/users/student-unassign/section",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { sectionId: null },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ sectionId: null });
  });

  it("requires an administrator to reassign a section", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "teacher",
      email: "teacher@example.edu",
      displayName: "Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(teacher);
    const response = await server.inject({
      method: "PATCH",
      url: "/v1/admin/users/someone/section",
      headers: {
        authorization: "Bearer teacher",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { sectionId: null },
    });
    expect(response.statusCode).toBe(403);
  });

  it("blocks removing an account's last remaining role", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "student-y",
        email: "student-y@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student Y",
      requestedRole: "student",
    });

    const response = await server.inject({
      method: "DELETE",
      url: "/v1/admin/users/student-y/roles/student",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("records a password reset request without emailing anything itself", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts, dependencies } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "student-z",
        email: "student-z@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student Z",
      requestedRole: "student",
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/users/student-z/reset-password",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.password_reset_requested",
      }),
    );
  });

  it("lets an administrator delete another account", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts, dependencies } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "student-delete",
        email: "student-delete@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student Delete",
      requestedRole: "student",
    });

    const response = await server.inject({
      method: "DELETE",
      url: "/v1/admin/users/student-delete",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(dependencies.provisioner.deleteUser).toHaveBeenCalledWith(
      "student-delete",
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.deleted" }),
    );

    const followUp = await server.inject({
      method: "GET",
      url: "/v1/admin/users/student-delete",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(followUp.statusCode).toBe(404);
  });

  it("refuses to let an administrator delete their own account", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(administrator);
    const response = await server.inject({
      method: "DELETE",
      url: "/v1/admin/users/admin",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(400);
  });

  it("requires an administrator to delete an account", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "teacher",
      email: "teacher@example.edu",
      displayName: "Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(teacher);
    const response = await server.inject({
      method: "DELETE",
      url: "/v1/admin/users/someone-else",
      headers: {
        authorization: "Bearer teacher",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets an administrator set a password directly", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts, dependencies } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "student-pw",
        email: "student-pw@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student PW",
      requestedRole: "student",
    });

    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/users/student-pw/set-password",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { password: "New-Passw0rd!" },
    });
    expect(response.statusCode).toBe(204);
    expect(dependencies.provisioner.setPassword).toHaveBeenCalledWith(
      "student-pw",
      "New-Passw0rd!",
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.password_set_by_admin" }),
    );
  });

  it("rejects a weak password on the direct set-password route", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(administrator);
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/users/someone/set-password",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { password: "short" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("requires an administrator to set a password directly", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "teacher",
      email: "teacher@example.edu",
      displayName: "Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(teacher);
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/users/someone/set-password",
      headers: {
        authorization: "Bearer teacher",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { password: "New-Passw0rd!" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("404s admin routes for an unknown target user", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(administrator);
    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/users/ghost-uid",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it("returns dashboard stats summed from account counts", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "student-dash",
        email: "student-dash@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student Dash",
      requestedRole: "student",
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/dashboard",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    // The seeded administrator plus the newly registered student.
    expect(body.totalUsers).toBe(2);
    expect(body.usersByRole.student).toBe(1);
    expect(body.usersByRole.administrator).toBe(1);
    expect(body.workspaceUsage).toEqual([
      { workspace: "sql-workbench", totalCount: 0, dailyCounts: [] },
      { workspace: "code-compiler", totalCount: 0, dailyCounts: [] },
      { workspace: "erd-editor", totalCount: 0, dailyCounts: [] },
      { workspace: "saved-queries", totalCount: 0, dailyCounts: [] },
      { workspace: "java-gui-workspace", totalCount: 0, dailyCounts: [] },
    ]);
  });

  it("lists audit events for administrators", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, auditReader } = await setup(administrator);
    auditReader.listEvents.mockResolvedValue({
      items: [
        {
          id: crypto.randomUUID(),
          actorId: administrator.id,
          actorDisplayName: administrator.displayName,
          action: "account.active",
          targetId: administrator.id,
          result: "succeeded",
          reason: null,
          occurredAt: "2026-08-19T00:00:00.000Z",
        },
      ],
      total: 1,
    });

    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/audit-events",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ total: 1 });
  });

  it("denies teacher access to account approval", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "teacher",
      email: "teacher@example.edu",
      displayName: "Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts } = await setup(teacher);
    await accounts.register({
      identity: {
        uid: "target",
        email: "target@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Target",
      requestedRole: "teacher",
    });
    const response = await server.inject({
      method: "PATCH",
      url: "/v1/admin/users/target/status",
      headers: {
        authorization: "Bearer teacher",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { status: "active", reason: "Approved for teaching" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("PERMISSION_DENIED");
  });

  it("allows an administrator to approve a pending teacher", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts, dependencies } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "target",
        email: "target@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Target",
      requestedRole: "teacher",
    });
    const response = await server.inject({
      method: "PATCH",
      url: "/v1/admin/users/target/status",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: {
        status: "active",
        reason: "Identity verified by administrator",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "active",
      roles: ["teacher"],
    });
    expect(dependencies.claims.writeClaims).toHaveBeenCalled();
  });

  it("revokes the target's Firebase sessions when an administrator suspends them", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts, dependencies } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "target-suspend",
        email: "target-suspend@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Target Suspend",
      requestedRole: "student",
    });
    const response = await server.inject({
      method: "PATCH",
      url: "/v1/admin/users/target-suspend/status",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { status: "suspended", reason: "Violated the honor code" },
    });
    expect(response.statusCode).toBe(200);
    expect(dependencies.provisioner.revokeSessions).toHaveBeenCalledWith(
      "target-suspend",
    );
  });

  it("reports system status publicly, with only App Check required", async () => {
    const { server } = await setup();
    const missingAppCheck = await server.inject({
      method: "GET",
      url: "/v1/system/status",
    });
    expect(missingAppCheck.statusCode).toBe(403);

    const response = await server.inject({
      method: "GET",
      url: "/v1/system/status",
      headers: { "x-firebase-appcheck": "valid-app" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ maintenanceMode: false, message: null });
  });

  it("requires an administrator to toggle maintenance mode", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "teacher-1",
      email: "teacher-1@example.edu",
      displayName: "Teacher One",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(teacher);
    const response = await server.inject({
      method: "PUT",
      url: "/v1/admin/settings/maintenance",
      headers: {
        authorization: "Bearer teacher-1",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { enabled: true },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("PERMISSION_DENIED");
  });

  it("enabling maintenance mode revokes non-admin sessions and blocks them from protected routes", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, accounts, dependencies } = await setup(administrator);
    await accounts.register({
      identity: {
        uid: "student-maint",
        email: "student-maint@example.edu",
        emailVerified: true,
      },
      institutionId,
      displayName: "Student Maint",
      requestedRole: "student",
    });

    const enableResponse = await server.inject({
      method: "PUT",
      url: "/v1/admin/settings/maintenance",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { enabled: true, message: "Upgrading the database tonight." },
    });
    expect(enableResponse.statusCode).toBe(200);
    expect(enableResponse.json()).toEqual({
      maintenanceMode: true,
      message: "Upgrading the database tonight.",
    });
    expect(dependencies.provisioner.revokeSessions).toHaveBeenCalledWith(
      "student-maint",
    );
    expect(dependencies.provisioner.revokeSessions).not.toHaveBeenCalledWith(
      "admin",
    );

    const statusResponse = await server.inject({
      method: "GET",
      url: "/v1/system/status",
      headers: { "x-firebase-appcheck": "valid-app" },
    });
    expect(statusResponse.json()).toEqual({
      maintenanceMode: true,
      message: "Upgrading the database tonight.",
    });

    const blockedResponse = await server.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: {
        authorization: "Bearer student-maint",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(blockedResponse.statusCode).toBe(503);
    expect(blockedResponse.json().error.code).toBe("SYSTEM_MAINTENANCE");

    const adminStillWorks = await server.inject({
      method: "GET",
      url: "/v1/admin/users",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(adminStillWorks.statusCode).toBe(200);

    const disableResponse = await server.inject({
      method: "PUT",
      url: "/v1/admin/settings/maintenance",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { enabled: false, message: "Upgrading the database tonight." },
    });
    expect(disableResponse.statusCode).toBe(200);
    expect(disableResponse.json()).toEqual({
      maintenanceMode: false,
      message: "Upgrading the database tonight.",
    });
  });
});

describe("platform section API", () => {
  it("lists sections publicly, with only App Check required", async () => {
    const { server, sectionRepository } = await setup();
    vi.mocked(sectionRepository.listActive).mockResolvedValue([
      {
        id: "00000000-0000-4000-8000-000000000050",
        name: "BSIT-3A",
        archivedAt: null,
        createdAt: "2026-08-18T00:00:00.000Z",
        lockedWorkspaces: [],
      },
    ]);

    const missingAppCheck = await server.inject({
      method: "GET",
      url: "/v1/sections",
    });
    expect(missingAppCheck.statusCode).toBe(403);

    const response = await server.inject({
      method: "GET",
      url: "/v1/sections",
      headers: { "x-firebase-appcheck": "valid-app" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({ name: "BSIT-3A" }),
    ]);
  });

  it("requires an administrator to create or archive a section", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "teacher",
      email: "teacher@example.edu",
      displayName: "Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(teacher);
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/sections",
      headers: {
        authorization: "Bearer teacher",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { name: "BSIT-3A" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets an administrator create and archive a section", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(administrator);
    const created = await server.inject({
      method: "POST",
      url: "/v1/admin/sections",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { name: "BSIT-3A" },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ name: "BSIT-3A" });

    const sectionId = created.json().id as string;
    const archived = await server.inject({
      method: "DELETE",
      url: `/v1/admin/sections/${sectionId}`,
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(archived.statusCode).toBe(204);
    expect(sectionRepository.archive).toHaveBeenCalledWith(
      sectionId,
      institutionId,
    );
  });

  it("refuses to archive a section with accounts still assigned to it", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(administrator);
    vi.mocked(sectionRepository.countAssignedAccounts).mockResolvedValue(1);

    const response = await server.inject({
      method: "DELETE",
      url: "/v1/admin/sections/00000000-0000-4000-8000-000000000052",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_FAILED");
    expect(sectionRepository.archive).not.toHaveBeenCalled();
  });

  it("lets an administrator restore an archived section", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(administrator);
    const sectionId = "00000000-0000-4000-8000-000000000053";

    const response = await server.inject({
      method: "POST",
      url: `/v1/admin/sections/${sectionId}/restore`,
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(204);
    expect(sectionRepository.restore).toHaveBeenCalledWith(
      sectionId,
      institutionId,
    );
  });

  it("requires an administrator to restore a section", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "teacher",
      email: "teacher@example.edu",
      displayName: "Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(teacher);
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/sections/00000000-0000-4000-8000-000000000053/restore",
      headers: {
        authorization: "Bearer teacher",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(403);
  });

  it("lets an administrator update a section's locked workspaces", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(administrator);
    const sectionId = "00000000-0000-4000-8000-000000000051";
    const response = await server.inject({
      method: "PATCH",
      url: `/v1/admin/sections/${sectionId}/locked-workspaces`,
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { lockedWorkspaces: ["sql-workbench"] },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      lockedWorkspaces: ["sql-workbench"],
    });
    expect(sectionRepository.setLockedWorkspaces).toHaveBeenCalledWith(
      sectionId,
      institutionId,
      ["sql-workbench"],
    );
  });

  it("requires an administrator to update locked workspaces", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "teacher",
      email: "teacher@example.edu",
      displayName: "Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(teacher);
    const response = await server.inject({
      method: "PATCH",
      url: "/v1/admin/sections/00000000-0000-4000-8000-000000000051/locked-workspaces",
      headers: {
        authorization: "Bearer teacher",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { lockedWorkspaces: ["sql-workbench"] },
    });
    expect(response.statusCode).toBe(403);
  });
});

describe("workspace access API", () => {
  const lockedSectionId = "00000000-0000-4000-8000-000000000070";

  it("returns an empty locked list for a teacher regardless of section", async () => {
    const teacher: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "access-teacher",
      email: "access-teacher@example.edu",
      displayName: "Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: lockedSectionId,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(teacher);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["sql-workbench"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/me/workspace-access",
      headers: { authorization: "Bearer access-teacher" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ lockedWorkspaces: [] });
  });

  it("returns an empty locked list for a student with no section", async () => {
    const student: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "access-student-no-section",
      email: "access-student-no-section@example.edu",
      displayName: "Student",
      institutionId,
      status: "active",
      roles: ["student"],
      sectionId: null,
      authorizationVersion: 1,
    };
    const { server } = await setup(student);
    const response = await server.inject({
      method: "GET",
      url: "/v1/me/workspace-access",
      headers: { authorization: "Bearer access-student-no-section" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ lockedWorkspaces: [] });
  });

  it("returns the section's locked workspaces for a student in a locked section", async () => {
    const student: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "access-student",
      email: "access-student@example.edu",
      displayName: "Student",
      institutionId,
      status: "active",
      roles: ["student"],
      sectionId: lockedSectionId,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(student);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["sql-workbench", "erd-editor"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/me/workspace-access",
      headers: { authorization: "Bearer access-student" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      lockedWorkspaces: ["sql-workbench", "erd-editor"],
    });
  });
});

describe("platform workspace API", () => {
  const student: AccountProfile = {
    id: "00000000-0000-4000-8000-000000000060",
    firebaseUid: "workspace-student",
    email: "workspace-student@example.edu",
    displayName: "Workspace Student",
    institutionId,
    status: "active",
    roles: ["student"],
    sectionId: null,
    authorizationVersion: 1,
  };
  const summary = {
    id: "00000000-0000-4000-8000-000000000061",
    ownerId: student.id,
    scope: "personal" as const,
    scopeId: student.id,
    state: "requested" as const,
    quotaBytes: 100 * 1024 * 1024,
    templateVersionId: null,
    expiresAt: null,
    failureCode: null,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };

  it("accepts an App Check-protected idempotent workspace request", async () => {
    const { server, workspaceRepository } = await setup(student);
    vi.mocked(workspaceRepository.createRequested).mockResolvedValue(summary);
    const response = await server.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: {
        authorization: "Bearer workspace-student",
        "x-firebase-appcheck": "valid-app",
        "idempotency-key": "workspace-request-0001",
      },
      payload: { scope: "personal" },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      id: summary.id,
      state: "requested",
    });
  });

  it("requires App Check for workspace creation", async () => {
    const { server } = await setup(student);
    const response = await server.inject({
      method: "POST",
      url: "/v1/workspaces",
      headers: {
        authorization: "Bearer workspace-student",
        "idempotency-key": "workspace-request-0001",
      },
      payload: { scope: "personal" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("conceals another owner's workspace", async () => {
    const { server, workspaceRepository } = await setup(student);
    vi.mocked(workspaceRepository.findScoped).mockResolvedValue({
      ...summary,
      ownerId: "00000000-0000-4000-8000-000000000099",
    });
    const response = await server.inject({
      method: "GET",
      url: `/v1/workspaces/${summary.id}`,
      headers: { authorization: "Bearer workspace-student" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("issues a short-lived grant only for a ready owned workspace", async () => {
    const { server, workspaceRepository } = await setup(student);
    vi.mocked(workspaceRepository.findScoped).mockResolvedValue({
      ...summary,
      state: "ready",
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/execution-grants",
      headers: {
        authorization: "Bearer workspace-student",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { workspaceId: summary.id, requestedMode: "interactive" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().grant).toEqual(expect.any(String));
    expect(response.json().effectivePolicy.timeoutMs).toBe(10_000);
  });

  it("blocks a student in a section with sql-workbench locked", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000062";
    const lockedStudent: AccountProfile = {
      ...student,
      firebaseUid: "workspace-student-locked",
      sectionId: lockedSectionId,
    };
    const { server, sectionRepository } = await setup(lockedStudent);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["sql-workbench"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { authorization: "Bearer workspace-student-locked" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("WORKSPACE_LOCKED");
  });

  it("never blocks a teacher even when sql-workbench is locked for their section", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000063";
    const teacher: AccountProfile = {
      id: "00000000-0000-4000-8000-000000000064",
      firebaseUid: "workspace-teacher-locked",
      email: "workspace-teacher-locked@example.edu",
      displayName: "Workspace Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: lockedSectionId,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(teacher);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["sql-workbench"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/workspaces",
      headers: { authorization: "Bearer workspace-teacher-locked" },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("platform erd diagram API", () => {
  const student: AccountProfile = {
    id: "00000000-0000-4000-8000-000000000070",
    firebaseUid: "erd-student",
    email: "erd-student@example.edu",
    displayName: "ERD Student",
    institutionId,
    status: "active",
    roles: ["student"],
    sectionId: null,
    authorizationVersion: 1,
  };
  const diagram = {
    id: "00000000-0000-4000-8000-000000000071",
    ownerId: student.id,
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

  it("rejects an unauthenticated list request", async () => {
    const { server } = await setup();
    const response = await server.inject({
      method: "GET",
      url: "/v1/erd-diagrams",
    });
    expect(response.statusCode).toBe(401);
  });

  it("creates a diagram for the authenticated owner without requiring App Check", async () => {
    const { server, erdDiagramRepository } = await setup(student);
    vi.mocked(erdDiagramRepository.create).mockResolvedValue(diagram);
    const response = await server.inject({
      method: "POST",
      url: "/v1/erd-diagrams",
      headers: { authorization: "Bearer erd-student" },
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: diagram.id,
      name: diagram.name,
    });
  });

  it("conceals another owner's diagram", async () => {
    const { server, erdDiagramRepository } = await setup(student);
    vi.mocked(erdDiagramRepository.findOwned).mockResolvedValue(null);
    const response = await server.inject({
      method: "GET",
      url: `/v1/erd-diagrams/${diagram.id}`,
      headers: { authorization: "Bearer erd-student" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("saves diagram content via PUT", async () => {
    const { server, erdDiagramRepository } = await setup(student);
    vi.mocked(erdDiagramRepository.findOwned).mockResolvedValue(diagram);
    vi.mocked(erdDiagramRepository.saveContent).mockResolvedValue({
      ...diagram,
      updatedAt: "2026-08-18T01:00:00.000Z",
    });
    const response = await server.inject({
      method: "PUT",
      url: `/v1/erd-diagrams/${diagram.id}/content`,
      headers: { authorization: "Bearer erd-student" },
      payload: { content: diagram.content },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().updatedAt).toBe("2026-08-18T01:00:00.000Z");
  });

  it("deletes a diagram it owns", async () => {
    const { server, erdDiagramRepository } = await setup(student);
    vi.mocked(erdDiagramRepository.findOwned).mockResolvedValue(diagram);
    const response = await server.inject({
      method: "DELETE",
      url: `/v1/erd-diagrams/${diagram.id}`,
      headers: { authorization: "Bearer erd-student" },
    });
    expect(response.statusCode).toBe(204);
    expect(erdDiagramRepository.remove).toHaveBeenCalledWith(
      diagram.id,
      student.id,
    );
  });

  it("blocks a student in a section with erd-editor locked", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000072";
    const lockedStudent: AccountProfile = {
      ...student,
      firebaseUid: "erd-student-locked",
      sectionId: lockedSectionId,
    };
    const { server, sectionRepository } = await setup(lockedStudent);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["erd-editor"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/erd-diagrams",
      headers: { authorization: "Bearer erd-student-locked" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("WORKSPACE_LOCKED");
  });

  it("never blocks a teacher even when erd-editor is locked for their section", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000073";
    const teacher: AccountProfile = {
      id: "00000000-0000-4000-8000-000000000074",
      firebaseUid: "erd-teacher-locked",
      email: "erd-teacher-locked@example.edu",
      displayName: "ERD Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: lockedSectionId,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(teacher);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["erd-editor"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/erd-diagrams",
      headers: { authorization: "Bearer erd-teacher-locked" },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("platform code workspace API", () => {
  const student: AccountProfile = {
    id: "00000000-0000-4000-8000-000000000080",
    firebaseUid: "code-student",
    email: "code-student@example.edu",
    displayName: "Code Student",
    institutionId,
    status: "active",
    roles: ["student"],
    sectionId: null,
    authorizationVersion: 1,
  };
  const workspace = {
    ownerId: student.id,
    content: {
      root: {
        id: "root",
        kind: "folder" as const,
        name: "My files",
        children: [],
      },
      expanded: [],
      openFileIds: [],
      activeFileId: "",
    },
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };

  it("rejects an unauthenticated request", async () => {
    const { server } = await setup();
    const response = await server.inject({
      method: "GET",
      url: "/v1/code-workspace",
    });
    expect(response.statusCode).toBe(401);
  });

  it("gets or creates the caller's own workspace", async () => {
    const { server, codeWorkspaceRepository } = await setup(student);
    vi.mocked(codeWorkspaceRepository.getOrCreate).mockResolvedValue(workspace);
    const response = await server.inject({
      method: "GET",
      url: "/v1/code-workspace",
      headers: { authorization: "Bearer code-student" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ownerId).toBe(student.id);
  });

  it("saves workspace content via PUT", async () => {
    const { server, codeWorkspaceRepository } = await setup(student);
    vi.mocked(codeWorkspaceRepository.save).mockResolvedValue({
      ...workspace,
      updatedAt: "2026-08-18T01:00:00.000Z",
    });
    const response = await server.inject({
      method: "PUT",
      url: "/v1/code-workspace",
      headers: { authorization: "Bearer code-student" },
      payload: { content: workspace.content },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().updatedAt).toBe("2026-08-18T01:00:00.000Z");
    expect(codeWorkspaceRepository.save).toHaveBeenCalledWith(
      institutionId,
      student.id,
      workspace.content,
    );
  });

  it("blocks a student in a section with code-compiler locked", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000082";
    const lockedStudent: AccountProfile = {
      ...student,
      firebaseUid: "code-student-locked",
      sectionId: lockedSectionId,
    };
    const { server, sectionRepository } = await setup(lockedStudent);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["code-compiler"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/code-workspace",
      headers: { authorization: "Bearer code-student-locked" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("WORKSPACE_LOCKED");
  });

  it("never blocks a teacher even when code-compiler is locked for their section", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000083";
    const teacher: AccountProfile = {
      id: "00000000-0000-4000-8000-000000000084",
      firebaseUid: "code-teacher-locked",
      email: "code-teacher-locked@example.edu",
      displayName: "Code Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: lockedSectionId,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(teacher);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["code-compiler"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/code-workspace",
      headers: { authorization: "Bearer code-teacher-locked" },
    });
    expect(response.statusCode).toBe(200);
  });
});

describe("platform interactive run grants", () => {
  const student: AccountProfile = {
    id: "00000000-0000-4000-8000-000000000096",
    firebaseUid: "interactive-student",
    email: "interactive@example.edu",
    displayName: "Interactive Student",
    institutionId,
    status: "active",
    roles: ["student"],
    sectionId: null,
    authorizationVersion: 1,
  };

  it("issues a grant to an active Code Compiler user", async () => {
    const { server, executionGrantSigner } = await setup(student);
    const response = await server.inject({
      method: "POST",
      url: "/v1/interactive-run-grants",
      headers: {
        authorization: "Bearer interactive-student",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.expiresAt).toBeTypeOf("string");
    expect(executionGrantSigner.verifyInteractiveRun(body.token)).toMatchObject(
      {
        accountId: student.id,
        kind: "interactive-run",
      },
    );
  });

  it("does not issue a grant when Code Compiler is locked", async () => {
    const sectionId = "00000000-0000-4000-8000-000000000097";
    const { server, sectionRepository } = await setup({
      ...student,
      firebaseUid: "interactive-student-locked",
      sectionId,
    });
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: sectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["code-compiler"],
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/interactive-run-grants",
      headers: {
        authorization: "Bearer interactive-student-locked",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("WORKSPACE_LOCKED");
  });
});

describe("platform gui workspace/session API", () => {
  const student: AccountProfile = {
    id: "00000000-0000-4000-8000-000000000085",
    firebaseUid: "gui-student",
    email: "gui-student@example.edu",
    displayName: "Gui Student",
    institutionId,
    status: "active",
    roles: ["student"],
    sectionId: null,
    authorizationVersion: 1,
  };
  const mainFileId = "00000000-0000-4000-8000-000000000086";
  const content = {
    files: [
      {
        id: mainFileId,
        name: "Main.java",
        sourceCode: "public class Main {}",
      },
    ],
    openFileIds: [mainFileId],
    activeFileId: mainFileId,
    mainFileId,
  };
  const workspace = {
    ownerId: student.id,
    content,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };

  it("rejects an unauthenticated gui-workspace request", async () => {
    const { server } = await setup();
    const response = await server.inject({
      method: "GET",
      url: "/v1/gui-workspace",
    });
    expect(response.statusCode).toBe(401);
  });

  it("gets or creates the caller's own gui workspace", async () => {
    const { server, guiWorkspaceRepository } = await setup(student);
    vi.mocked(guiWorkspaceRepository.getOrCreate).mockResolvedValue(workspace);
    const response = await server.inject({
      method: "GET",
      url: "/v1/gui-workspace",
      headers: { authorization: "Bearer gui-student" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().ownerId).toBe(student.id);
  });

  it("saves gui workspace content via PUT", async () => {
    const { server, guiWorkspaceRepository } = await setup(student);
    vi.mocked(guiWorkspaceRepository.save).mockResolvedValue({
      ...workspace,
      updatedAt: "2026-08-18T01:00:00.000Z",
    });
    const response = await server.inject({
      method: "PUT",
      url: "/v1/gui-workspace",
      headers: { authorization: "Bearer gui-student" },
      payload: { content },
    });
    expect(response.statusCode).toBe(200);
    expect(guiWorkspaceRepository.save).toHaveBeenCalledWith(
      institutionId,
      student.id,
      content,
    );
  });

  it("blocks a student in a section with java-gui-workspace locked", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000087";
    const lockedStudent: AccountProfile = {
      ...student,
      firebaseUid: "gui-student-locked",
      sectionId: lockedSectionId,
    };
    const { server, sectionRepository } = await setup(lockedStudent);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["java-gui-workspace"],
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/gui-workspace",
      headers: { authorization: "Bearer gui-student-locked" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("WORKSPACE_LOCKED");
  });

  it("creates a session, saving the submitted content and minting a grant", async () => {
    const { server, guiWorkspaceRepository, guiSessionRepository } =
      await setup(student);
    const response = await server.inject({
      method: "POST",
      url: "/v1/gui-sessions",
      headers: { authorization: "Bearer gui-student" },
      payload: { content },
    });
    expect(response.statusCode).toBe(202);
    const body = response.json();
    expect(body.state).toBe("requested");
    expect(body.mainClassName).toBe("Main");
    expect(typeof body.grant).toBe("string");
    expect(guiWorkspaceRepository.save).toHaveBeenCalledWith(
      institutionId,
      student.id,
      content,
    );
    expect(guiSessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: student.id, mainClassName: "Main" }),
    );
  });

  it("rejects creating a session with no main file marked", async () => {
    const { server } = await setup(student);
    const response = await server.inject({
      method: "POST",
      url: "/v1/gui-sessions",
      headers: { authorization: "Bearer gui-student" },
      payload: { content: { ...content, mainFileId: null } },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_FAILED");
  });

  it("blocks creating a session for a student with java-gui-workspace locked", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000088";
    const lockedStudent: AccountProfile = {
      ...student,
      firebaseUid: "gui-student-locked-session",
      sectionId: lockedSectionId,
    };
    const { server, sectionRepository } = await setup(lockedStudent);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["java-gui-workspace"],
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/gui-sessions",
      headers: { authorization: "Bearer gui-student-locked-session" },
      payload: { content },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("WORKSPACE_LOCKED");
  });

  it("gets a session's current state without ever returning a grant", async () => {
    const { server, guiSessionRepository } = await setup(student);
    const sessionId = "00000000-0000-4000-8000-000000000089";
    vi.mocked(guiSessionRepository.get).mockResolvedValue({
      id: sessionId,
      ownerId: student.id,
      state: "running",
      mainClassName: "Main",
      maxRuntimeSeconds: 600,
      failureCode: null,
      startedAt: "2026-08-24T00:00:00.000Z",
      endsAt: "2026-08-24T00:10:00.000Z",
      createdAt: "2026-08-24T00:00:00.000Z",
    });
    const response = await server.inject({
      method: "GET",
      url: `/v1/gui-sessions/${sessionId}`,
      headers: { authorization: "Bearer gui-student" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ state: "running", grant: null });
  });

  it("404s getting a session owned by someone else", async () => {
    const { server, guiSessionRepository } = await setup(student);
    const sessionId = "00000000-0000-4000-8000-000000000089";
    vi.mocked(guiSessionRepository.get).mockResolvedValue({
      id: sessionId,
      ownerId: "00000000-0000-4000-8000-000000000099",
      state: "running",
      mainClassName: "Main",
      maxRuntimeSeconds: 600,
      failureCode: null,
      startedAt: null,
      endsAt: null,
      createdAt: "2026-08-24T00:00:00.000Z",
    });
    const response = await server.inject({
      method: "GET",
      url: `/v1/gui-sessions/${sessionId}`,
      headers: { authorization: "Bearer gui-student" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("stops the caller's own session", async () => {
    const { server, guiSessionRepository } = await setup(student);
    const sessionId = "00000000-0000-4000-8000-000000000089";
    vi.mocked(guiSessionRepository.get).mockResolvedValue({
      id: sessionId,
      ownerId: student.id,
      state: "running",
      mainClassName: "Main",
      maxRuntimeSeconds: 600,
      failureCode: null,
      startedAt: "2026-08-24T00:00:00.000Z",
      endsAt: "2026-08-24T00:10:00.000Z",
      createdAt: "2026-08-24T00:00:00.000Z",
    });
    const response = await server.inject({
      method: "DELETE",
      url: `/v1/gui-sessions/${sessionId}`,
      headers: { authorization: "Bearer gui-student" },
    });
    expect(response.statusCode).toBe(204);
    expect(guiSessionRepository.markStopped).toHaveBeenCalledWith(sessionId);
  });
});

describe("platform saved query API", () => {
  const student: AccountProfile = {
    id: "00000000-0000-4000-8000-000000000090",
    firebaseUid: "query-student",
    email: "query-student@example.edu",
    displayName: "Query Student",
    institutionId,
    status: "active",
    roles: ["student"],
    sectionId: null,
    authorizationVersion: 1,
  };
  const workspaceSummary = {
    id: "00000000-0000-4000-8000-000000000091",
    ownerId: student.id,
    scope: "personal" as const,
    scopeId: student.id,
    state: "ready" as const,
    quotaBytes: 100 * 1024 * 1024,
    templateVersionId: null,
    expiresAt: null,
    failureCode: null,
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };
  const savedQuery = {
    id: "00000000-0000-4000-8000-000000000092",
    ownerId: student.id,
    workspaceId: workspaceSummary.id,
    name: "Top students",
    sql: "SELECT * FROM students ORDER BY score DESC LIMIT 10;",
    createdAt: "2026-08-18T00:00:00.000Z",
    updatedAt: "2026-08-18T00:00:00.000Z",
  };

  it("rejects an unauthenticated list request", async () => {
    const { server } = await setup();
    const response = await server.inject({
      method: "GET",
      url: `/v1/saved-queries?workspaceId=${workspaceSummary.id}`,
    });
    expect(response.statusCode).toBe(401);
  });

  it("refuses to save a query against a workspace the caller doesn't own", async () => {
    const { server, workspaceRepository, savedQueryRepository } =
      await setup(student);
    vi.mocked(workspaceRepository.findScoped).mockResolvedValue({
      ...workspaceSummary,
      ownerId: "00000000-0000-4000-8000-000000000099",
    });
    const response = await server.inject({
      method: "POST",
      url: "/v1/saved-queries",
      headers: { authorization: "Bearer query-student" },
      payload: {
        workspaceId: workspaceSummary.id,
        name: savedQuery.name,
        sql: savedQuery.sql,
      },
    });
    expect(response.statusCode).toBe(404);
    expect(savedQueryRepository.create).not.toHaveBeenCalled();
  });

  it("saves a query against the caller's own workspace", async () => {
    const { server, workspaceRepository, savedQueryRepository } =
      await setup(student);
    vi.mocked(workspaceRepository.findScoped).mockResolvedValue(
      workspaceSummary,
    );
    vi.mocked(savedQueryRepository.create).mockResolvedValue(savedQuery);
    const response = await server.inject({
      method: "POST",
      url: "/v1/saved-queries",
      headers: { authorization: "Bearer query-student" },
      payload: {
        workspaceId: workspaceSummary.id,
        name: savedQuery.name,
        sql: savedQuery.sql,
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      id: savedQuery.id,
      name: savedQuery.name,
    });
  });

  it("conceals another owner's saved query", async () => {
    const { server, savedQueryRepository } = await setup(student);
    vi.mocked(savedQueryRepository.findOwned).mockResolvedValue(null);
    const response = await server.inject({
      method: "PATCH",
      url: `/v1/saved-queries/${savedQuery.id}`,
      headers: { authorization: "Bearer query-student" },
      payload: { name: "Renamed" },
    });
    expect(response.statusCode).toBe(404);
  });

  it("deletes a saved query it owns", async () => {
    const { server, savedQueryRepository } = await setup(student);
    vi.mocked(savedQueryRepository.findOwned).mockResolvedValue(savedQuery);
    const response = await server.inject({
      method: "DELETE",
      url: `/v1/saved-queries/${savedQuery.id}`,
      headers: { authorization: "Bearer query-student" },
    });
    expect(response.statusCode).toBe(204);
    expect(savedQueryRepository.remove).toHaveBeenCalledWith(
      savedQuery.id,
      student.id,
    );
  });

  it("blocks a student in a section with saved-queries locked", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000093";
    const lockedStudent: AccountProfile = {
      ...student,
      firebaseUid: "query-student-locked",
      sectionId: lockedSectionId,
    };
    const { server, sectionRepository } = await setup(lockedStudent);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["saved-queries"],
    });
    const response = await server.inject({
      method: "GET",
      url: `/v1/saved-queries?workspaceId=${workspaceSummary.id}`,
      headers: { authorization: "Bearer query-student-locked" },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("WORKSPACE_LOCKED");
  });

  it("never blocks a teacher even when saved-queries is locked for their section", async () => {
    const lockedSectionId = "00000000-0000-4000-8000-000000000094";
    const teacher: AccountProfile = {
      id: "00000000-0000-4000-8000-000000000095",
      firebaseUid: "query-teacher-locked",
      email: "query-teacher-locked@example.edu",
      displayName: "Query Teacher",
      institutionId,
      status: "active",
      roles: ["teacher"],
      sectionId: lockedSectionId,
      authorizationVersion: 1,
    };
    const { server, sectionRepository } = await setup(teacher);
    vi.mocked(sectionRepository.findById).mockResolvedValue({
      id: lockedSectionId,
      name: "BSIT-3A",
      archivedAt: null,
      createdAt: "2026-08-18T00:00:00.000Z",
      lockedWorkspaces: ["saved-queries"],
    });
    const response = await server.inject({
      method: "GET",
      url: `/v1/saved-queries?workspaceId=${workspaceSummary.id}`,
      headers: { authorization: "Bearer query-teacher-locked" },
    });
    expect(response.statusCode).toBe(200);
  });
});
