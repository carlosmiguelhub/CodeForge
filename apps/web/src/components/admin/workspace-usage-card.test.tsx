import axe from "axe-core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkspaceUsageCard } from "./workspace-usage-card";

describe("WorkspaceUsageCard", () => {
  it("shows the workspace label and total count", () => {
    render(
      <WorkspaceUsageCard
        stat={{
          workspace: "sql-workbench",
          totalCount: 1284,
          dailyCounts: [
            { date: "2026-08-21", count: 3 },
            { date: "2026-08-22", count: 5 },
          ],
        }}
      />,
    );
    expect(screen.getByText("SQL Workbench")).toBeInTheDocument();
    expect(screen.getByText("1,284")).toBeInTheDocument();
  });

  it("renders a flat sparkline without error when there is no activity yet", () => {
    render(
      <WorkspaceUsageCard
        stat={{
          workspace: "code-compiler",
          totalCount: 0,
          dailyCounts: [
            { date: "2026-08-21", count: 0 },
            { date: "2026-08-22", count: 0 },
          ],
        }}
      />,
    );
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Code Compiler")).toBeInTheDocument();
  });

  it("renders nothing for the sparkline when dailyCounts is empty", () => {
    render(
      <WorkspaceUsageCard
        stat={{ workspace: "erd-editor", totalCount: 4, dailyCounts: [] }}
      />,
    );
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <WorkspaceUsageCard
        stat={{
          workspace: "saved-queries",
          totalCount: 12,
          dailyCounts: [
            { date: "2026-08-21", count: 2 },
            { date: "2026-08-22", count: 4 },
          ],
        }}
      />,
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
