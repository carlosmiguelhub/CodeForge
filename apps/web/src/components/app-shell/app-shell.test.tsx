import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ signOut: mocks.signOut }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  it("renders teacher navigation from the shared role definition", () => {
    render(
      <AppShell
        role="teacher"
        activeHref="/teacher"
        eyebrow="Teacher workspace"
        pageTitle="Dashboard"
      >
        <p>Content</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("navigation", { name: "Teacher navigation" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Grading" })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "Grades" }),
    ).not.toBeInTheDocument();
  });

  it("marks the active route and exposes a skip link", () => {
    render(
      <AppShell
        role="student"
        activeHref="/student"
        eyebrow="Student workspace"
        pageTitle="Dashboard"
      >
        <p>Content</p>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("link", { name: "Skip to main content" }),
    ).toHaveAttribute("href", "#main-content");
  });

  it("does not expose a SQL workspace route to administrators", () => {
    render(
      <AppShell
        role="administrator"
        activeHref="/admin"
        eyebrow="Administrator workspace"
        pageTitle="Dashboard"
      >
        <p>Content</p>
      </AppShell>,
    );

    expect(
      screen.queryByRole("link", { name: "SQL Workspace" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Audit Logs" }),
    ).toBeInTheDocument();
  });

  it("signs out and redirects to login from the persistent shell", async () => {
    render(
      <AppShell
        role="teacher"
        activeHref="/teacher"
        eyebrow="Teacher workspace"
        pageTitle="Dashboard"
      >
        <p>Content</p>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith("/login");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});
