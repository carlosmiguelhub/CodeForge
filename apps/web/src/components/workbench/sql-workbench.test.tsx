import axe from "axe-core";
import { render, waitFor } from "@testing-library/react";
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
  executionFetch: vi.fn(
    async (path: string) =>
      new Response(
        JSON.stringify(
          path.includes("schema")
            ? {
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
                    ],
                  },
                ],
              }
            : [],
        ),
      ),
  ),
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
});
