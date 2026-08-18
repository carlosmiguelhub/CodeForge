import axe from "axe-core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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
});
