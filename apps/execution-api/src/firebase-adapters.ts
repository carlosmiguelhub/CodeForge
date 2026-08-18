import { timingSafeEqual } from "node:crypto";

import type {
  AppCheckVerifier,
  TokenVerifier,
  VerifiedIdentity,
} from "@sqweb/auth";
import type { App } from "firebase-admin/app";
import { getAppCheck } from "firebase-admin/app-check";
import { getAuth } from "firebase-admin/auth";

export class FirebaseTokenVerifier implements TokenVerifier {
  constructor(private readonly app: App) {}
  async verifyIdToken(
    token: string,
    checkRevoked: boolean,
  ): Promise<VerifiedIdentity> {
    const decoded = await getAuth(this.app).verifyIdToken(token, checkRevoked);
    if (!decoded.email) throw new Error("Authenticated identity has no email.");
    return {
      uid: decoded.uid,
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
    };
  }
}

export class FirebaseAppCheckVerifier implements AppCheckVerifier {
  constructor(private readonly app: App) {}
  async verifyToken(token: string) {
    await getAppCheck(this.app).verifyToken(token);
  }
}

export class LocalAppCheckVerifier implements AppCheckVerifier {
  constructor(private readonly expected: string) {
    if (process.env.NODE_ENV === "production" || expected.length < 32)
      throw new Error("Local App Check is not valid for this environment.");
  }
  async verifyToken(token: string) {
    const actual = Buffer.from(token);
    const expected = Buffer.from(this.expected);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      throw new Error("Application verification failed.");
  }
}
