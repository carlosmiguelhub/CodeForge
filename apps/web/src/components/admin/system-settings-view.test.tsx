import axe from "axe-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
  publicFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({
    authorizedFetch: mocks.authorizedFetch,
    publicFetch: mocks.publicFetch,
  }),
}));

import { SystemSettingsView } from "./system-settings-view";

const status = { maintenanceMode: false, message: null };

function mockLoad() {
  mocks.publicFetch.mockResolvedValue(new Response(JSON.stringify(status)));
}

describe("SystemSettingsView", () => {
  beforeEach(() => {
    mocks.authorizedFetch.mockReset();
    mocks.publicFetch.mockReset();
  });

  it("requires a reason of at least 8 characters before resetting", async () => {
    mockLoad();
    render(<SystemSettingsView />);
    await waitFor(() =>
      expect(screen.getByText("System is live")).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reset activity numbers" }),
    );
    const confirmButton = screen.getByRole("button", { name: "Reset now" });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Clearing test data" },
    });
    expect(confirmButton).not.toBeDisabled();
  });

  it("posts the reset request with the reason and shows the cleared counts", async () => {
    mockLoad();
    render(<SystemSettingsView />);
    await waitFor(() =>
      expect(screen.getByText("System is live")).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reset activity numbers" }),
    );
    fireEvent.change(screen.getByLabelText(/Reason/), {
      target: { value: "Clearing test data" },
    });

    mocks.authorizedFetch.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          sqlExecutionsCleared: 12,
          codeExecutionsCleared: 5,
          guiSessionsCleared: 2,
          resetAt: "2026-08-24T00:00:00.000Z",
        }),
      ),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reset now" }));

    await waitFor(() =>
      expect(mocks.authorizedFetch).toHaveBeenCalledWith(
        "/v1/admin/settings/activity-reset",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ reason: "Clearing test data" }),
        }),
      ),
    );
    expect(
      await screen.findByText(/Cleared 19 activity records/),
    ).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("SQL runs cleared")).toBeInTheDocument();
  });

  it("cancels the confirmation without resetting anything", async () => {
    mockLoad();
    render(<SystemSettingsView />);
    await waitFor(() =>
      expect(screen.getByText("System is live")).toBeInTheDocument(),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Reset activity numbers" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("button", { name: "Reset now" }),
    ).not.toBeInTheDocument();
    expect(mocks.authorizedFetch).not.toHaveBeenCalled();
  });

  it("has no automated accessibility violations once loaded", async () => {
    mockLoad();
    const { container } = render(<SystemSettingsView />);
    await waitFor(() =>
      expect(screen.getByText("System is live")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
