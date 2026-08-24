import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { InteractiveConsole } from "./interactive-console";

describe("InteractiveConsole", () => {
  it("submits one line at a time and clears the input", () => {
    const onSubmit = vi.fn();
    render(
      <InteractiveConsole
        entries={[{ id: "1", kind: "stdout", data: "Name: " }]}
        state="running"
        onSubmit={onSubmit}
        onStop={vi.fn()}
      />,
    );
    const input = screen.getByLabelText("Program input");
    fireEvent.change(input, { target: { value: "Ada" } });
    fireEvent.submit(input.closest("form")!);
    expect(onSubmit).toHaveBeenCalledWith("Ada");
    expect(input).toHaveValue("");
  });

  it("disables input after completion and exposes Stop while active", () => {
    const { rerender } = render(
      <InteractiveConsole
        entries={[]}
        state="running"
        onSubmit={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: "Stop" })).toBeInTheDocument();
    rerender(
      <InteractiveConsole
        entries={[]}
        state="finished"
        onSubmit={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Program input")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Stop" })).toBeNull();
  });
});
