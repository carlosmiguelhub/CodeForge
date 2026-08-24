import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

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

const codeWorkspace = {
  ownerId: "00000000-0000-4000-8000-000000000010",
  content: {
    root: {
      id: "root",
      kind: "folder",
      name: "My files",
      children: [
        {
          id: "f1",
          kind: "file",
          name: "solution.py",
          language: "python",
          sourceCode: "print(1)",
        },
        {
          id: "folder1",
          kind: "folder",
          name: "Week 1",
          children: [
            {
              id: "f2",
              kind: "file",
              name: "main.c",
              language: "c",
              sourceCode: "int main() {}",
            },
          ],
        },
      ],
    },
    expanded: [],
    openFileIds: [],
    activeFileId: "",
  },
  createdAt: "2026-08-18T00:00:00.000Z",
  updatedAt: "2026-08-18T00:00:00.000Z",
};

const erdDiagram = {
  id: "00000000-0000-4000-8000-000000000040",
  ownerId: "00000000-0000-4000-8000-000000000010",
  name: "Library schema",
  createdAt: "2026-08-18T07:00:00.000Z",
  updatedAt: "2026-08-19T09:00:00.000Z",
};

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(async (path: string) => {
    if (path === "/v1/workspaces") return new Response(JSON.stringify([]));
    if (path === "/v1/code-workspace")
      return new Response(
        JSON.stringify({
          ownerId: "00000000-0000-4000-8000-000000000010",
          content: {
            root: {
              id: "root",
              kind: "folder",
              name: "My files",
              children: [],
            },
            expanded: [],
            openFileIds: [],
            activeFileId: "",
          },
          createdAt: "2026-08-18T00:00:00.000Z",
          updatedAt: "2026-08-18T00:00:00.000Z",
        }),
      );
    if (path === "/v1/erd-diagrams") return new Response(JSON.stringify([]));
    return new Response(JSON.stringify([]));
  }),
  executionFetch: vi.fn(async (path: string) => {
    if (path.startsWith("/v1/query-history"))
      return new Response(JSON.stringify([]));
    if (path === "/v1/code-execution-history")
      return new Response(JSON.stringify([]));
    return new Response(JSON.stringify([]));
  }),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    authorizedFetch: mocks.authorizedFetch,
    executionFetch: mocks.executionFetch,
    account: { displayName: "Ada" },
  }),
}));

import { StudentDashboard } from "./student-dashboard";

describe("StudentDashboard", () => {
  it("has no automated accessibility violations before any workspace exists", async () => {
    const { container, getByText } = render(<StudentDashboard />);
    await waitFor(() =>
      expect(getByText(/No activity yet/)).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("shows real counts for all three workspaces, not just SQL", async () => {
    mocks.authorizedFetch.mockImplementation(async (path: string) => {
      if (path === "/v1/workspaces")
        return new Response(JSON.stringify([workspaceSummary]));
      if (path === "/v1/code-workspace")
        return new Response(JSON.stringify(codeWorkspace));
      if (path === "/v1/erd-diagrams")
        return new Response(JSON.stringify([erdDiagram]));
      return new Response(JSON.stringify([]));
    });
    const { getByText } = render(<StudentDashboard />);
    // Two files across the tree (solution.py + Week 1/main.c).
    await waitFor(() => expect(getByText("2")).toBeInTheDocument());
    expect(getByText("Ready")).toBeInTheDocument();
    expect(getByText("1")).toBeInTheDocument();
  });

  it("merges SQL, code, and ERD activity into one feed sorted by recency", async () => {
    mocks.authorizedFetch.mockImplementation(async (path: string) => {
      if (path === "/v1/workspaces")
        return new Response(JSON.stringify([workspaceSummary]));
      if (path === "/v1/code-workspace")
        return new Response(JSON.stringify(codeWorkspace));
      if (path === "/v1/erd-diagrams")
        return new Response(JSON.stringify([erdDiagram]));
      return new Response(JSON.stringify([]));
    });
    mocks.executionFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/v1/query-history"))
        return new Response(
          JSON.stringify([
            {
              id: "q1",
              state: "successful",
              statementClasses: ["select"],
              durationMs: 12,
              rowsReturned: 3,
              startedAt: "2026-08-19T08:00:00.000Z",
            },
          ]),
        );
      if (path === "/v1/code-execution-history")
        return new Response(
          JSON.stringify([
            {
              id: "00000000-0000-4000-8000-000000000050",
              language: "python",
              status: "accepted",
              timeMs: 40,
              startedAt: "2026-08-19T10:00:00.000Z",
            },
          ]),
        );
      return new Response(JSON.stringify([]));
    });
    const { getByText } = render(<StudentDashboard />);
    // "select" only lands once the SQL history fetch (gated on the ready
    // workspace resolving first) completes, which is the last of the four
    // sources to settle — waiting on it means the other two are in too.
    await waitFor(() => expect(getByText("select")).toBeInTheDocument());
    expect(getByText("python")).toBeInTheDocument();
    expect(getByText("Library schema")).toBeInTheDocument();
  });

  it("opens each workspace's guide tour from its card, one at a time", async () => {
    render(<StudentDashboard />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /SQL Workspace/ }),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Saved queries and ERD generation"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Interactive prompts and stdin"),
    ).toBeInTheDocument();
    expect(screen.getByText("Routed relationship lines")).toBeInTheDocument();
    expect(screen.getByText("View 8-step guide")).toBeInTheDocument();
    expect(screen.getAllByText("View 7-step guide")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /SQL Workspace/ }));
    expect(screen.getByText("SQL Workspace guide")).toBeInTheDocument();
    expect(screen.getByText("Step 1 of 8")).toBeInTheDocument();
    expect(
      screen.getByText("Your private MySQL workspace"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Code Workspace guide")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Next/ }));
    expect(screen.getByText("A good first workflow")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close guide" }));
    expect(screen.queryByText("SQL Workspace guide")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /ERD Workspace/ }));
    expect(screen.getByText("ERD Workspace guide")).toBeInTheDocument();
  });

  it("no longer shows the old Quick Actions section", async () => {
    render(<StudentDashboard />);
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /SQL Workspace/ }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText("Quick actions")).not.toBeInTheDocument();
  });
});
