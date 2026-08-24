import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

import type { Section } from "@sqweb/contracts";

import { SectionWorkspaceLockDialog } from "./section-workspace-lock-dialog";

const section: Section = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "BSIT-3A",
  archivedAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  lockedWorkspaces: ["sql-workbench"],
};

describe("SectionWorkspaceLockDialog", () => {
  beforeEach(() => {
    mocks.authorizedFetch.mockReset();
  });

  it("renders all 5 workspace toggles with the section's current lock state", () => {
    render(
      <SectionWorkspaceLockDialog
        section={section}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    expect(screen.getByText("SQL Workbench")).toBeInTheDocument();
    expect(screen.getByText("Code Compiler")).toBeInTheDocument();
    expect(screen.getByText("ERD Editor")).toBeInTheDocument();
    expect(screen.getByText("Saved Queries")).toBeInTheDocument();
    expect(screen.getByText("Java GUI Workspace")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Locked" })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Unlocked" })).toHaveLength(4);
  });

  it("toggles a workspace lock and saves via PATCH", async () => {
    const onSaved = vi.fn();
    mocks.authorizedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          ...section,
          lockedWorkspaces: ["sql-workbench", "code-compiler"],
        }),
      ),
    );
    render(
      <SectionWorkspaceLockDialog
        section={section}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getAllByRole("button", { name: "Unlocked" })[0]!);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        `/v1/admin/sections/${section.id}/locked-workspaces`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            lockedWorkspaces: ["sql-workbench", "code-compiler"],
          }),
        }),
        true,
      ),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("closes on cancel without saving", () => {
    const onClose = vi.fn();
    render(
      <SectionWorkspaceLockDialog
        section={section}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
    expect(mocks.authorizedFetch).not.toHaveBeenCalled();
  });

  it("closes on backdrop click", () => {
    const onClose = vi.fn();
    render(
      <SectionWorkspaceLockDialog
        section={section}
        onClose={onClose}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalled();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <SectionWorkspaceLockDialog
        section={section}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
