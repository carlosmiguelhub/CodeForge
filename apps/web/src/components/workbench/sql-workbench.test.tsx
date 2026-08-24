import axe from "axe-core";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(async (path: string, _init?: RequestInit) => {
    void _init;
    if (path === "/v1/erd-diagrams")
      return new Response(
        JSON.stringify({
          id: "00000000-0000-4000-8000-000000000050",
          ownerId: "00000000-0000-4000-8000-000000000010",
          name: "Workspace schema",
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
          content: {
            nodes: [],
            edges: [],
            viewport: { x: 0, y: 0, zoom: 1 },
            entityColumns: [],
          },
        }),
      );
    return new Response(
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
    );
  }),
  push: vi.fn(),
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
                  references: null,
                },
                {
                  name: "name",
                  dataType: "varchar",
                  nullable: false,
                  key: "",
                  references: null,
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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock("./sql-editor", () => ({
  SqlEditor: ({ value }: { value: string }) => (
    <div role="textbox" aria-label="SQL editor">
      {value}
    </div>
  ),
}));

import { SqlWorkbench } from "./sql-workbench";

describe("SqlWorkbench", () => {
  it("exposes an accessible command surface and schema state", async () => {
    const { container, getByText } = render(
      <SqlWorkbench
        workspaceId="00000000-0000-4000-8000-000000000020"
        role="student"
      />,
    );
    await waitFor(() => expect(getByText(/Connected/)).toBeInTheDocument());
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("inserts a SELECT for a table without running it, so students still press Run themselves", async () => {
    const { getByRole, getByText } = render(
      <SqlWorkbench
        workspaceId="00000000-0000-4000-8000-000000000020"
        role="student"
      />,
    );
    await waitFor(() => expect(getByText(/Connected/)).toBeInTheDocument());

    fireEvent.click(
      getByRole("button", { name: "Insert a SELECT query for students" }),
    );

    await waitFor(() =>
      expect(
        getByText("SELECT * FROM `students` LIMIT 100;"),
      ).toBeInTheDocument(),
    );
    expect(
      mocks.executionFetch.mock.calls.some(
        ([path]) => path === "/v1/executions",
      ),
    ).toBe(false);
  });

  it("generates an ERD from the live schema and navigates to it", async () => {
    const { getByRole } = render(
      <SqlWorkbench
        workspaceId="00000000-0000-4000-8000-000000000020"
        role="teacher"
      />,
    );
    await waitFor(() =>
      expect(getByRole("button", { name: "Generate ERD" })).not.toBeDisabled(),
    );

    fireEvent.click(getByRole("button", { name: "Generate ERD" }));

    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith(
        "/teacher/erd-workspace/00000000-0000-4000-8000-000000000050",
      ),
    );
    const [, init] = mocks.authorizedFetch.mock.calls.find(
      ([path]) => path === "/v1/erd-diagrams",
    )!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toBe("Workspace schema");
    expect(body.content.nodes).toHaveLength(1);
  });

  it("sends a DROP TABLE script for every table when clearing the schema", async () => {
    const { getByRole } = render(
      <SqlWorkbench
        workspaceId="00000000-0000-4000-8000-000000000020"
        role="student"
      />,
    );
    await waitFor(() =>
      expect(
        getByRole("button", { name: "Delete all tables" }),
      ).not.toBeDisabled(),
    );

    fireEvent.click(getByRole("button", { name: "Delete all tables" }));

    await waitFor(() =>
      expect(
        mocks.executionFetch.mock.calls.some(
          ([path]) => path === "/v1/executions",
        ),
      ).toBe(true),
    );
    const [, init] = mocks.executionFetch.mock.calls.find(
      ([path]) => path === "/v1/executions",
    )!;
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.sql).toBe("DROP TABLE IF EXISTS `students`;");
  });
});
