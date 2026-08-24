import { AuthorizationError } from "@sqweb/auth";
import type {
  AccountProfile,
  AppCheckVerifier,
  ClaimsWriter,
  TokenVerifier,
  UserProvisioner,
  VerifiedIdentity,
} from "@sqweb/auth";
import type { App } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";
import { timingSafeEqual } from "node:crypto";

export class FirebaseTokenVerifier implements TokenVerifier {
  constructor(private readonly app: App) {}

  async verifyIdToken(
    token: string,
    checkRevoked: boolean,
  ): Promise<VerifiedIdentity> {
    const decoded = await getAuth(this.app).verifyIdToken(token, checkRevoked);
    if (!decoded.email)
      throw new Error("Authenticated identity has no email address.");
    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
    };
  }
}

export class FirebaseAppCheckVerifier implements AppCheckVerifier {
  constructor(private readonly app: App) {}

  async verifyToken(token: string): Promise<void> {
    await getAppCheck(this.app).verifyToken(token);
  }
}

export class LocalAppCheckVerifier implements AppCheckVerifier {
  constructor(private readonly expectedToken: string) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Local App Check cannot run in production.");
    }
    if (expectedToken.length < 32) {
      throw new Error(
        "The local App Check token must contain at least 32 characters.",
      );
    }
  }

  async verifyToken(token: string): Promise<void> {
    const actual = Buffer.from(token);
    const expected = Buffer.from(this.expectedToken);
    if (
      actual.length !== expected.length ||
      !timingSafeEqual(actual, expected)
    ) {
      throw new Error("Local application verification failed.");
    }
  }
}

export class FirebaseClaimsWriter implements ClaimsWriter {
  constructor(private readonly app: App) {}

  async writeClaims(account: AccountProfile): Promise<void> {
    await getAuth(this.app).setCustomUserClaims(account.firebaseUid, {
      institution_id: account.institutionId,
      roles: account.status === "active" ? account.roles : [],
      authorization_version: account.authorizationVersion,
    });
  }
}

export class FirebaseUserProvisioner implements UserProvisioner {
  constructor(private readonly app: App) {}

  async createUser(input: {
    email: string;
    displayName: string;
  }): Promise<{ firebaseUid: string }> {
    try {
      const record = await getAuth(this.app).createUser({
        email: input.email,
        displayName: input.displayName,
        // Admin-created accounts are pre-vetted by the admin creating
        // them, so they skip the self-registration email-verification
        // gate entirely — this flag is what makes that true on first
        // sign-in; dropping it silently reintroduces the gate.
        emailVerified: true,
      });
      return { firebaseUid: record.uid };
    } catch (error) {
      if ((error as { code?: string }).code === "auth/email-already-exists") {
        throw new AuthorizationError(
          "EMAIL_ALREADY_REGISTERED",
          "An account already uses this email address.",
          409,
        );
      }
      throw error;
    }
  }

  async deleteUser(firebaseUid: string): Promise<void> {
    await getAuth(this.app)
      .deleteUser(firebaseUid)
      .catch(() => undefined);
  }

  async setPassword(firebaseUid: string, password: string): Promise<void> {
    await getAuth(this.app).updateUser(firebaseUid, { password });
  }

  async revokeSessions(firebaseUid: string): Promise<void> {
    await getAuth(this.app)
      .revokeRefreshTokens(firebaseUid)
      .catch(() => undefined);
  }
}
