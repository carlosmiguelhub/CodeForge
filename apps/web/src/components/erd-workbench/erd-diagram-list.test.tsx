import axe from "axe-core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(async () => new Response(JSON.stringify([]))),
  push: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

import { ErdDiagramList } from "./erd-diagram-list";

describe("ErdDiagramList", () => {
  it("has no automated accessibility violations in the empty state", async () => {
    mocks.authorizedFetch.mockResolvedValue(new Response(JSON.stringify([])));
    const { container, getByText } = render(<ErdDiagramList role="student" />);
    await waitFor(() =>
      expect(getByText("No diagrams yet.")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });

  it("lists saved diagrams with their created/updated dates", async () => {
    mocks.authorizedFetch.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "00000000-0000-4000-8000-000000000040",
            ownerId: "00000000-0000-4000-8000-000000000010",
            name: "Library schema",
            createdAt: "2026-08-18T07:00:00.000Z",
            updatedAt: "2026-08-19T09:00:00.000Z",
          },
        ]),
      ),
    );
    const { getByText } = render(<ErdDiagramList role="student" />);
    await waitFor(() =>
      expect(getByText("Library schema")).toBeInTheDocument(),
    );
    expect(getByText(/Created/)).toBeInTheDocument();
  });
});
