import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  replace: vi.fn(),
  refresh: vi.fn(),
  standalone: false,
  account: undefined as { displayName: string; email: string } | undefined,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ signOut: mocks.signOut, account: mocks.account }),
}));

vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

vi.mock("@/lib/use-standalone-display-mode", () => ({
  useStandaloneDisplayMode: () => mocks.standalone,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace, refresh: mocks.refresh }),
}));

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.account = undefined;
    mocks.standalone = false;
    window.localStorage.clear();
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
    expect(
      screen.getByRole("link", { name: "Database Templates" }),
    ).toBeInTheDocument();
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

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    await waitFor(() => expect(mocks.signOut).toHaveBeenCalledOnce());
    expect(mocks.replace).toHaveBeenCalledWith("/login");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("shows the signed-in account's name and email in the profile menu", () => {
    mocks.account = {
      displayName: "Ada Lovelace",
      email: "ada@example.edu",
    };
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

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    // "Ada Lovelace" now also renders beside the page title in the header,
    // so both instances must be present rather than a single unique match.
    expect(screen.getAllByText("Ada Lovelace")).toHaveLength(2);
    expect(screen.getByText("ada@example.edu")).toBeInTheDocument();
  });

  it("shows the account name beside the page title in the header", () => {
    mocks.account = { displayName: "Ada Lovelace", email: "ada@example.edu" };
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

    const heading = screen.getByRole("heading", { name: /Dashboard/ });
    expect(heading).toHaveTextContent("Dashboard");
    expect(heading).toHaveTextContent("Ada Lovelace");
  });

  it("omits the separator when no account has loaded yet", () => {
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

    expect(
      screen.getByRole("heading", { name: "Dashboard" }),
    ).toBeInTheDocument();
  });

  it("links to the account settings page from the profile menu", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "href",
      "/settings",
    );
  });

  it("keeps the sidebar collapsed across a fresh mount, as happens on a sidebar-link navigation", () => {
    const { unmount } = render(
      <AppShell
        role="student"
        activeHref="/student"
        eyebrow="Student workspace"
        pageTitle="Dashboard"
      >
        <p>Content</p>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();

    // Every page wraps its content in its own AppShell, so a sidebar-link
    // click unmounts this instance and mounts a brand new one for the next
    // page — simulate exactly that instead of re-rendering the same one.
    unmount();
    render(
      <AppShell
        role="student"
        activeHref="/student/workspaces"
        eyebrow="Student workspace"
        pageTitle="SQL Workspace"
      >
        <p>Other content</p>
      </AppShell>,
    );

    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeInTheDocument();
  });

  it("opens an honest empty state from the notifications button", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByText("No notifications yet.")).toBeInTheDocument();
  });

  it("replaces the mobile menu trigger with PWA bottom navigation in standalone mode", () => {
    mocks.standalone = true;
    render(
      <AppShell
        role="student"
        activeHref="/student/workspaces"
        eyebrow="Student workspace"
        pageTitle="SQL Workspace"
      >
        <p>Content</p>
      </AppShell>,
    );

    expect(
      screen.queryByRole("button", { name: "Open navigation" }),
    ).not.toBeInTheDocument();

    const bottomNavigation = screen.getByRole("navigation", {
      name: "Primary",
    });
    expect(
      within(bottomNavigation).getByRole("link", { name: "SQL Workspace" }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(bottomNavigation).queryByRole("link", { name: "Saved Queries" }),
    ).not.toBeInTheDocument();

    const more = within(bottomNavigation).getByRole("button", {
      name: "More navigation",
    });
    fireEvent.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(more).toHaveClass("text-action-soft");
    expect(
      screen
        .getByRole("navigation", { name: "Student navigation" })
        .closest("aside"),
    ).toHaveClass("translate-x-0");
    expect(screen.getByRole("main")).toHaveClass(
      "pb-[calc(4rem+env(safe-area-inset-bottom))]",
    );
  });
});
