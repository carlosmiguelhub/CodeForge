import { describe, expect, it } from "vitest";

import {
  interactiveRunClientMessageSchema,
  interactiveRunServerMessageSchema,
} from "./interactive-run";

describe("interactive run contracts", () => {
  it("accepts start and line-oriented stdin messages", () => {
    expect(
      interactiveRunClientMessageSchema.parse({
        type: "start",
        language: "python",
        sourceCode: "print(input())",
      }),
    ).toMatchObject({ type: "start", language: "python" });
    expect(
      interactiveRunClientMessageSchema.parse({ type: "stdin", data: "Ada\n" }),
    ).toEqual({ type: "stdin", data: "Ada\n" });
  });

  it("rejects oversized source and stdin frames", () => {
    expect(
      interactiveRunClientMessageSchema.safeParse({
        type: "start",
        language: "python",
        sourceCode: "x".repeat(100_001),
      }).success,
    ).toBe(false);
    expect(
      interactiveRunClientMessageSchema.safeParse({
        type: "stdin",
        data: "x".repeat(10_001),
      }).success,
    ).toBe(false);
  });

  it("validates all server frame variants", () => {
    for (const message of [
      { type: "stdout", data: "Name: " },
      { type: "stderr", data: "warning" },
      { type: "exit", exitCode: 0 },
      { type: "error", message: "Time limit exceeded" },
    ]) {
      expect(interactiveRunServerMessageSchema.safeParse(message).success).toBe(
        true,
      );
    }
  });
});
