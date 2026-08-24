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
  sectionId: null,
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

  it("binds a GUI session grant to identity and session, with no separate bearer to check", () => {
    const issued = signer.issueGuiSession(
      account,
      "00000000-0000-4000-8000-000000000050",
      60,
    );
    expect(signer.verifyGuiSession(issued.token)).toMatchObject({
      accountId: account.id,
      sessionId: "00000000-0000-4000-8000-000000000050",
    });
  });

  it("rejects a GUI session grant once it expires", () => {
    const issued = signer.issueGuiSession(
      account,
      "00000000-0000-4000-8000-000000000050",
      -1,
    );
    expect(() => signer.verifyGuiSession(issued.token)).toThrow();
  });

  it("rejects a tampered GUI session grant", () => {
    const issued = signer.issueGuiSession(
      account,
      "00000000-0000-4000-8000-000000000050",
      60,
    );
    expect(() => signer.verifyGuiSession(`${issued.token}x`)).toThrow();
  });

  it("does not accept an execution grant as a GUI session grant", () => {
    const issued = signer.issueExecution(
      account,
      "00000000-0000-4000-8000-000000000020",
    );
    expect(() => signer.verifyGuiSession(issued.token)).toThrow();
  });

  it("issues a short-lived interactive run grant without a workspace binding", () => {
    const issued = signer.issueInteractiveRun(account, 60);
    expect(signer.verifyInteractiveRun(issued.token)).toMatchObject({
      kind: "interactive-run",
      uid: account.firebaseUid,
      accountId: account.id,
      institutionId: account.institutionId,
    });
  });

  it("rejects expired, tampered, and wrong-kind interactive run grants", () => {
    const expired = signer.issueInteractiveRun(account, -1);
    expect(() => signer.verifyInteractiveRun(expired.token)).toThrow();

    const valid = signer.issueInteractiveRun(account, 60);
    expect(() => signer.verifyInteractiveRun(`${valid.token}x`)).toThrow();

    const execution = signer.issueExecution(
      account,
      "00000000-0000-4000-8000-000000000020",
    );
    expect(() => signer.verifyInteractiveRun(execution.token)).toThrow();
  });
});
