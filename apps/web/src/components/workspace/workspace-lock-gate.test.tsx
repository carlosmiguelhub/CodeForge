import axe from "axe-core";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

import { WorkspaceLockGate } from "./workspace-lock-gate";

describe("WorkspaceLockGate", () => {
  it("renders children directly when the workspace is unlocked", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify({ lockedWorkspaces: [] })),
    );
    render(
      <WorkspaceLockGate workspace="sql-workbench">
        <p>SQL tool</p>
      </WorkspaceLockGate>,
    );
    expect(await screen.findByText("SQL tool")).toBeInTheDocument();
    expect(screen.queryByText("Workspace locked")).not.toBeInTheDocument();
  });

  it("blurs children and shows the lock message when the workspace is locked", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify({ lockedWorkspaces: ["sql-workbench"] })),
    );
    render(
      <WorkspaceLockGate workspace="sql-workbench">
        <p>SQL tool</p>
      </WorkspaceLockGate>,
    );
    expect(await screen.findByText("Workspace locked")).toBeInTheDocument();
    expect(
      screen.getByText(/This workspace isn't available right now/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/An administrator has restricted access/),
    ).toBeInTheDocument();
    // Children remain in the DOM (blurred/inert), not unmounted.
    expect(screen.getByText("SQL tool")).toBeInTheDocument();
  });

  it("fails open (renders children) when the access fetch errors", async () => {
    mocks.authorizedFetch.mockRejectedValue(new Error("network down"));
    render(
      <WorkspaceLockGate workspace="sql-workbench">
        <p>SQL tool</p>
      </WorkspaceLockGate>,
    );
    await waitFor(() =>
      expect(screen.getByText("SQL tool")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Workspace locked")).not.toBeInTheDocument();
  });

  it("has no automated accessibility violations in the locked state", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify({ lockedWorkspaces: ["sql-workbench"] })),
    );
    const { container } = render(
      <WorkspaceLockGate workspace="sql-workbench">
        <p>SQL tool</p>
      </WorkspaceLockGate>,
    );
    await screen.findByText("Workspace locked");
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
