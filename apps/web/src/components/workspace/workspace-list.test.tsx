import axe from "axe-core";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(async () => new Response(JSON.stringify([]))),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));
vi.mock("@/components/workbench/sql-workbench", () => ({
  SqlWorkbench: () => <div>SQL Workbench</div>,
}));

import { WorkspaceList } from "./workspace-list";

describe("WorkspaceList", () => {
  beforeEach(() => {
    mocks.authorizedFetch.mockResolvedValue(new Response(JSON.stringify([])));
  });

  it("has no automated accessibility violations in the empty Student state", async () => {
    const { container, getByText } = render(<WorkspaceList role="student" />);
    await waitFor(() =>
      expect(
        getByText("No personal workspace has been requested."),
      ).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("shows the Workbench without the provisioning card when ready", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "00000000-0000-4000-8000-000000000020",
            ownerId: "00000000-0000-4000-8000-000000000010",
            scope: "personal",
            scopeId: "00000000-0000-4000-8000-000000000010",
            state: "ready",
            quotaBytes: 104857600,
            templateVersionId: null,
            expiresAt: null,
            failureCode: null,
            createdAt: "2026-08-18T07:00:00.000Z",
            updatedAt: "2026-08-18T07:00:00.000Z",
          },
        ]),
      ),
    );
    const { getByText, queryByText } = render(<WorkspaceList role="student" />);
    await waitFor(() => expect(getByText("SQL Workbench")).toBeInTheDocument());
    expect(queryByText("Storage limit")).not.toBeInTheDocument();
    expect(queryByText("Reset safely")).not.toBeInTheDocument();
  });
});
