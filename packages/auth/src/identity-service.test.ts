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
    sectionId: null,
    authorizationVersion: 1,
    ...overrides,
  };
}

function setup(profile: AccountProfile | null = account()) {
  const dependencies: IdentityServiceDependencies = {
    accounts: {
      findByFirebaseUid: vi.fn().mockResolvedValue(profile),
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
      updateDisplayName: vi
        .fn()
        .mockImplementation(async (_firebaseUid, displayName) =>
          account({ displayName }),
        ),
      listAccounts: vi.fn().mockResolvedValue({ items: [], total: 0 }),
      createByAdmin: vi.fn().mockImplementation(async (input) =>
        account({
          firebaseUid: input.firebaseUid,
          email: input.email,
          displayName: input.displayName,
          roles: input.roles,
          status: "active",
        }),
      ),
      assignRole: vi.fn().mockImplementation(async ({ role }) =>
        account({ roles: [...account().roles, role] }),
      ),
      assignSection: vi
        .fn()
        .mockImplementation(async (_firebaseUid, _institutionId, sectionId) =>
          account({ sectionId }),
        ),
      removeRole: vi.fn().mockImplementation(async () => account({ roles: [] })),
      deleteAccount: vi.fn().mockResolvedValue(undefined),
      countByRole: vi
        .fn()
        .mockResolvedValue({ student: 0, teacher: 0, administrator: 0 }),
      countByStatus: vi.fn().mockResolvedValue({
        pending_verification: 0,
        pending_approval: 0,
        active: 0,
        suspended: 0,
        deactivated: 0,
      }),
      listActiveFirebaseUidsExcludingRole: vi.fn().mockResolvedValue([]),
    },
    institutions: {
      getMaintenanceState: vi
        .fn()
        .mockResolvedValue({ enabled: false, message: null }),
      setMaintenanceState: vi.fn().mockResolvedValue(undefined),
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
    provisioner: {
      createUser: vi.fn().mockResolvedValue({ firebaseUid: "new-firebase-uid" }),
      deleteUser: vi.fn().mockResolvedValue(undefined),
      setPassword: vi.fn().mockResolvedValue(undefined),
      revokeSessions: vi.fn().mockResolvedValue(undefined),
    },
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
    const sectionId = "00000000-0000-4000-8000-000000000030";
    const result = await service.register(
      { uid: "new-student", email: "student@example.edu", emailVerified: true },
      "Student Name",
      "student",
      sectionId,
    );

    expect(result.status).toBe("active");
    expect(dependencies.claims.writeClaims).toHaveBeenCalledWith(result);
    expect(dependencies.accounts.register).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId }),
    );
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

  it("updates a display name and records an audit event", async () => {
    const { service, dependencies } = setup();
    const result = await service.updateProfile(
      {
        uid: "firebase-user",
        email: "teacher@example.edu",
        emailVerified: true,
      },
      "New Name",
    );

    expect(result.displayName).toBe("New Name");
    expect(dependencies.accounts.updateDisplayName).toHaveBeenCalledWith(
      "firebase-user",
      "New Name",
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.profile_updated" }),
    );
  });

  it("rejects a profile update for an unregistered identity", async () => {
    const { service } = setup(null);
    await expect(
      service.updateProfile(
        { uid: "ghost", email: "ghost@example.edu", emailVerified: true },
        "New Name",
      ),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  const administratorIdentity = {
    uid: "firebase-user",
    email: "teacher@example.edu",
    emailVerified: true,
  };

  it("denies a non-administrator from listing accounts", async () => {
    const { service } = setup();
    await expect(
      service.listAccounts(administratorIdentity, { page: 1, pageSize: 20 }),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("echoes the requested page and pageSize back on the account list", async () => {
    const { service } = setup(account({ roles: ["administrator"] }));
    const result = await service.listAccounts(administratorIdentity, {
      page: 2,
      pageSize: 5,
    });
    expect(result).toMatchObject({ page: 2, pageSize: 5, total: 0 });
  });

  it("404s account detail for an unknown target", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    // setup()'s default mock resolves the same profile regardless of the
    // uid passed in — branch it here so the actor's own lookup still
    // succeeds but the target lookup genuinely misses.
    vi.mocked(dependencies.accounts.findByFirebaseUid).mockImplementation(
      async (firebaseUid) =>
        firebaseUid === "firebase-user"
          ? account({ roles: ["administrator"] })
          : null,
    );
    await expect(
      service.getAccountDetail(administratorIdentity, "ghost-uid"),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("creates an account through the provisioner, writes claims, and audits it", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    const created = await service.createAccount(administratorIdentity, {
      email: "new@example.edu",
      displayName: "New Person",
      roles: ["student", "teacher"],
    });

    expect(dependencies.provisioner.createUser).toHaveBeenCalledWith({
      email: "new@example.edu",
      displayName: "New Person",
    });
    expect(dependencies.accounts.createByAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        firebaseUid: "new-firebase-uid",
        roles: ["student", "teacher"],
      }),
    );
    expect(dependencies.claims.writeClaims).toHaveBeenCalledWith(created);
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.created_by_admin" }),
    );
    expect(created.status).toBe("active");
  });

  it("rolls back the Firebase user if the database insert fails", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    vi.mocked(dependencies.accounts.createByAdmin).mockRejectedValueOnce(
      new Error("db unavailable"),
    );

    await expect(
      service.createAccount(administratorIdentity, {
        email: "new@example.edu",
        displayName: "New Person",
        roles: ["student"],
      }),
    ).rejects.toThrow("db unavailable");
    expect(dependencies.provisioner.deleteUser).toHaveBeenCalledWith(
      "new-firebase-uid",
    );
  });

  it("assigns a role and audits it", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    await service.assignRole(administratorIdentity, "firebase-user", "teacher");
    expect(dependencies.accounts.assignRole).toHaveBeenCalledWith(
      expect.objectContaining({ role: "teacher" }),
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "role.assigned", reason: "teacher" }),
    );
  });

  it("assigns a section and audits it", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    const sectionId = "00000000-0000-4000-8000-000000000030";
    await service.assignSection(administratorIdentity, "firebase-user", sectionId);
    expect(dependencies.accounts.assignSection).toHaveBeenCalledWith(
      "firebase-user",
      institutionId,
      sectionId,
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.section_assigned",
        reason: sectionId,
      }),
    );
  });

  it("assigns no section (null) and audits it", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    await service.assignSection(administratorIdentity, "firebase-user", null);
    expect(dependencies.accounts.assignSection).toHaveBeenCalledWith(
      "firebase-user",
      institutionId,
      null,
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.section_assigned",
        reason: "none",
      }),
    );
  });

  it("404s assigning a section for an unknown target", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    vi.mocked(dependencies.accounts.findByFirebaseUid).mockImplementation(
      async (firebaseUid) =>
        firebaseUid === "firebase-user"
          ? account({ roles: ["administrator"] })
          : null,
    );
    await expect(
      service.assignSection(administratorIdentity, "ghost-uid", null),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
  });

  it("requires an administrator to assign a section", async () => {
    const { service } = setup();
    await expect(
      service.assignSection(administratorIdentity, "firebase-user", null),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("blocks removing a user's last remaining role", async () => {
    const { service } = setup(
      account({ roles: ["administrator"], id: "target-id" }),
    );
    await expect(
      service.removeRole(administratorIdentity, "firebase-user", "administrator"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
  });

  it("deletes an account, removes the Firebase user, and audits it", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    vi.mocked(dependencies.accounts.findByFirebaseUid).mockImplementation(
      async (firebaseUid) =>
        firebaseUid === "firebase-user"
          ? account({ roles: ["administrator"] })
          : account({ firebaseUid: "target-uid", roles: ["student"] }),
    );
    await service.deleteAccount(administratorIdentity, "target-uid");
    expect(dependencies.accounts.deleteAccount).toHaveBeenCalledWith(
      "target-uid",
    );
    expect(dependencies.provisioner.deleteUser).toHaveBeenCalledWith(
      "target-uid",
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.deleted" }),
    );
  });

  it("refuses to delete the caller's own account", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    await expect(
      service.deleteAccount(administratorIdentity, "firebase-user"),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(dependencies.accounts.deleteAccount).not.toHaveBeenCalled();
  });

  it("404s deleting an unknown account", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    vi.mocked(dependencies.accounts.findByFirebaseUid).mockImplementation(
      async (firebaseUid) =>
        firebaseUid === "firebase-user"
          ? account({ roles: ["administrator"] })
          : null,
    );
    await expect(
      service.deleteAccount(administratorIdentity, "ghost-uid"),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(dependencies.accounts.deleteAccount).not.toHaveBeenCalled();
  });

  it("requires an administrator to delete an account", async () => {
    const { service } = setup();
    await expect(
      service.deleteAccount(administratorIdentity, "target-uid"),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("sets an account's password directly through the provisioner and audits it", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    vi.mocked(dependencies.accounts.findByFirebaseUid).mockImplementation(
      async (firebaseUid) =>
        firebaseUid === "firebase-user"
          ? account({ roles: ["administrator"] })
          : account({ firebaseUid: "target-uid", roles: ["student"] }),
    );
    await service.setAccountPassword(
      administratorIdentity,
      "target-uid",
      "New-Passw0rd!",
    );
    expect(dependencies.provisioner.setPassword).toHaveBeenCalledWith(
      "target-uid",
      "New-Passw0rd!",
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "account.password_set_by_admin" }),
    );
  });

  it("404s setting a password for an unknown account", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    vi.mocked(dependencies.accounts.findByFirebaseUid).mockImplementation(
      async (firebaseUid) =>
        firebaseUid === "firebase-user"
          ? account({ roles: ["administrator"] })
          : null,
    );
    await expect(
      service.setAccountPassword(administratorIdentity, "ghost-uid", "New-Passw0rd!"),
    ).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(dependencies.provisioner.setPassword).not.toHaveBeenCalled();
  });

  it("requires an administrator to set a password directly", async () => {
    const { service } = setup();
    await expect(
      service.setAccountPassword(administratorIdentity, "target-uid", "New-Passw0rd!"),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });

  it("revokes existing sessions when suspending an account", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    await service.changeAccountStatus(
      administratorIdentity,
      "target-uid",
      "suspended",
      "Violated the honor code",
    );
    expect(dependencies.provisioner.revokeSessions).toHaveBeenCalledWith(
      "target-uid",
    );
  });

  it("revokes existing sessions when deactivating an account", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    await service.changeAccountStatus(
      administratorIdentity,
      "target-uid",
      "deactivated",
      "No longer enrolled",
    );
    expect(dependencies.provisioner.revokeSessions).toHaveBeenCalledWith(
      "target-uid",
    );
  });

  it("does not revoke sessions when reactivating an account", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    await service.changeAccountStatus(
      administratorIdentity,
      "target-uid",
      "active",
      "Identity verified",
    );
    expect(dependencies.provisioner.revokeSessions).not.toHaveBeenCalled();
  });

  it("records a password reset request without touching Firebase", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    await service.recordPasswordResetRequested(
      administratorIdentity,
      "firebase-user",
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "account.password_reset_requested",
      }),
    );
  });

  it("blocks a non-administrator during maintenance mode", async () => {
    const { service, dependencies } = setup(account({ roles: ["teacher"] }));
    vi.mocked(dependencies.institutions.getMaintenanceState).mockResolvedValue({
      enabled: true,
      message: "Upgrading the database tonight.",
    });
    await expect(
      service.requireActiveAccount(administratorIdentity),
    ).rejects.toMatchObject({
      code: "SYSTEM_MAINTENANCE",
      message: "Upgrading the database tonight.",
    });
  });

  it("exempts administrators from the maintenance gate", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    vi.mocked(dependencies.institutions.getMaintenanceState).mockResolvedValue({
      enabled: true,
      message: "Upgrading the database tonight.",
    });
    await expect(
      service.requireActiveAccount(administratorIdentity),
    ).resolves.toMatchObject({ roles: ["administrator"] });
  });

  it("enables maintenance mode, revokes non-admin sessions, and audits it", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    vi.mocked(
      dependencies.accounts.listActiveFirebaseUidsExcludingRole,
    ).mockResolvedValue(["student-uid", "teacher-uid"]);

    const result = await service.setMaintenanceMode(
      administratorIdentity,
      true,
      "Upgrading the database tonight.",
    );

    expect(dependencies.institutions.setMaintenanceState).toHaveBeenCalledWith(
      institutionId,
      true,
      "Upgrading the database tonight.",
    );
    expect(dependencies.provisioner.revokeSessions).toHaveBeenCalledWith(
      "student-uid",
    );
    expect(dependencies.provisioner.revokeSessions).toHaveBeenCalledWith(
      "teacher-uid",
    );
    expect(dependencies.audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: "system.maintenance_enabled" }),
    );
    expect(result).toEqual({
      maintenanceMode: true,
      message: "Upgrading the database tonight.",
    });
  });

  it("disables maintenance mode without revoking sessions", async () => {
    const { service, dependencies } = setup(
      account({ roles: ["administrator"] }),
    );
    await service.setMaintenanceMode(administratorIdentity, false, null);
    expect(dependencies.institutions.setMaintenanceState).toHaveBeenCalledWith(
      institutionId,
      false,
      null,
    );
    expect(dependencies.provisioner.revokeSessions).not.toHaveBeenCalled();
  });

  it("requires an administrator to change maintenance mode", async () => {
    const { service } = setup(account({ roles: ["teacher"] }));
    await expect(
      service.setMaintenanceMode(administratorIdentity, true, null),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
  });
});
