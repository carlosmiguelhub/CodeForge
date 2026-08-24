import type { ExecutionRepository } from "@sqweb/execution";
import { ExecutionGrantSigner } from "@sqweb/execution";
import { MySqlParserClassifier } from "@sqweb/sql-classifier";
import type { WorkspaceSecretStore } from "@sqweb/workspace";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  ConfirmationRequiredError,
  ExecutionService,
} from "./execution-service";
import type { MySqlRunner } from "./mysql-runner";

const signer = new ExecutionGrantSigner(
  "test-execution-secret-that-is-at-least-32-chars",
);
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
const workspaceId = "00000000-0000-4000-8000-000000000020";
const grant = signer.issueExecution(account, workspaceId).token;
const identity = {
  uid: account.firebaseUid,
  email: account.email,
  emailVerified: true,
};

describe("ExecutionService", () => {
  let repository: ExecutionRepository;
  let secrets: WorkspaceSecretStore;
  let runner: MySqlRunner;
  let service: ExecutionService;

  beforeEach(() => {
    repository = {
      authorizeAndStart: vi.fn().mockResolvedValue({
        actorId: account.id,
        institutionId: account.institutionId,
        workspaceId,
        credentialSecretRef: "secret://workspace",
      }),
      finish: vi.fn().mockResolvedValue(undefined),
      requestCancellation: vi.fn().mockResolvedValue(true),
      listHistory: vi.fn().mockResolvedValue([]),
      resolveForSchema: vi.fn(),
    };
    secrets = {
      put: vi.fn(),
      get: vi.fn().mockResolvedValue({
        host: "private",
        port: 3306,
        database: "workspace",
        username: "workspace",
        password: "a-secure-workspace-password-value",
      }),
      remove: vi.fn(),
    };
    runner = {
      run: vi.fn().mockResolvedValue({
        resultSets: [
          {
            columns: [{ name: "answer", type: "LONG" }],
            rows: [[42]],
            affectedRows: 0,
            warningCount: 0,
            truncated: false,
          },
        ],
        rowsReturned: 1,
        bytesReturned: 4,
        durationMs: 2,
      }),
      cancel: vi.fn(),
      schema: vi.fn(),
    } as never;
    service = new ExecutionService({
      signer,
      classifier: new MySqlParserClassifier(),
      repository,
      secrets,
      runner,
    });
  });

  it("executes allowed SQL only after current workspace authorization", async () => {
    const response = await service.execute(identity, {
      grant,
      sql: "SELECT 42 AS answer",
      selection: { mode: "current" },
      transactionMode: "auto",
    });
    expect(response.state).toBe("successful");
    expect(repository.authorizeAndStart).toHaveBeenCalled();
    expect(repository.finish).toHaveBeenCalledWith(
      expect.objectContaining({ state: "successful", rowsReturned: 1 }),
    );
  });

  it("denies cross-schema SQL before credentials are resolved", async () => {
    await expect(
      service.execute(identity, {
        grant,
        sql: "SELECT * FROM mysql.user",
        selection: { mode: "current" },
        transactionMode: "auto",
      }),
    ).rejects.toMatchObject({ code: "SQL_POLICY_DENIED" });
    expect(repository.authorizeAndStart).not.toHaveBeenCalled();
    expect(secrets.get).not.toHaveBeenCalled();
  });

  it("binds destructive confirmation to the parsed statement hash", async () => {
    let required: ConfirmationRequiredError | null = null;
    try {
      await service.execute(identity, {
        grant,
        sql: "DROP TABLE practice_notes",
        selection: { mode: "current" },
        transactionMode: "auto",
      });
    } catch (error) {
      required = error as ConfirmationRequiredError;
    }
    expect(required).toBeInstanceOf(ConfirmationRequiredError);
    await expect(
      service.execute(identity, {
        grant,
        sql: "DROP TABLE other_table",
        selection: { mode: "current" },
        transactionMode: "auto",
        confirmation: required?.token,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CONFIRMATION" });
  });
});
