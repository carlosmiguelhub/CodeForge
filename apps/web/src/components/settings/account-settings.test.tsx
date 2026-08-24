import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateDisplayName: vi.fn().mockResolvedValue(undefined),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  account: {
    id: "00000000-0000-4000-8000-000000000010",
    firebaseUid: "firebase-user",
    email: "ada@example.edu",
    displayName: "Ada Lovelace",
    institutionId: "00000000-0000-4000-8000-000000000001",
    status: "active" as const,
    roles: ["student" as const],
    sectionId: null,
    authorizationVersion: 1,
  },
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    account: mocks.account,
    updateDisplayName: mocks.updateDisplayName,
    sendPasswordReset: mocks.sendPasswordReset,
  }),
}));

import { AccountSettings } from "./account-settings";

describe("AccountSettings", () => {
  it("shows the signed-in account's name, email, role, and status", () => {
    render(<AccountSettings />);
    expect(screen.getByDisplayValue("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("ada@example.edu")).toBeInTheDocument();
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("keeps the save button disabled until the name actually changes", () => {
    render(<AccountSettings />);
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();

    fireEvent.change(screen.getByDisplayValue("Ada Lovelace"), {
      target: { value: "Ada Byron" },
    });
    expect(
      screen.getByRole("button", { name: "Save changes" }),
    ).not.toBeDisabled();
  });

  it("saves a changed display name", async () => {
    render(<AccountSettings />);
    fireEvent.change(screen.getByDisplayValue("Ada Lovelace"), {
      target: { value: "Ada Byron" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mocks.updateDisplayName).toHaveBeenCalledWith("Ada Byron"),
    );
    expect(
      await screen.findByText("Display name updated."),
    ).toBeInTheDocument();
  });

  it("sends a password reset link to the account's own email", async () => {
    render(<AccountSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Send reset link" }));

    await waitFor(() =>
      expect(mocks.sendPasswordReset).toHaveBeenCalledWith("ada@example.edu"),
    );
    expect(
      await screen.findByText(
        "Check ada@example.edu for a link to set a new password.",
      ),
    ).toBeInTheDocument();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(<AccountSettings />);
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
