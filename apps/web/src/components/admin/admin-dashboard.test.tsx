import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

import { AdminDashboard } from "./admin-dashboard";

const dailyCounts = [
  { date: "2026-08-16", count: 0 },
  { date: "2026-08-17", count: 2 },
  { date: "2026-08-18", count: 98 },
  { date: "2026-08-19", count: 0 },
];

const stats = {
  totalUsers: 5,
  usersByRole: { student: 3, teacher: 1, administrator: 1 },
  usersByStatus: {
    pending_verification: 0,
    pending_approval: 1,
    active: 4,
    suspended: 0,
    deactivated: 0,
  },
  workspaceUsage: [
    { workspace: "sql-workbench", totalCount: 100, dailyCounts },
    { workspace: "code-compiler", totalCount: 0, dailyCounts: dailyCounts.map((d) => ({ ...d, count: 0 })) },
    { workspace: "erd-editor", totalCount: 2, dailyCounts: dailyCounts.map((d) => ({ ...d, count: 0 })) },
    { workspace: "saved-queries", totalCount: 1, dailyCounts: dailyCounts.map((d) => ({ ...d, count: 0 })) },
  ],
};

describe("AdminDashboard", () => {
  it("shows institution-wide stat tiles once loaded", async () => {
    mocks.authorizedFetch.mockResolvedValue(new Response(JSON.stringify(stats)));
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText("5")).toBeInTheDocument());
    expect(screen.getByText("Total users")).toBeInTheDocument();
    expect(mocks.authorizedFetch).toHaveBeenCalledWith(
      "/v1/admin/dashboard",
      {},
      true,
    );
  });

  it("shows a usage card with the total count for each workspace", async () => {
    mocks.authorizedFetch.mockResolvedValue(new Response(JSON.stringify(stats)));
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText("100")).toBeInTheDocument());
    expect(screen.getByText("SQL Workbench")).toBeInTheDocument();
    expect(screen.getByText("Code Compiler")).toBeInTheDocument();
    expect(screen.getByText("ERD Editor")).toBeInTheDocument();
    expect(screen.getByText("Saved Queries")).toBeInTheDocument();
  });

  it("shows a tooltip with the day's count on sparkline hover", async () => {
    mocks.authorizedFetch.mockResolvedValue(new Response(JSON.stringify(stats)));
    render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText("100")).toBeInTheDocument());

    const [sparkline] = screen.getAllByRole("img", { name: /total/ });
    // jsdom's getBoundingClientRect always reports zeros (no real layout),
    // so give it a realistic box before firing the hover event.
    vi.spyOn(sparkline!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 240,
      height: 56,
      right: 240,
      bottom: 56,
      x: 0,
      y: 0,
      toJSON: () => "",
    });
    fireEvent.pointerMove(sparkline!, { clientX: 0, clientY: 0 });

    expect(await screen.findByText("Aug 16")).toBeInTheDocument();
  });

  it("has no automated accessibility violations once loaded", async () => {
    mocks.authorizedFetch.mockResolvedValue(new Response(JSON.stringify(stats)));
    const { container } = render(<AdminDashboard />);
    await waitFor(() => expect(screen.getByText("100")).toBeInTheDocument());
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
