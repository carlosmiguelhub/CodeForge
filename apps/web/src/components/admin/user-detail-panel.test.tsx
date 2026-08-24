import type { AccountProfile } from "@sqweb/contracts";
import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
  sendPasswordReset: vi.fn().mockResolvedValue(undefined),
  onClose: vi.fn(),
  onChanged: vi.fn(),
  onDeleted: vi.fn(),
  account: undefined as { firebaseUid: string } | undefined,
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    authorizedFetch: mocks.authorizedFetch,
    sendPasswordReset: mocks.sendPasswordReset,
    account: mocks.account,
  }),
}));

import { UserDetailPanel } from "./user-detail-panel";

const student: AccountProfile = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "student-1",
  email: "student-1@example.edu",
  displayName: "Student One",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["student"],
  sectionId: null,
  authorizationVersion: 1,
};

const usage = {
  workspaceState: "ready",
  erdDiagramCount: 2,
  codeFileCount: 5,
  savedQueryCount: 1,
  sqlExecutionCount: 10,
  codeExecutionCount: 3,
  guiSessionCount: 4,
  lastActiveAt: "2026-08-19T00:00:00.000Z",
};

function mockLoad(account = student) {
  mocks.authorizedFetch.mockImplementation(async (path: string) => {
    if (path.endsWith("/usage")) return new Response(JSON.stringify(usage));
    return new Response(JSON.stringify(account));
  });
}

const section = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "BSIT-3A",
  archivedAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  lockedWorkspaces: [],
};

describe("UserDetailPanel", () => {
  beforeEach(() => {
    mocks.onClose.mockClear();
    mocks.onChanged.mockClear();
    mocks.onDeleted.mockClear();
  });

  it("shows the account's current section pre-selected", async () => {
    mockLoad({ ...student, sectionId: section.id });
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        sections={[section]}
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Section")).toHaveValue(section.id);
    // No pending change yet, so no Save button.
    expect(
      screen.queryByRole("button", { name: "Save" }),
    ).not.toBeInTheDocument();
  });

  it("defaults to no section for an account with none assigned", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        sections={[section]}
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Section")).toHaveValue("");
  });

  it("reassigns a student's section", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        sections={[section]}
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Section"), {
      target: { value: section.id },
    });
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ ...student, sectionId: section.id })),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        "/v1/admin/users/student-1/section",
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ sectionId: section.id }),
        }),
        true,
      ),
    );
    expect(await screen.findByText("Section updated.")).toBeInTheDocument();
    expect(mocks.onChanged).toHaveBeenCalledWith(
      expect.objectContaining({ sectionId: section.id }),
    );
  });

  it("loads and shows the account's roles and usage", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    expect(screen.getByText("Student")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Java GUI sessions")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
  });

  it("assigns a new role", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...student, roles: ["student", "teacher"] }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Teacher" }));

    await waitFor(() =>
      expect(mocks.onChanged).toHaveBeenCalledWith(
        expect.objectContaining({ roles: ["student", "teacher"] }),
      ),
    );
  });

  it("requires a reason of at least 8 characters before confirming a status change", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Suspend" }));
    const confirmButton = screen.getByRole("button", {
      name: "Confirm suspended",
    });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Violated the honor code" },
    });
    expect(confirmButton).not.toBeDisabled();
  });

  it("sends a reset-password link after recording the audit action", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );

    mocks.authorizedFetch.mockResolvedValueOnce(new Response(null, { status: 204 }));
    fireEvent.click(screen.getByRole("button", { name: /Send reset link/ }));

    await waitFor(() =>
      expect(mocks.sendPasswordReset).toHaveBeenCalledWith(
        "student-1@example.edu",
      ),
    );
    expect(
      await screen.findByText(
        "A password reset link was sent to student-1@example.edu.",
      ),
    ).toBeInTheDocument();
  });

  it("sets a password directly", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Set password directly/ }),
    );
    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "New-Passw0rd!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "New-Passw0rd!" },
    });

    const changeButton = screen.getByRole("button", {
      name: "Change password",
    });
    expect(changeButton).not.toBeDisabled();

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );
    fireEvent.click(changeButton);

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        "/v1/admin/users/student-1/set-password",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ password: "New-Passw0rd!" }),
        }),
        true,
      ),
    );
    expect(
      await screen.findByText("Password changed directly."),
    ).toBeInTheDocument();
  });

  it("disables the change-password button for a weak or mismatched password", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: /Set password directly/ }),
    );
    const changeButton = screen.getByRole("button", {
      name: "Change password",
    });

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "short" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "short" },
    });
    expect(changeButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText("New password"), {
      target: { value: "New-Passw0rd!" },
    });
    fireEvent.change(screen.getByLabelText("Confirm password"), {
      target: { value: "Different-1!" },
    });
    expect(changeButton).toBeDisabled();
  });

  it("deletes an account after confirming", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Delete account/ }));
    expect(
      screen.getByText(/This permanently deletes/),
    ).toBeInTheDocument();

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(null, { status: 204 }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete permanently" }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        "/v1/admin/users/student-1",
        expect.objectContaining({ method: "DELETE" }),
        true,
      ),
    );
    expect(mocks.onDeleted).toHaveBeenCalledWith("student-1");
  });

  it("closes the delete confirmation without deleting on cancel", async () => {
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByRole("button", { name: /Delete account/ }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByText(/This permanently deletes/),
    ).not.toBeInTheDocument();
    expect(mocks.onDeleted).not.toHaveBeenCalled();
  });

  it("disables the delete button for the admin's own account", async () => {
    mocks.account = { firebaseUid: "student-1" };
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /Delete account/ }),
    ).toBeDisabled();
    mocks.account = undefined;
  });

  it("disables role and status controls for the admin's own account", async () => {
    mocks.account = { firebaseUid: "student-1" };
    mockLoad();
    render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Suspend" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Teacher" })).toBeDisabled();
    mocks.account = undefined;
  });

  it("has no automated accessibility violations once loaded", async () => {
    mockLoad();
    const { container } = render(
      <UserDetailPanel
        firebaseUid="student-1"
        onClose={mocks.onClose}
        onChanged={mocks.onChanged}
        onDeleted={mocks.onDeleted}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
