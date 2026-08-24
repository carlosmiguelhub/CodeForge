import axe from "axe-core";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

vi.mock("./user-detail-panel", () => ({
  UserDetailPanel: ({ firebaseUid }: { firebaseUid: string }) => (
    <div data-testid="detail-panel">{firebaseUid}</div>
  ),
}));

vi.mock("./add-user-dialog", () => ({
  AddUserDialog: () => <div data-testid="add-user-dialog" />,
}));

import { UserList } from "./user-list";

const pendingTeacher = {
  id: "00000000-0000-4000-8000-000000000010",
  firebaseUid: "teacher-1",
  email: "teacher-1@example.edu",
  displayName: "Teacher One",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "pending_approval",
  roles: [],
  sectionId: null,
  authorizationVersion: 1,
};

const activeStudent = {
  id: "00000000-0000-4000-8000-000000000011",
  firebaseUid: "student-1",
  email: "student-1@example.edu",
  displayName: "Student One",
  institutionId: "00000000-0000-4000-8000-000000000001",
  status: "active",
  roles: ["student"],
  sectionId: null,
  authorizationVersion: 1,
};

function listResponse(items: unknown[], total = items.length) {
  return new Response(JSON.stringify({ items, page: 1, pageSize: 20, total }));
}

const section = {
  id: "00000000-0000-4000-8000-000000000020",
  name: "BSIT-3A",
  archivedAt: null,
  createdAt: "2026-08-18T00:00:00.000Z",
  lockedWorkspaces: [],
};

function mockUsersAndSections(items: unknown[], sections: unknown[] = [section]) {
  mocks.authorizedFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/v1/admin/sections"))
      return new Response(JSON.stringify(sections));
    return listResponse(items);
  });
}

describe("UserList", () => {
  it("lists users with role and status columns", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      listResponse([pendingTeacher, activeStudent]),
    );
    render(<UserList />);
    await waitFor(() =>
      expect(screen.getByText("Teacher One")).toBeInTheDocument(),
    );
    const table = screen.getByRole("table");
    expect(within(table).getByText("Student")).toBeInTheDocument();
    expect(within(table).getByText("Awaiting approval")).toBeInTheDocument();
  });

  it("approves a pending account inline", async () => {
    mocks.authorizedFetch.mockResolvedValue(listResponse([pendingTeacher]));
    render(<UserList />);
    await waitFor(() =>
      expect(screen.getByText("Teacher One")).toBeInTheDocument(),
    );

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ ...pendingTeacher, status: "active", roles: ["teacher"] }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: /Approve/ }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        "/v1/admin/users/teacher-1/status",
        expect.objectContaining({ method: "PATCH" }),
        true,
      ),
    );
    const table = await screen.findByRole("table");
    await waitFor(() =>
      expect(within(table).getByText("Active")).toBeInTheDocument(),
    );
  });

  it("opens the detail panel for a non-pending account", async () => {
    mocks.authorizedFetch.mockResolvedValue(listResponse([activeStudent]));
    render(<UserList />);
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Manage" }));
    expect(await screen.findByTestId("detail-panel")).toHaveTextContent(
      "student-1",
    );
  });

  it("opens the add-user dialog", async () => {
    mocks.authorizedFetch.mockResolvedValue(listResponse([]));
    render(<UserList />);
    await waitFor(() =>
      expect(screen.getByText("No users match these filters.")).toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Add user" }));
    expect(await screen.findByTestId("add-user-dialog")).toBeInTheDocument();
  });

  it("shows which section each account belongs to", async () => {
    mockUsersAndSections([{ ...activeStudent, sectionId: section.id }]);
    render(<UserList />);
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    const table = screen.getByRole("table");
    expect(await within(table).findByText("BSIT-3A")).toBeInTheDocument();
  });

  it("shows a dash for an account with no section", async () => {
    mockUsersAndSections([activeStudent]);
    render(<UserList />);
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    const table = screen.getByRole("table");
    await waitFor(() =>
      expect(within(table).getByText("—")).toBeInTheDocument(),
    );
  });

  it("filters the account list by section", async () => {
    mockUsersAndSections([activeStudent]);
    render(<UserList />);
    await waitFor(() =>
      expect(screen.getByText("Student One")).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "BSIT-3A" }),
      ).toBeInTheDocument(),
    );

    fireEvent.change(screen.getByLabelText("Filter by section"), {
      target: { value: section.id },
    });

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        expect.stringContaining(`sectionId=${section.id}`),
        {},
        true,
      ),
    );
  });

  it("has no automated accessibility violations", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      listResponse([pendingTeacher, activeStudent]),
    );
    const { container } = render(<UserList />);
    await waitFor(() =>
      expect(screen.getByText("Teacher One")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
