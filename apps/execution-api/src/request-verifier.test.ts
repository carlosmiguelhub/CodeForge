import type { AppCheckVerifier, TokenVerifier } from "@sqweb/auth";
import { describe, expect, it, vi } from "vitest";

import { RequestVerifier } from "./request-verifier";

const identity = {
  uid: "student-uid",
  email: "student@example.edu",
  emailVerified: true,
};

function setup() {
  const tokens: TokenVerifier = {
    verifyIdToken: vi.fn().mockResolvedValue(identity),
  };
  const appCheck: AppCheckVerifier = {
    verifyToken: vi.fn().mockResolvedValue(undefined),
  };
  return { tokens, appCheck, verifier: new RequestVerifier(tokens, appCheck) };
}

describe("RequestVerifier", () => {
  it("requires a single bearer credential", async () => {
    const { verifier } = setup();
    await expect(verifier.verify(undefined, "app-check")).rejects.toMatchObject(
      {
        code: "AUTHENTICATION_REQUIRED",
        statusCode: 401,
      },
    );
    await expect(
      verifier.verify("Bearer first second", "app-check"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("requires App Check before invoking either verifier", async () => {
    const { verifier, tokens } = setup();
    await expect(
      verifier.verify("Bearer identity", undefined),
    ).rejects.toMatchObject({ code: "PERMISSION_DENIED", statusCode: 403 });
    expect(tokens.verifyIdToken).not.toHaveBeenCalled();
  });

  it("verifies revocation and App Check concurrently", async () => {
    const { verifier, tokens, appCheck } = setup();
    await expect(
      verifier.verify("Bearer identity", "app-check"),
    ).resolves.toEqual(identity);
    expect(tokens.verifyIdToken).toHaveBeenCalledWith("identity", true);
    expect(appCheck.verifyToken).toHaveBeenCalledWith("app-check");
  });

  it("rejects unverified email identities", async () => {
    const { verifier, tokens } = setup();
    vi.mocked(tokens.verifyIdToken).mockResolvedValue({
      ...identity,
      emailVerified: false,
    });
    await expect(
      verifier.verify("Bearer identity", "app-check"),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });
});
