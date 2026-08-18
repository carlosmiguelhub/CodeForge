import axe from "axe-core";
import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizedFetch: vi.fn(async (path: string) =>
    path === "/v1/academic-options"
      ? new Response(JSON.stringify({ courses: [], terms: [] }))
      : new Response(JSON.stringify([])),
  ),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ authorizedFetch: mocks.authorizedFetch }),
}));

import { ClassList, classCodeFromInvitation } from "./class-list";

describe("ClassList", () => {
  it("extracts only a valid UUID from a shareable invitation", () => {
    const classId = "00000000-0000-4000-8000-000000000004";
    expect(classCodeFromInvitation(`${classId}.${"A".repeat(32)}`)).toBe(
      classId,
    );
    expect(classCodeFromInvitation("not-a-class.code")).toBeNull();
  });

  it("has no automated accessibility violations in the empty Teacher state", async () => {
    const { container, getByText } = render(<ClassList role="teacher" />);
    await waitFor(() =>
      expect(getByText("No classes yet.")).toBeInTheDocument(),
    );
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } },
    });
    expect(results.violations).toEqual([]);
  });
});
