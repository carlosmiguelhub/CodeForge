import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  publicFetch: vi.fn(),
  completeRegistration: vi.fn(),
  replace: vi.fn(),
  state: "unregistered" as string,
  account: null as unknown,
  error: null as string | null,
  user: { displayName: "Ada Lovelace" } as unknown,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    state: mocks.state,
    account: mocks.account,
    error: mocks.error,
    user: mocks.user,
    publicFetch: mocks.publicFetch,
    completeRegistration: mocks.completeRegistration,
    reloadIdentity: vi.fn(),
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
}));

vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

import { setPendingSectionId } from "@/lib/pending-section";

import ContinuePage from "./page";

const section = {
  id: "00000000-0000-4000-8000-000000000010",
  name: "BSIT-3A",
  archivedAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  lockedWorkspaces: [],
};

describe("ContinuePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.sessionStorage.clear();
    mocks.state = "unregistered";
    mocks.account = null;
    mocks.error = null;
    mocks.publicFetch.mockResolvedValue(new Response(JSON.stringify([section])));
  });

  it("lets the student pick a section and retry when the stored one didn't survive email verification", async () => {
    // Simulates verifying on a different device: sessionStorage never had
    // the section chosen at /register, so the deferred completeRegistration
    // call goes out without one and the backend rejects it.
    mocks.completeRegistration.mockRejectedValueOnce(
      new Error("Registration could not be completed. Try again."),
    );
    render(<ContinuePage />);

    await waitFor(() =>
      expect(mocks.completeRegistration).toHaveBeenCalledWith(
        "Ada Lovelace",
        "student",
        undefined,
      ),
    );

    const picker = await screen.findByLabelText("Section");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "BSIT-3A" }),
      ).toBeInTheDocument(),
    );
    fireEvent.change(picker, { target: { value: section.id } });

    mocks.completeRegistration.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    await waitFor(() =>
      expect(mocks.completeRegistration).toHaveBeenCalledWith(
        "Ada Lovelace",
        "student",
        section.id,
      ),
    );
  });

  it("pre-fills the picker with the pending section id when it IS still available", async () => {
    setPendingSectionId(section.id);
    mocks.completeRegistration.mockRejectedValueOnce(
      new Error("Registration could not be completed. Try again."),
    );
    render(<ContinuePage />);

    await waitFor(() =>
      expect(mocks.completeRegistration).toHaveBeenCalledWith(
        "Ada Lovelace",
        "student",
        section.id,
      ),
    );

    const picker = await screen.findByLabelText<HTMLSelectElement>("Section");
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "BSIT-3A" }),
      ).toBeInTheDocument(),
    );
    expect(picker.value).toBe(section.id);
  });
});
