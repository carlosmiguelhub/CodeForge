import type { Role } from "@sqweb/contracts";
import { describe, expect, it, vi } from "vitest";

import { AuthorizationError } from "./errors";
import { IdentityService } from "./identity-service";
import type { AccountProfile, IdentityServiceDependencies } from "./index";

const institutionId = "00000000-0000-4000-8000-000000000001";

function account(overrides: Partial<AccountProfile> = {}): AccountProfile {
  return {
    id: "00000000-0000-4000-8000-000000000010",
    firebaseUid: "firebase-user",
    email: "teacher@example.edu",
    displayName: "Teacher",
    institutionId,
    status: "active",
    roles: ["teacher"],
    authorizationVersion: 1,
    ...overrides,
  };
}

function setup(profile: AccountProfile | null = account()) {
  const dependencies: IdentityServiceDependencies = {
    accounts: {
      findByFirebaseUid: vi.fn().mockResolvedValue(profile),
      listPending: vi.fn().mockResolvedValue([]),
      register: vi.fn().mockImplementation(async (input) =>
        account({
          firebaseUid: input.identity.uid,
          email: input.identity.email,
          displayName: input.displayName,
          roles: [input.requestedRole] as Role[],
          status:
            input.requestedRole === "student" ? "active" : "pending_approval",
        }),
      ),
      changeStatus: vi
        .fn()
        .mockImplementation(async ({ nextStatus }) =>
          account({ status: nextStatus }),
        ),
    },
    tokens: {
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "firebase-user",
        email: "teacher@example.edu",
        emailVerified: true,
      }),
    },
    appCheck: { verifyToken: vi.fn().mockResolvedValue(undefined) },
    claims: { writeClaims: vi.fn().mockResolvedValue(undefined) },
    audit: { record: vi.fn().mockResolvedValue(undefined) },
    institutionId,
  };
  return { service: new IdentityService(dependencies), dependencies };
}

describe("IdentityService", () => {
  it("rejects malformed bearer credentials", async () => {
    const { service } = setup();
    await expect(service.verifyBearer("Basic value")).rejects.toMatchObject({
      code: "AUTHENTICATION_REQUIRED",
      statusCode: 401,
    } satisfies Partial<AuthorizationError>);
  });

  it("keeps pending teachers out of active routes", async () => {
    const { service } = setup(account({ status: "pending_approval" }));
    await expect(
      service.requireActiveAccount({
        uid: "firebase-user",
        email: "teacher@example.edu",
        emailVerified: true,
      }),
    ).rejects.toMatchObject({ code: "ACCOUNT_PENDING_APPROVAL" });
  });

  it("denies a teacher from administrator policy", async () => {
    const { service } = setup();
    await expect(
      service.requireActiveAccount(
        {
          uid: "firebase-user",
          email: "teacher@example.edu",
          emailVerified: true,
        },
        ["administrator"],
      ),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("registers a verified student as an active account", async () => {
    const { service, dependencies } = setup(null);
    const result = await service.register(
      { uid: "new-student", email: "student@example.edu", emailVerified: true },
      "Student Name",
      "student",
    );

    expect(result.status).toBe("active");
    expect(dependencies.claims.writeClaims).toHaveBeenCalledWith(result);
  });

  it("registers a verified teacher as pending approval", async () => {
    const { service } = setup(null);
    const result = await service.register(
      { uid: "new-teacher", email: "teacher@example.edu", emailVerified: true },
      "Teacher Name",
      "teacher",
    );
    expect(result.status).toBe("pending_approval");
  });

  it("requires App Check for protected mutations", async () => {
    const { service } = setup();
    await expect(service.verifyAppCheck(undefined)).rejects.toMatchObject({
      code: "PERMISSION_DENIED",
    });
  });
});
