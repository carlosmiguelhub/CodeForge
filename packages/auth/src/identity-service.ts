import type { Role } from "@sqweb/contracts";

import { AuthorizationError } from "./errors";
import type {
  AccountListQuery,
  AccountListResult,
  AccountProfile,
  AccountRepository,
  AccountStatusChange,
  AdminCreateUserInput,
  AuditSink,
  ClaimsWriter,
  InstitutionRepository,
  RegistrationInput,
  TokenVerifier,
  UserProvisioner,
  VerifiedIdentity,
} from "./types";

const DEFAULT_MAINTENANCE_MESSAGE =
  "CodeForge is temporarily undergoing scheduled maintenance. Please try again shortly.";

export interface IdentityServiceDependencies {
  readonly accounts: AccountRepository;
  readonly tokens: TokenVerifier;
  readonly claims: ClaimsWriter;
  readonly audit: AuditSink;
  readonly provisioner: UserProvisioner;
  readonly institutions: InstitutionRepository;
  readonly institutionId: string;
}

export class IdentityService {
  constructor(private readonly dependencies: IdentityServiceDependencies) {}

  async verifyBearer(
    authorizationHeader: string | undefined,
  ): Promise<VerifiedIdentity> {
    const [scheme, token, extra] =
      authorizationHeader?.trim().split(/\s+/) ?? [];
    if (scheme !== "Bearer" || !token || extra) {
      throw new AuthorizationError(
        "AUTHENTICATION_REQUIRED",
        "A valid authentication token is required.",
        401,
      );
    }

    try {
      return await this.dependencies.tokens.verifyIdToken(token, true);
    } catch {
      throw new AuthorizationError(
        "AUTHENTICATION_REQUIRED",
        "The authentication token is invalid or expired.",
        401,
      );
    }
  }

  async getAccount(identity: VerifiedIdentity): Promise<AccountProfile> {
    const account = await this.dependencies.accounts.findByFirebaseUid(
      identity.uid,
    );
    if (!account) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Complete account registration before continuing.",
        404,
      );
    }
    return account;
  }

  async requireActiveAccount(
    identity: VerifiedIdentity,
    allowedRoles?: readonly Role[],
  ): Promise<AccountProfile> {
    const account = await this.getAccount(identity);

    if (account.status === "pending_verification") {
      throw new AuthorizationError(
        "EMAIL_VERIFICATION_REQUIRED",
        "Verify your email address before continuing.",
        403,
      );
    }
    if (account.status === "pending_approval") {
      throw new AuthorizationError(
        "ACCOUNT_PENDING_APPROVAL",
        "This account is waiting for administrator approval.",
        403,
      );
    }
    if (account.status === "suspended" || account.status === "deactivated") {
      throw new AuthorizationError(
        "ACCOUNT_SUSPENDED",
        "This account is not permitted to access CodeForge.",
        403,
      );
    }

    if (!account.roles.includes("administrator")) {
      const maintenance =
        await this.dependencies.institutions.getMaintenanceState(
          account.institutionId,
        );
      if (maintenance.enabled) {
        throw new AuthorizationError(
          "SYSTEM_MAINTENANCE",
          maintenance.message ?? DEFAULT_MAINTENANCE_MESSAGE,
          503,
        );
      }
    }

    if (
      allowedRoles &&
      !allowedRoles.some((role) => account.roles.includes(role))
    ) {
      await this.dependencies.audit.record({
        actorId: account.id,
        action: "authorization.role_denied",
        targetId: account.id,
        result: "denied",
      });
      throw new AuthorizationError(
        "PERMISSION_DENIED",
        "You do not have permission to perform this action.",
        403,
      );
    }

    return account;
  }

  async register(
    identity: VerifiedIdentity,
    displayName: string,
    requestedRole: RegistrationInput["requestedRole"],
    sectionId?: string,
  ): Promise<AccountProfile> {
    if (!identity.emailVerified) {
      throw new AuthorizationError(
        "EMAIL_VERIFICATION_REQUIRED",
        "Verify your email address before completing registration.",
        403,
      );
    }

    const existing = await this.dependencies.accounts.findByFirebaseUid(
      identity.uid,
    );
    if (existing) return existing;

    const account = await this.dependencies.accounts.register({
      identity,
      institutionId: this.dependencies.institutionId,
      displayName,
      requestedRole,
      sectionId,
    });
    await this.dependencies.claims.writeClaims(account);
    await this.dependencies.audit.record({
      actorId: account.id,
      action: "account.registered",
      targetId: account.id,
      result: "succeeded",
    });
    return account;
  }

  async updateProfile(
    identity: VerifiedIdentity,
    displayName: string,
  ): Promise<AccountProfile> {
    const account = await this.getAccount(identity);
    const updated = await this.dependencies.accounts.updateDisplayName(
      account.firebaseUid,
      displayName,
    );
    await this.dependencies.audit.record({
      actorId: updated.id,
      action: "account.profile_updated",
      targetId: updated.id,
      result: "succeeded",
    });
    return updated;
  }

  async changeAccountStatus(
    identity: VerifiedIdentity,
    targetFirebaseUid: string,
    nextStatus: AccountStatusChange["nextStatus"],
    reason: string,
  ): Promise<AccountProfile> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    const account = await this.dependencies.accounts.changeStatus({
      targetFirebaseUid,
      actor,
      reason,
      nextStatus,
    });
    await this.dependencies.claims.writeClaims(account);
    if (nextStatus === "suspended" || nextStatus === "deactivated") {
      await this.dependencies.provisioner.revokeSessions(targetFirebaseUid);
    }
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: `account.${nextStatus}`,
      targetId: account.id,
      result: "succeeded",
      reason,
    });
    return account;
  }

  async listAccounts(
    identity: VerifiedIdentity,
    query: AccountListQuery,
  ): Promise<AccountListResult & { page: number; pageSize: number }> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    const result = await this.dependencies.accounts.listAccounts(
      actor.institutionId,
      query,
    );
    return { ...result, page: query.page, pageSize: query.pageSize };
  }

  async getAccountDetail(
    identity: VerifiedIdentity,
    targetFirebaseUid: string,
  ): Promise<AccountProfile> {
    await this.requireActiveAccount(identity, ["administrator"]);
    const account =
      await this.dependencies.accounts.findByFirebaseUid(targetFirebaseUid);
    if (!account) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    return account;
  }

  async createAccount(
    identity: VerifiedIdentity,
    request: AdminCreateUserInput,
  ): Promise<AccountProfile> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    const { firebaseUid } = await this.dependencies.provisioner.createUser({
      email: request.email,
      displayName: request.displayName,
    });
    try {
      const account = await this.dependencies.accounts.createByAdmin({
        institutionId: actor.institutionId,
        firebaseUid,
        email: request.email,
        displayName: request.displayName,
        roles: request.roles,
        approvedBy: actor.id,
      });
      await this.dependencies.claims.writeClaims(account);
      await this.dependencies.audit.record({
        actorId: actor.id,
        action: "account.created_by_admin",
        targetId: account.id,
        result: "succeeded",
      });
      return account;
    } catch (error) {
      // The DB-side account creation failed after the Firebase user was
      // already minted — clean it up so a retry with the same email
      // doesn't collide with an orphaned, account-less Firebase user.
      await this.dependencies.provisioner
        .deleteUser(firebaseUid)
        .catch(() => undefined);
      throw error;
    }
  }

  async assignSection(
    identity: VerifiedIdentity,
    targetFirebaseUid: string,
    sectionId: string | null,
  ): Promise<AccountProfile> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    const target =
      await this.dependencies.accounts.findByFirebaseUid(targetFirebaseUid);
    if (!target) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    const updated = await this.dependencies.accounts.assignSection(
      targetFirebaseUid,
      actor.institutionId,
      sectionId,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "account.section_assigned",
      targetId: updated.id,
      result: "succeeded",
      reason: sectionId ?? "none",
    });
    return updated;
  }

  async assignRole(
    identity: VerifiedIdentity,
    targetFirebaseUid: string,
    role: Role,
  ): Promise<AccountProfile> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    const target =
      await this.dependencies.accounts.findByFirebaseUid(targetFirebaseUid);
    if (!target) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    const updated = await this.dependencies.accounts.assignRole({
      targetFirebaseUid,
      institutionId: actor.institutionId,
      role,
      approvedBy: actor.id,
    });
    await this.dependencies.claims.writeClaims(updated);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "role.assigned",
      targetId: updated.id,
      result: "succeeded",
      reason: role,
    });
    return updated;
  }

  async removeRole(
    identity: VerifiedIdentity,
    targetFirebaseUid: string,
    role: Role,
  ): Promise<AccountProfile> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    const target =
      await this.dependencies.accounts.findByFirebaseUid(targetFirebaseUid);
    if (!target) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    if (target.roles.length === 1 && target.roles[0] === role) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "An account must keep at least one role.",
        400,
      );
    }
    const updated = await this.dependencies.accounts.removeRole({
      targetFirebaseUid,
      institutionId: actor.institutionId,
      role,
    });
    await this.dependencies.claims.writeClaims(updated);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "role.removed",
      targetId: updated.id,
      result: "succeeded",
      reason: role,
    });
    return updated;
  }

  async deleteAccount(
    identity: VerifiedIdentity,
    targetFirebaseUid: string,
  ): Promise<void> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    if (identity.uid === targetFirebaseUid) {
      throw new AuthorizationError(
        "VALIDATION_FAILED",
        "You cannot delete your own account.",
        400,
      );
    }
    const target =
      await this.dependencies.accounts.findByFirebaseUid(targetFirebaseUid);
    if (!target) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    await this.dependencies.accounts.deleteAccount(targetFirebaseUid);
    // Best-effort — the platform account is already gone either way, and a
    // stray Firebase user (unable to sign in without a platform account)
    // isn't worth failing this request over.
    await this.dependencies.provisioner
      .deleteUser(targetFirebaseUid)
      .catch(() => undefined);
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "account.deleted",
      targetId: target.id,
      result: "succeeded",
    });
  }

  async setAccountPassword(
    identity: VerifiedIdentity,
    targetFirebaseUid: string,
    password: string,
  ): Promise<void> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    const target =
      await this.dependencies.accounts.findByFirebaseUid(targetFirebaseUid);
    if (!target) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    await this.dependencies.provisioner.setPassword(
      targetFirebaseUid,
      password,
    );
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "account.password_set_by_admin",
      targetId: target.id,
      result: "succeeded",
    });
  }

  async recordPasswordResetRequested(
    identity: VerifiedIdentity,
    targetFirebaseUid: string,
  ): Promise<void> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    const target =
      await this.dependencies.accounts.findByFirebaseUid(targetFirebaseUid);
    if (!target) {
      throw new AuthorizationError(
        "RESOURCE_NOT_FOUND",
        "Account not found.",
        404,
      );
    }
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: "account.password_reset_requested",
      targetId: target.id,
      result: "succeeded",
    });
  }

  // Public — no bearer token required — so the login page and an
  // already-signed-in session's poll can both learn maintenance state
  // before (or without) a valid account lookup.
  async getSystemStatus(): Promise<{
    maintenanceMode: boolean;
    message: string | null;
  }> {
    const state = await this.dependencies.institutions.getMaintenanceState(
      this.dependencies.institutionId,
    );
    return { maintenanceMode: state.enabled, message: state.message };
  }

  async setMaintenanceMode(
    identity: VerifiedIdentity,
    enabled: boolean,
    message: string | null,
  ): Promise<{ maintenanceMode: boolean; message: string | null }> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    await this.dependencies.institutions.setMaintenanceState(
      actor.institutionId,
      enabled,
      message,
    );
    if (enabled) {
      const firebaseUids =
        await this.dependencies.accounts.listActiveFirebaseUidsExcludingRole(
          actor.institutionId,
          "administrator",
        );
      await Promise.all(
        firebaseUids.map((firebaseUid) =>
          this.dependencies.provisioner
            .revokeSessions(firebaseUid)
            .catch(() => undefined),
        ),
      );
    }
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: enabled
        ? "system.maintenance_enabled"
        : "system.maintenance_disabled",
      targetId: actor.institutionId,
      result: "succeeded",
      ...(message ? { reason: message } : {}),
    });
    return { maintenanceMode: enabled, message };
  }
}
