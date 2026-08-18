import { afterEach, describe, expect, it } from "vitest";

import { LocalAppCheckVerifier } from "./firebase-adapters";

const originalNodeEnvironment = process.env.NODE_ENV;

afterEach(() => {
  if (originalNodeEnvironment === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnvironment;
});

describe("LocalAppCheckVerifier", () => {
  it("accepts only the exact configured local token", async () => {
    const token = "local-app-check-token-with-32-characters";
    const verifier = new LocalAppCheckVerifier(token);
    await expect(verifier.verifyToken(token)).resolves.toBeUndefined();
    await expect(verifier.verifyToken(`${token}-wrong`)).rejects.toThrow(
      "Local application verification failed.",
    );
  });

  it("cannot be constructed in production", () => {
    process.env.NODE_ENV = "production";
    expect(
      () =>
        new LocalAppCheckVerifier("local-app-check-token-with-32-characters"),
    ).toThrow("Local App Check cannot run in production.");
  });
});
