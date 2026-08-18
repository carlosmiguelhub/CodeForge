import {
  AuthorizationError,
  type AppCheckVerifier,
  type TokenVerifier,
} from "@sqweb/auth";

export class RequestVerifier {
  constructor(
    private readonly tokens: TokenVerifier,
    private readonly appCheck: AppCheckVerifier,
  ) {}

  async verify(
    authorization: string | undefined,
    appCheckToken: string | undefined,
  ) {
    const [scheme, token, extra] = authorization?.trim().split(/\s+/) ?? [];
    if (scheme !== "Bearer" || !token || extra)
      throw new AuthorizationError(
        "AUTHENTICATION_REQUIRED",
        "Authentication is required.",
        401,
      );
    if (!appCheckToken)
      throw new AuthorizationError(
        "PERMISSION_DENIED",
        "Application verification is required.",
        403,
      );
    try {
      const [identity] = await Promise.all([
        this.tokens.verifyIdToken(token, true),
        this.appCheck.verifyToken(appCheckToken),
      ]);
      if (!identity.emailVerified) throw new Error("unverified");
      return identity;
    } catch {
      throw new AuthorizationError(
        "AUTHENTICATION_REQUIRED",
        "Identity or application verification failed.",
        401,
      );
    }
  }
}
