import axe from "axe-core";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

import { AuditLogList } from "./audit-log-list";

const event = {
  id: "00000000-0000-4000-8000-000000000010",
  actorId: "00000000-0000-4000-8000-000000000001",
  actorDisplayName: "Administrator",
  action: "account.active",
  targetId: "00000000-0000-4000-8000-000000000002",
  result: "succeeded" as const,
  reason: "Identity verified",
  occurredAt: "2026-08-19T00:00:00.000Z",
};

function listResponse(items: unknown[], total = items.length) {
  return new Response(JSON.stringify({ items, page: 1, pageSize: 20, total }));
}

describe("AuditLogList", () => {
  it("lists recorded audit events", async () => {
    mocks.authorizedFetch.mockResolvedValue(listResponse([event]));
    render(<AuditLogList />);
    await waitFor(() =>
      expect(screen.getByText("account.active")).toBeInTheDocument(),
    );
    expect(screen.getByText("Administrator")).toBeInTheDocument();
    expect(screen.getByText("succeeded")).toBeInTheDocument();
  });

  it("shows an honest empty state", async () => {
    mocks.authorizedFetch.mockResolvedValue(listResponse([]));
    render(<AuditLogList />);
    await waitFor(() =>
      expect(
        screen.getByText("No audit events match this filter."),
      ).toBeInTheDocument(),
    );
  });

  it("has no automated accessibility violations", async () => {
    mocks.authorizedFetch.mockResolvedValue(listResponse([event]));
    const { container } = render(<AuditLogList />);
    await waitFor(() =>
      expect(screen.getByText("account.active")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
