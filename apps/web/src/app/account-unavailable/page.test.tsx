import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signOut: vi.fn().mockResolvedValue(undefined),
  push: vi.fn(),
}));

vi.mock("@/components/auth/auth-provider", () => ({
  useAuth: () => ({ signOut: mocks.signOut }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("@/components/theme/theme-provider", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

import AccountUnavailablePage from "./page";

describe("AccountUnavailablePage", () => {
  it("automatically signs out on mount", () => {
    render(<AccountUnavailablePage />);
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
  });

  it("shows the suspension message", () => {
    render(<AccountUnavailablePage />);
    expect(
      screen.getByText("This account cannot continue"),
    ).toBeInTheDocument();
  });

  it("still lets the user manually sign out via the button", () => {
    render(<AccountUnavailablePage />);
    screen.getByRole("button", { name: "Sign out" }).click();
    expect(mocks.signOut).toHaveBeenCalled();
  });
});
