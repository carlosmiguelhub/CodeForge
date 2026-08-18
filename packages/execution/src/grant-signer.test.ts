import { describe, expect, it } from "vitest";

import { ExecutionGrantSigner } from "./grant-signer";

const account = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "student-uid",
  email: "student@example.edu",
  displayName: "Student",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active" as const,
  roles: ["student" as const],
  authorizationVersion: 1,
};

describe("ExecutionGrantSigner", () => {
  const signer = new ExecutionGrantSigner(
    "test-execution-secret-that-is-at-least-32-chars",
  );

  it("binds a short-lived grant to identity and workspace", () => {
    const issued = signer.issueExecution(
      account,
      "00000000-0000-4000-8000-000000000020",
    );
    expect(
      signer.verifyExecution(issued.token, account.firebaseUid),
    ).toMatchObject({
      accountId: account.id,
      workspaceId: "00000000-0000-4000-8000-000000000020",
    });
    expect(() => signer.verifyExecution(issued.token, "other-user")).toThrow();
  });

  it("rejects token tampering", () => {
    const issued = signer.issueExecution(
      account,
      "00000000-0000-4000-8000-000000000020",
    );
    expect(() =>
      signer.verifyExecution(`${issued.token}x`, account.firebaseUid),
    ).toThrow();
  });
});
