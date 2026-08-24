import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publicFetch: vi.fn(),
  createEmailAccount: vi.fn().mockResolvedValue(undefined),
  signOut: vi.fn().mockResolvedValue(undefined),
  push: vi.fn(),
  error: null as string | null,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    publicFetch: mocks.publicFetch,
    createEmailAccount: mocks.createEmailAccount,
    signOut: mocks.signOut,
    error: mocks.error,
    state: "anonymous",
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

import { getPendingSectionId } from "@/lib/pending-section";

import RegisterPage from "./page";

const section = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "BSIT-3A",
  archivedAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  lockedWorkspaces: [],
};

async function fillCommonFields() {
  fireEvent.change(screen.getByLabelText("Display name"), {
    target: { value: "Ada Lovelace" },
  });
  // Retries briefly rather than a one-shot query — the section field's
  // accessible name is only stable once the async section-list fetch has
  // fully settled (it briefly includes an error message on any late,
  // superseded fetch resolution).
  fireEvent.change(await screen.findByLabelText("Section"), {
    target: { value: section.id },
  });
  fireEvent.change(screen.getByLabelText("Email address"), {
    target: { value: "ada@example.edu" },
  });
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createEmailAccount.mockResolvedValue(undefined);
    mocks.signOut.mockResolvedValue(undefined);
    mocks.error = null;
  });

  it("loads the section list and lets the student pick one", async () => {
    mocks.publicFetch.mockResolvedValue(
      new Response(JSON.stringify([section])),
    );
    render(<RegisterPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "BSIT-3A" }),
      ).toBeInTheDocument(),
    );
  });

  it("rejects a password with no special character before calling Firebase", async () => {
    mocks.publicFetch.mockResolvedValue(
      new Response(JSON.stringify([section])),
    );
    render(<RegisterPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "BSIT-3A" }),
      ).toBeInTheDocument(),
    );
    await fillCommonFields();
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "longenough1" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "longenough1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText(
        "Include at least one special character (e.g. ! @ # $ %).",
      ),
    ).toBeInTheDocument();
    expect(mocks.createEmailAccount).not.toHaveBeenCalled();
  });

  it("rejects mismatched password confirmation", async () => {
    mocks.publicFetch.mockResolvedValue(
      new Response(JSON.stringify([section])),
    );
    render(<RegisterPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "BSIT-3A" }),
      ).toBeInTheDocument(),
    );
    await fillCommonFields();
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Str0ng!Pass" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Different!1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("Passwords do not match."),
    ).toBeInTheDocument();
    expect(mocks.createEmailAccount).not.toHaveBeenCalled();
  });

  it("creates the account and relays the chosen section for /continue", async () => {
    window.sessionStorage.clear();
    mocks.publicFetch.mockResolvedValue(
      new Response(JSON.stringify([section])),
    );
    render(<RegisterPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "BSIT-3A" }),
      ).toBeInTheDocument(),
    );
    await fillCommonFields();
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "Str0ng!Pass" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Str0ng!Pass" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(mocks.createEmailAccount).toHaveBeenCalledWith(
        "ada@example.edu",
        "Str0ng!Pass",
        "Ada Lovelace",
      ),
    );
    await waitFor(() =>
      expect(mocks.push).toHaveBeenCalledWith("/login?registered=1"),
    );
    expect(getPendingSectionId()).toBe(section.id);
  });

  it("has no automated accessibility violations once sections load", async () => {
    mocks.publicFetch.mockResolvedValue(
      new Response(JSON.stringify([section])),
    );
    const { container } = render(<RegisterPage />);
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "BSIT-3A" }),
      ).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
