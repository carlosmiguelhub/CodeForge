import type { Role } from "@sqweb/contracts";

import { AuthorizationError } from "./errors";
import type {
  AccountProfile,
  AccountRepository,
  AccountStatusChange,
  AppCheckVerifier,
  AuditSink,
  ClaimsWriter,
  RegistrationInput,
  TokenVerifier,
  VerifiedIdentity,
} from "./types";

export interface IdentityServiceDependencies {
  readonly accounts: AccountRepository;
  readonly tokens: TokenVerifier;
  readonly appCheck: AppCheckVerifier;
  readonly claims: ClaimsWriter;
  readonly audit: AuditSink;
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

  async verifyAppCheck(token: string | undefined): Promise<void> {
    if (!token) {
      throw new AuthorizationError(
        "PERMISSION_DENIED",
        "Application verification is required.",
        403,
      );
    }

    try {
      await this.dependencies.appCheck.verifyToken(token);
    } catch {
      throw new AuthorizationError(
        "PERMISSION_DENIED",
        "Application verification failed.",
        403,
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
        "This account is not permitted to access SQWeb.",
        403,
      );
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
    await this.dependencies.audit.record({
      actorId: actor.id,
      action: `account.${nextStatus}`,
      targetId: account.id,
      result: "succeeded",
      reason,
    });
    return account;
  }

  async listPendingAccounts(
    identity: VerifiedIdentity,
  ): Promise<readonly AccountProfile[]> {
    const actor = await this.requireActiveAccount(identity, ["administrator"]);
    return this.dependencies.accounts.listPending(actor.institutionId);
  }
}
