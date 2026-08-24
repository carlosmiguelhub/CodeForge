import axe from "axe-core";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

import { TopContributorsView } from "./top-contributors-view";

const items = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    rank: 1,
    displayName: "Ada Lovelace",
    sectionName: "BSIT-3A",
    contributionScore: 42,
    successfulWorkCount: 30,
    sqlExecutionCount: 20,
    codeExecutionCount: 10,
    erdDiagramCount: 5,
    savedQueryCount: 4,
    guiSessionCount: 3,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    rank: 2,
    displayName: "Grace Hopper",
    sectionName: null,
    contributionScore: 10,
    successfulWorkCount: 6,
    sqlExecutionCount: 5,
    codeExecutionCount: 2,
    erdDiagramCount: 1,
    savedQueryCount: 1,
    guiSessionCount: 1,
  },
];

describe("TopContributorsView", () => {
  it("ranks students by contribution score with their name and section", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify({ items })),
    );
    render(<TopContributorsView />);
    await waitFor(() =>
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument(),
    );
    expect(screen.getByText(/BSIT-3A/)).toBeInTheDocument();
    expect(screen.getByText("Grace Hopper")).toBeInTheDocument();
    expect(screen.getByText("No section")).toBeInTheDocument();
    expect(mocks.authorizedFetch).toHaveBeenCalledWith(
      "/v1/admin/top-contributors",
      {},
      true,
    );
  });

  it("shows the contribution score and successful work count", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify({ items })),
    );
    render(<TopContributorsView />);
    await waitFor(() =>
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument(),
    );
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("30 successful")).toBeInTheDocument();
  });

  it("renders a full-width meter bar for the top scorer", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify({ items })),
    );
    render(<TopContributorsView />);
    await waitFor(() =>
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument(),
    );
    const [topMeter] = screen.getAllByRole("meter");
    expect(topMeter).toHaveAttribute("aria-valuenow", "42");
    expect(topMeter).toHaveAttribute("aria-valuemax", "42");
  });

  it("shows an honest empty state with no contributors yet", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify({ items: [] })),
    );
    render(<TopContributorsView />);
    await waitFor(() =>
      expect(
        screen.getByText("No student contributions recorded yet."),
      ).toBeInTheDocument(),
    );
  });

  it("has no automated accessibility violations once loaded", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify({ items })),
    );
    const { container } = render(<TopContributorsView />);
    await waitFor(() =>
      expect(screen.getByText("Ada Lovelace")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
