import axe from "axe-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { Database } from "lucide-react";
import { describe, expect, it, vi } from "vitest";

import { WorkspaceGuideModal } from "./workspace-guide-modal";

const steps = [
  { title: "Step one", body: <p>First step body</p> },
  { title: "Step two", body: <p>Second step body</p> },
  { title: "Step three", body: <p>Third step body</p> },
];

describe("WorkspaceGuideModal", () => {
  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <WorkspaceGuideModal
        icon={Database}
        title="SQL Workspace guide"
        description="A tour"
        steps={steps}
        ctaLabel="Open SQL Workspace"
        ctaHref="/student/workspaces"
        onClose={vi.fn()}
      />,
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("starts on step one and steps forward with Next", () => {
    render(
      <WorkspaceGuideModal
        icon={Database}
        title="SQL Workspace guide"
        description="A tour"
        steps={steps}
        ctaLabel="Open SQL Workspace"
        ctaHref="/student/workspaces"
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
    expect(screen.getByText("First step body")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();
    expect(screen.getByText("Second step body")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
  });

  it("swaps Next for the CTA link on the last step", () => {
    render(
      <WorkspaceGuideModal
        icon={Database}
        title="SQL Workspace guide"
        description="A tour"
        steps={steps}
        ctaLabel="Open SQL Workspace"
        ctaHref="/student/workspaces"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Next" }));
    fireEvent.click(screen.getByRole("button", { name: "Next" }));

    expect(screen.getByText("Step 3 of 3")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next" }),
    ).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /Open SQL Workspace/ });
    expect(cta).toHaveAttribute("href", "/student/workspaces");
  });

  it("jumps directly to a step via its indicator dot", () => {
    render(
      <WorkspaceGuideModal
        icon={Database}
        title="SQL Workspace guide"
        description="A tour"
        steps={steps}
        ctaLabel="Open SQL Workspace"
        ctaHref="/student/workspaces"
        onClose={vi.fn()}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Go to step 3: Step three" }),
    );
    expect(screen.getByText("Third step body")).toBeInTheDocument();
  });

  it("closes on backdrop click but not on inner-panel click", () => {
    const onClose = vi.fn();
    render(
      <WorkspaceGuideModal
        icon={Database}
        title="SQL Workspace guide"
        description="A tour"
        steps={steps}
        ctaLabel="Open SQL Workspace"
        ctaHref="/student/workspaces"
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByText("First step body"));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
