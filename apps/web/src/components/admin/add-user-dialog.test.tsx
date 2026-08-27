import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
  onCreated: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    authorizedFetch: mocks.authorizedFetch,
    sendPasswordReset: mocks.sendPasswordReset,
  }),
}));

import { AddUserDialog } from "./add-user-dialog";

const createdAccount = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "new-firebase-uid",
  email: "new@example.edu",
  displayName: "New Person",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["student"],
  sectionId: null,
  authorizationVersion: 1,
};

describe("AddUserDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendPasswordReset.mockResolvedValue(undefined);
  });

  it("creates a user and triggers the initial password-reset email", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(JSON.stringify(createdAccount), { status: 201 }),
    );
    render(
      <AddUserDialog onClose={mocks.onClose} onCreated={mocks.onCreated} />,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "new@example.edu" },
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "New Person" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        "/v1/admin/users",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(mocks.sendPasswordReset).toHaveBeenCalledWith("new@example.edu"),
    );
    expect(mocks.onCreated).toHaveBeenCalledWith(createdAccount);
  });

  it("surfaces a clear message when the email is already registered", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response("{}", { status: 409 }),
    );
    render(
      <AddUserDialog onClose={mocks.onClose} onCreated={mocks.onCreated} />,
    );

    fireEvent.change(screen.getByLabelText("Email address"), {
      target: { value: "dup@example.edu" },
    });
    fireEvent.change(screen.getByLabelText("Display name"), {
      target: { value: "Dup Person" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create account" }));

    expect(
      await screen.findByText("An account already uses this email address."),
    ).toBeInTheDocument();
    expect(mocks.onCreated).not.toHaveBeenCalled();
  });

  it("has no automated accessibility violations", async () => {
    const { container } = render(
      <AddUserDialog onClose={mocks.onClose} onCreated={mocks.onCreated} />,
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
