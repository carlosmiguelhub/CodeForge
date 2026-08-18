import type {
  AccountProfile,
  AccountRepository,
  IdentityServiceDependencies,
  RegistrationInput,
} from "@sqweb/auth";
import { IdentityService } from "@sqweb/auth";
import type { ClassroomRepository } from "@sqweb/classroom";
import { ClassroomService } from "@sqweb/classroom";
import type { WorkspaceRepository } from "@sqweb/workspace";
import { WorkspaceService } from "@sqweb/workspace";
import { ExecutionGrantSigner } from "@sqweb/execution";
import type { AccountStatus, ClassSummary } from "@sqweb/contracts";
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
      authorizationVersion: 1,
    };
    this.accounts.set(profile.firebaseUid, profile);
    return profile;
  }

  async listPending(institutionId: string) {
    return [...this.accounts.values()].filter(
      (account) =>
        account.institutionId === institutionId &&
        account.status === "pending_approval",
    );
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
}

const servers: Array<Awaited<ReturnType<typeof buildServer>>> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function setup(actor?: AccountProfile) {
  const accounts = new MemoryAccounts();
  if (actor) accounts.accounts.set(actor.firebaseUid, actor);
  const dependencies: IdentityServiceDependencies = {
    accounts,
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
    institutionId,
  };
  const identity = new IdentityService(dependencies);
  const classroomRepository: ClassroomRepository = {
    listAcademicOptions: vi.fn().mockResolvedValue({ courses: [], terms: [] }),
    listAcademicCatalog: vi.fn().mockResolvedValue({
      departments: [],
      programs: [],
      courses: [],
      terms: [],
    }),
    createDepartment: vi.fn(),
    createProgram: vi.fn(),
    createCourse: vi.fn(),
    createTerm: vi.fn(),
    listScoped: vi.fn().mockResolvedValue([]),
    findScoped: vi.fn().mockResolvedValue(null),
    canAccess: vi.fn().mockResolvedValue(false),
    create: vi.fn(),
    update: vi.fn(),
    createInvitation: vi.fn(),
    findInvitation: vi.fn().mockResolvedValue(null),
    revokeInvitation: vi.fn().mockResolvedValue(false),
    joinWithInvitation: vi.fn(),
    listRoster: vi.fn().mockResolvedValue([]),
    changeEnrollment: vi.fn(),
  };
  const workspaceRepository: WorkspaceRepository = {
    findByIdempotencyKey: vi.fn().mockResolvedValue(null),
    findScoped: vi.fn().mockResolvedValue(null),
    findOwnedScope: vi.fn().mockResolvedValue(null),
    findResetByIdempotencyKey: vi.fn().mockResolvedValue(null),
    listOwned: vi.fn().mockResolvedValue([]),
    createRequested: vi.fn(),
    requestReset: vi.fn(),
  };
  const server = await buildServer({
    identity,
    classroom: new ClassroomService({
      identity,
      classroom: classroomRepository,
      audit: dependencies.audit,
    }),
    workspace: new WorkspaceService({
      identity,
      workspaces: workspaceRepository,
      audit: dependencies.audit,
    }),
    executionGrantSigner: new ExecutionGrantSigner(
      "test-execution-secret-that-is-at-least-32-chars",
    ),
    allowedOrigins: ["http://localhost:3000"],
    logger: false,
  });
  servers.push(server);
  return {
    server,
    accounts,
    classroomRepository,
    workspaceRepository,
    dependencies,
  };
}

function classroomSummary(owner: AccountProfile): ClassSummary {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    institutionId,
    courseId: "00000000-0000-4000-8000-000000000011",
    courseCode: "DB101",
    courseTitle: "Database Fundamentals",
    termId: "00000000-0000-4000-8000-000000000012",
    termName: "First Term",
    section: "A",
    ownerTeacherId: owner.id,
    ownerTeacherName: owner.displayName,
    status: "active",
    enrolledCount: 0,
    createdAt: "2026-08-18T00:00:00.000Z",
  };
}

describe("platform identity API", () => {
  it("rejects an unauthenticated profile request", async () => {
    const { server } = await setup();
    const response = await server.inject({ method: "GET", url: "/v1/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED");
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

  it("requires administrator role and App Check to list pending accounts", async () => {
    const administrator: AccountProfile = {
      id: crypto.randomUUID(),
      firebaseUid: "admin",
      email: "admin@example.edu",
      displayName: "Administrator",
      institutionId,
      status: "active",
      roles: ["administrator"],
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
      url: "/v1/admin/users/pending",
      headers: { authorization: "Bearer admin" },
    });
    expect(missingAppCheck.statusCode).toBe(403);

    const response = await server.inject({
      method: "GET",
      url: "/v1/admin/users/pending",
      headers: {
        authorization: "Bearer admin",
        "x-firebase-appcheck": "valid-app",
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      expect.objectContaining({
        firebaseUid: "pending",
        status: "pending_approval",
      }),
    ]);
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
});

describe("platform classroom API", () => {
  const teacher: AccountProfile = {
    id: "00000000-0000-4000-8000-000000000020",
    firebaseUid: "class-teacher",
    email: "teacher@example.edu",
    displayName: "Class Teacher",
    institutionId,
    status: "active",
    roles: ["teacher"],
    authorizationVersion: 1,
  };

  const student: AccountProfile = {
    id: "00000000-0000-4000-8000-000000000021",
    firebaseUid: "class-student",
    email: "student@example.edu",
    displayName: "Class Student",
    institutionId,
    status: "active",
    roles: ["student"],
    authorizationVersion: 1,
  };

  it("returns only the repository's role-scoped class list", async () => {
    const { server, classroomRepository } = await setup(student);
    const summary = classroomSummary(teacher);
    vi.mocked(classroomRepository.listScoped).mockResolvedValue([summary]);
    const response = await server.inject({
      method: "GET",
      url: "/v1/classes",
      headers: { authorization: "Bearer class-student" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([summary]);
    expect(classroomRepository.listScoped).toHaveBeenCalledWith(student);
  });

  it("requires App Check and Teacher authority to create a class", async () => {
    const { server, classroomRepository } = await setup(teacher);
    const summary = classroomSummary(teacher);
    vi.mocked(classroomRepository.create).mockResolvedValue(summary);
    const payload = {
      courseId: summary.courseId,
      termId: summary.termId,
      section: "A",
    };

    const withoutAppCheck = await server.inject({
      method: "POST",
      url: "/v1/classes",
      headers: { authorization: "Bearer class-teacher" },
      payload,
    });
    expect(withoutAppCheck.statusCode).toBe(403);

    const response = await server.inject({
      method: "POST",
      url: "/v1/classes",
      headers: {
        authorization: "Bearer class-teacher",
        "x-firebase-appcheck": "valid-app",
      },
      payload,
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual(summary);
  });

  it("denies Student class creation", async () => {
    const { server } = await setup(student);
    const summary = classroomSummary(teacher);
    const response = await server.inject({
      method: "POST",
      url: "/v1/classes",
      headers: {
        authorization: "Bearer class-student",
        "x-firebase-appcheck": "valid-app",
      },
      payload: {
        courseId: summary.courseId,
        termId: summary.termId,
        section: "A",
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("PERMISSION_DENIED");
  });

  it("joins a Student through an App Check-protected invitation", async () => {
    const { server, classroomRepository } = await setup(student);
    const summary = classroomSummary(teacher);
    vi.mocked(classroomRepository.joinWithInvitation).mockResolvedValue({
      ...summary,
      enrolledCount: 1,
    });
    const response = await server.inject({
      method: "POST",
      url: `/v1/classes/${summary.id}/join`,
      headers: {
        authorization: "Bearer class-student",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { code: `${summary.id}.${"A".repeat(32)}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().enrolledCount).toBe(1);
  });

  it("conceals a roster from a non-owner Teacher", async () => {
    const { server, classroomRepository } = await setup(teacher);
    vi.mocked(classroomRepository.findScoped).mockResolvedValue({
      ...classroomSummary(teacher),
      ownerTeacherId: "00000000-0000-4000-8000-000000000099",
    });
    const response = await server.inject({
      method: "GET",
      url: "/v1/classes/00000000-0000-4000-8000-000000000010/roster",
      headers: { authorization: "Bearer class-teacher" },
    });
    expect(response.statusCode).toBe(404);
    expect(classroomRepository.listRoster).not.toHaveBeenCalled();
  });

  it("denies Teacher access to Administrator academic catalog mutation", async () => {
    const { server } = await setup(teacher);
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/academics/departments",
      headers: {
        authorization: "Bearer class-teacher",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { code: "CCS", name: "College of Computing Studies" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("allows an Administrator to create an audited academic record", async () => {
    const administrator: AccountProfile = {
      ...teacher,
      id: "00000000-0000-4000-8000-000000000022",
      firebaseUid: "academic-admin",
      roles: ["administrator"],
    };
    const { server, classroomRepository, dependencies } =
      await setup(administrator);
    const departmentId = "00000000-0000-4000-8000-000000000023";
    vi.mocked(classroomRepository.createDepartment).mockResolvedValue(
      departmentId,
    );
    const response = await server.inject({
      method: "POST",
      url: "/v1/admin/academics/departments",
      headers: {
        authorization: "Bearer academic-admin",
        "x-firebase-appcheck": "valid-app",
      },
      payload: { code: "CCS", name: "College of Computing Studies" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: departmentId });
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "academic.department_created" }),
    );
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
});
