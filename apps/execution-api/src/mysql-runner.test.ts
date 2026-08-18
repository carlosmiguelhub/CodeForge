import { EventEmitter } from "node:events";

import type { ExecutionLimits } from "@sqweb/contracts";
import type { WorkspaceCredential } from "@sqweb/workspace";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mysql = vi.hoisted(() => ({ createConnection: vi.fn() }));

vi.mock("mysql2", () => ({ createConnection: mysql.createConnection }));

import { MySqlRunner } from "./mysql-runner";

const credential: WorkspaceCredential = {
  host: "workspace.internal",
  port: 3306,
  database: "workspace",
  username: "workspace_user",
  password: "a-secure-workspace-password-value",
};
const limits: ExecutionLimits = {
  timeoutMs: 10_000,
  maxStatements: 5,
  maxRowsPerResult: 1000,
  maxResultSets: 5,
  maxOutputBytes: 5 * 1024 * 1024,
};

describe("MySqlRunner result collection", () => {
  beforeEach(() => {
    mysql.createConnection.mockReset();
  });

  it("associates the unindexed fields event with the SELECT result set", async () => {
    const query = new EventEmitter();
    const connection = {
      threadId: 41,
      connect: vi.fn((callback: (error?: Error) => void) => callback()),
      query: vi.fn(() => {
        queueMicrotask(() => {
          query.emit("fields", [{ name: "answer", type: 3 }]);
          query.emit("result", [2], 0);
          query.emit("end");
        });
        return query;
      }),
      destroy: vi.fn(),
    };
    mysql.createConnection.mockReturnValue(connection);

    const result = await new MySqlRunner().run(
      "00000000-0000-4000-8000-000000000030",
      credential,
      "SELECT 1 + 1 AS answer",
      limits,
    );

    expect(result.resultSets).toEqual([
      {
        columns: [{ name: "answer", type: "3" }],
        rows: [[2]],
        affectedRows: 0,
        warningCount: 0,
        truncated: false,
      },
    ]);
    expect(result.rowsReturned).toBe(1);
  });
});
