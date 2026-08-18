import axe from "axe-core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          grant: "a".repeat(32),
          expiresAt: "2026-08-18T12:00:00.000Z",
          effectivePolicy: {
            timeoutMs: 10_000,
            maxStatements: 5,
            maxRowsPerResult: 1000,
            maxResultSets: 5,
            maxOutputBytes: 5 * 1024 * 1024,
          },
        }),
      ),
  ),
  executionFetch: vi.fn(async (path: string, _init?: RequestInit) => {
    void _init;
    if (path.includes("schema"))
      return new Response(
        JSON.stringify({
          tables: [
            {
              name: "students",
              type: "table",
              columns: [
                {
                  name: "id",
                  dataType: "int",
                  nullable: false,
                  key: "PRI",
                },
                {
                  name: "name",
                  dataType: "varchar",
                  nullable: false,
                  key: "",
                },
              ],
            },
          ],
        }),
      );
    if (path === "/v1/executions")
      return new Response(
        JSON.stringify({
          executionId: "00000000-0000-4000-8000-000000000030",
          state: "successful",
          resultSets: [
            {
              columns: [
                { name: "id", type: "3" },
                { name: "name", type: "253" },
              ],
              rows: [[1, "Alice"]],
              affectedRows: 0,
              warningCount: 0,
              truncated: false,
            },
          ],
          messages: [],
          statistics: {
            durationMs: 4,
            rowsReturned: 1,
            bytesReturned: 11,
            statementCount: 1,
          },
        }),
      );
    return new Response(JSON.stringify([]));
  }),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => mocks,
}));
vi.mock("./sql-editor", () => ({
  SqlEditor: () => <div role="textbox" aria-label="SQL editor" />,
}));

import { SqlWorkbench } from "./sql-workbench";

describe("SqlWorkbench", () => {
  it("exposes an accessible command surface and schema state", async () => {
    const { container, getByText } = render(
      <SqlWorkbench workspaceId="00000000-0000-4000-8000-000000000020" />,
    );
    await waitFor(() => expect(getByText(/Connected/)).toBeInTheDocument());
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("previews a table when its explorer row is selected", async () => {
    const { getByRole, getByText } = render(
      <SqlWorkbench workspaceId="00000000-0000-4000-8000-000000000020" />,
    );
    await waitFor(() => expect(getByText(/Connected/)).toBeInTheDocument());

    fireEvent.click(
      getByRole("button", { name: "Preview rows from students" }),
    );

    await waitFor(() => expect(getByText("Alice")).toBeInTheDocument());
    const executionCall = mocks.executionFetch.mock.calls.find(
      ([path]) => path === "/v1/executions",
    );
    expect(executionCall?.[1]?.body).toContain(
      "SELECT * FROM `students` LIMIT 100;",
    );
  });
});
