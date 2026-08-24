import { describe, expect, it } from "vitest";

import { passwordPolicyError } from "./password-policy";

describe("passwordPolicyError", () => {
  it("rejects a password shorter than 8 characters", () => {
    expect(passwordPolicyError("Ab1!")).toBe("Use at least 8 characters.");
  });

  it("rejects a password with no special character", () => {
    expect(passwordPolicyError("longenough1")).toBe(
      "Include at least one special character (e.g. ! @ # $ %).",
    );
  });

  it("accepts a password with 8+ characters and a special character", () => {
    expect(passwordPolicyError("Str0ng!Pass")).toBeNull();
  });
});
