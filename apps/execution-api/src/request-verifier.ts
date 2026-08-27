import { AuthorizationError, type TokenVerifier } from "@sqweb/auth";

export class RequestVerifier {
  constructor(private readonly tokens: TokenVerifier) {}

  async verify(authorization: string | undefined) {
    const [scheme, token, extra] = authorization?.trim().split(/\s+/) ?? [];
    if (scheme !== "Bearer" || !token || extra)
      throw new AuthorizationError(
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
        401,
      );
    try {
      const identity = await this.tokens.verifyIdToken(token, true);
      if (!identity.emailVerified) throw new Error("unverified");
      return identity;
    } catch {
      throw new AuthorizationError(
        "AUTHENTICATION_REQUIRED",
        "Identity verification failed.",
        401,
      );
    }
  }
}
