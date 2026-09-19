import { describe, expect, it } from "vitest";

import {
  applyViolationDeduction,
  violationDeductionAmount,
} from "./violation-scoring";

describe("applyViolationDeduction", () => {
  it("applies no deduction at or under the allowance", () => {
    expect(applyViolationDeduction(100, 100, 0, 5, 2.5)).toBe(100);
    expect(applyViolationDeduction(100, 100, 5, 5, 2.5)).toBe(100);
  });

  it("deducts a fixed percent of total points per excess violation", () => {
    // 1 excess: 100 * 2.5% * 1 = 2.5 -> rounds to 3
    expect(applyViolationDeduction(100, 100, 6, 5, 2.5)).toBe(97);
    // 2 excess: 100 * 2.5% * 2 = 5
    expect(applyViolationDeduction(100, 100, 7, 5, 2.5)).toBe(95);
    // 3 excess: 100 * 2.5% * 3 = 7.5 -> rounds to 8
    expect(applyViolationDeduction(100, 100, 8, 5, 2.5)).toBe(92);
  });

  it("deducts against total points, not the raw earned score", () => {
    // Partial-credit race: earned 60/100, 3 excess violations.
    // Deduction is 100 * 2.5% * 3 = 7.5 -> 8, off the earned 60, not a
    // percentage of the 60 itself.
    expect(applyViolationDeduction(60, 100, 8, 5, 2.5)).toBe(52);
  });

  it("floors at 0 and never goes negative", () => {
    expect(applyViolationDeduction(10, 100, 45, 5, 2.5)).toBe(0);
    expect(applyViolationDeduction(0, 100, 100, 5, 2.5)).toBe(0);
  });

  it("works with a different allowance/percent pair", () => {
    expect(applyViolationDeduction(100, 100, 6, 5, 10)).toBe(90);
    expect(applyViolationDeduction(100, 100, 4, 5, 10)).toBe(100);
  });
});

describe("violationDeductionAmount", () => {
  it("is 0 at or under the allowance", () => {
    expect(violationDeductionAmount(100, 0, 5, 2.5)).toBe(0);
    expect(violationDeductionAmount(100, 5, 5, 2.5)).toBe(0);
  });

  it("matches the deduction applyViolationDeduction actually subtracts", () => {
    expect(violationDeductionAmount(100, 8, 5, 2.5)).toBe(8);
    expect(100 - violationDeductionAmount(100, 8, 5, 2.5)).toBe(
      applyViolationDeduction(100, 100, 8, 5, 2.5),
    );
  });

  it("can be computed from just totalPoints and violationCount, independent of any rawScore", () => {
    // Same deduction amount whether the student earned a little or a lot —
    // this is the point: the UI can show "you lost N points" without
    // knowing the pre-deduction score.
    expect(violationDeductionAmount(100, 8, 5, 2.5)).toBe(8);
  });
});
