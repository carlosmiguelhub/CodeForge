// How many points a distraction penalty is currently costing — independent
// of any particular rawScore, so the UI can explain a deduction (student
// side: "why is my score lower") using only violationCount + totalPoints,
// without needing the pre-deduction score threaded through every read
// path. Deliberately a fixed penalty against the total possible points,
// not a multiplicative percent-of-what-was-earned — two students with the
// same distraction count lose the same number of points regardless of how
// well they otherwise did. Don't "simplify" applyViolationDeduction below
// into `rawScore * (1 - excess * pct / 100)`; that's a different (rejected)
// formula that only happens to agree with this one when rawScore is always
// 0 or totalPoints, as it is for Activities' binary pass/fail — it diverges
// for Code Racing's partial-credit scores.
export function violationDeductionAmount(
  totalPoints: number,
  violationCount: number,
  allowedViolations: number,
  deductionPercent: number,
): number {
  const excess = Math.max(0, violationCount - allowedViolations);
  if (excess === 0) return 0;
  return Math.round((totalPoints * deductionPercent * excess) / 100);
}

export function applyViolationDeduction(
  rawScore: number,
  totalPoints: number,
  violationCount: number,
  allowedViolations: number,
  deductionPercent: number,
): number {
  const deduction = violationDeductionAmount(
    totalPoints,
    violationCount,
    allowedViolations,
    deductionPercent,
  );
  if (deduction === 0) return rawScore;
  return Math.max(0, rawScore - deduction);
}
