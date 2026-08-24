import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

import { SectionList } from "./section-list";

const activeSection = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "BSIT-3A",
  archivedAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  lockedWorkspaces: [],
};

const archivedSection = {
  id: "00000000-0000-4000-8000-000000000011",
  name: "BSIT-2B",
  archivedAt: "2026-08-19T00:00:00.000Z",
  createdAt: "2026-08-17T00:00:00.000Z",
  lockedWorkspaces: [],
};

describe("SectionList", () => {
  it("lists active sections and shows archived ones as removed", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify([activeSection, archivedSection])),
    );
    render(<SectionList />);
    await waitFor(() =>
      expect(screen.getByText("BSIT-3A")).toBeInTheDocument(),
    );
    expect(screen.getByText("BSIT-2B")).toBeInTheDocument();
    expect(screen.getByText("Removed")).toBeInTheDocument();
  });

  it("shows how many students are assigned to each section", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify([{ ...activeSection, memberCount: 12 }])),
    );
    render(<SectionList />);
    await waitFor(() =>
      expect(screen.getByText("BSIT-3A")).toBeInTheDocument(),
    );
    expect(screen.getByText("12 students")).toBeInTheDocument();
  });

  it("shows a singular count for exactly one student", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify([{ ...activeSection, memberCount: 1 }])),
    );
    render(<SectionList />);
    await waitFor(() =>
      expect(screen.getByText("BSIT-3A")).toBeInTheDocument(),
    );
    expect(screen.getByText("1 student")).toBeInTheDocument();
  });

  it("shows an honest empty state with no sections yet", async () => {
    mocks.authorizedFetch.mockResolvedValue(new Response(JSON.stringify([])));
    render(<SectionList />);
    await waitFor(() =>
      expect(
        screen.getByText(/No sections yet — add one above/),
      ).toBeInTheDocument(),
    );
  });

  it("creates a new section", async () => {
    mocks.authorizedFetch.mockResolvedValue(new Response(JSON.stringify([])));
    render(<SectionList />);
    await waitFor(() =>
      expect(
        screen.getByText(/No sections yet — add one above/),
      ).toBeInTheDocument(),
    );

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify(activeSection), { status: 201 }),
    );
    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([activeSection])),
    );
    fireEvent.change(screen.getByPlaceholderText("e.g. BSIT-3A"), {
      target: { value: "BSIT-3A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add section" }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        "/v1/admin/sections",
        expect.objectContaining({ method: "POST" }),
        true,
      ),
    );
    expect(await screen.findByText("BSIT-3A")).toBeInTheDocument();
  });

  it("removes (archives) an active section", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify([activeSection])),
    );
    render(<SectionList />);
    await waitFor(() =>
      expect(screen.getByText("BSIT-3A")).toBeInTheDocument(),
    );

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );
    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { ...activeSection, archivedAt: "2026-08-20T00:00:00.000Z" },
        ]),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        `/v1/admin/sections/${activeSection.id}`,
        expect.objectContaining({ method: "DELETE" }),
        true,
      ),
    );
    expect(await screen.findByText("Removed")).toBeInTheDocument();
  });

  it("restores an archived section", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify([archivedSection])),
    );
    render(<SectionList />);
    await waitFor(() =>
      expect(screen.getByText("Removed")).toBeInTheDocument(),
    );

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );
    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify([{ ...archivedSection, archivedAt: null }])),
    );
    fireEvent.click(screen.getByRole("button", { name: /Restore/ }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        `/v1/admin/sections/${archivedSection.id}/restore`,
        expect.objectContaining({ method: "POST" }),
        true,
      ),
    );
    await waitFor(() =>
      expect(screen.queryByText("Removed")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("BSIT-2B")).toBeInTheDocument();
  });

  it("surfaces the server's reason when a section can't be removed", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify([activeSection])),
    );
    render(<SectionList />);
    await waitFor(() =>
      expect(screen.getByText("BSIT-3A")).toBeInTheDocument(),
    );

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "VALIDATION_FAILED",
            message:
              "This section still has 3 accounts assigned to it. Reassign or remove them before removing the section.",
          },
        }),
        { status: 400 },
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Remove/ }));

    expect(
      await screen.findByText(/This section still has 3 accounts assigned/),
    ).toBeInTheDocument();
    // The section must still be listed as active, not silently removed.
    expect(screen.getByText("BSIT-3A")).toBeInTheDocument();
    expect(screen.queryByText("Removed")).not.toBeInTheDocument();
  });

  it("opens the workspace-lock dialog from a section row", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify([activeSection])),
    );
    render(<SectionList />);
    await waitFor(() =>
      expect(screen.getByText("BSIT-3A")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Settings/ }));

    expect(
      await screen.findByRole("dialog", { name: /Workspace access/ }),
    ).toBeInTheDocument();
  });

  it("has no automated accessibility violations", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify([activeSection])),
    );
    const { container } = render(<SectionList />);
    await waitFor(() =>
      expect(screen.getByText("BSIT-3A")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
