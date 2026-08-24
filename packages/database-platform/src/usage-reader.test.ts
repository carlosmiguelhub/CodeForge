import { describe, expect, it } from "vitest";

import { toDateOrNull } from "./usage-reader";

describe("toDateOrNull", () => {
  it("passes through a real Date instance unchanged", () => {
    const date = new Date("2026-08-19T10:30:17.000Z");
    expect(toDateOrNull(date)).toBe(date);
  });

  it("parses a MySQL-style datetime string returned by a raw MAX(...) aggregate", () => {
    // This is the actual runtime shape mysql2 returns for a MAX() on a
    // TIMESTAMP column, despite Drizzle's `sql<Date | null>` type claiming
    // it comes back as a Date — regression coverage for the bug where
    // calling `.getTime()` on this value threw "not a function".
    const result = toDateOrNull("2026-08-19 10:30:17");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getTime()).not.toBeNaN();
  });

  it("returns null for null or undefined", () => {
    expect(toDateOrNull(null)).toBeNull();
    expect(toDateOrNull(undefined)).toBeNull();
  });
});
