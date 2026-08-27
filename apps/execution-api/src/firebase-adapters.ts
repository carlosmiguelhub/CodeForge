import type { TokenVerifier, VerifiedIdentity } from "@sqweb/auth";
import type { App } from "firebase-admin/app";
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
