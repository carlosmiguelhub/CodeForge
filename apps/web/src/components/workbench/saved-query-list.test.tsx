import axe from "axe-core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(async (path: string) => {
    if (path.startsWith("/v1/workspaces"))
      return new Response(JSON.stringify([]));
    return new Response(JSON.stringify([]));
  }),
  push: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import { SavedQueryList } from "./saved-query-list";

const workspaceSummary = {
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
};

describe("SavedQueryList", () => {
  it("prompts for a workspace when none exists yet", async () => {
    mocks.authorizedFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/v1/workspaces"))
        return new Response(JSON.stringify([]));
      return new Response(JSON.stringify([]));
    });
    const { container, getByText } = render(<SavedQueryList role="student" />);
    await waitFor(() =>
      expect(
        getByText("Request a personal SQL workspace first."),
      ).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("has no automated accessibility violations in the empty state", async () => {
    mocks.authorizedFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/v1/workspaces"))
        return new Response(JSON.stringify([workspaceSummary]));
      return new Response(JSON.stringify([]));
    });
    const { container, getByText } = render(<SavedQueryList role="student" />);
    await waitFor(() =>
      expect(getByText("No saved queries yet.")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("lists saved queries once the caller's workspace is resolved", async () => {
    mocks.authorizedFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/v1/workspaces"))
        return new Response(JSON.stringify([workspaceSummary]));
      return new Response(
        JSON.stringify([
          {
            id: "00000000-0000-4000-8000-000000000040",
            ownerId: workspaceSummary.ownerId,
            workspaceId: workspaceSummary.id,
            name: "Top students",
            sql: "SELECT * FROM students ORDER BY score DESC LIMIT 10;",
            createdAt: "2026-08-18T07:00:00.000Z",
            updatedAt: "2026-08-19T09:00:00.000Z",
          },
        ]),
      );
    });
    const { getByText } = render(<SavedQueryList role="student" />);
    await waitFor(() => expect(getByText("Top students")).toBeInTheDocument());
    expect(getByText(/Created/)).toBeInTheDocument();
  });
});
