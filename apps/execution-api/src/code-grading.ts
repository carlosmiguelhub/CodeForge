import type {
  ActivityComparisonMode,
  ActivityTestRunResult,
  CodeLanguage,
} from "@sqweb/contracts";

import type { CodeJudgeClient } from "./code-judge-client";

// Trims trailing whitespace per line and normalizes line endings before
// comparing to the answer key — an exact byte comparison would fail a
// correct solution over a trailing newline or a stray space, which isn't
// what "wrong answer" should mean here.
export function normalizeOutput(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function outputTokens(value: string): string[] {
  const normalized = value.trim();
  return normalized === "" ? [] : normalized.split(/\s+/);
}

export function outputsMatch(
  actual: string,
  expected: string,
  mode: ActivityComparisonMode,
  numericTolerance: number | null,
): boolean {
  if (mode === "normalized_exact") {
    return normalizeOutput(actual) === normalizeOutput(expected);
  }
  if (mode === "suffix_exact") {
    return normalizeOutput(actual).endsWith(normalizeOutput(expected));
  }
  const actualTokens = outputTokens(actual);
  const expectedTokens = outputTokens(expected);
  if (actualTokens.length !== expectedTokens.length) return false;
  if (mode === "token") {
    return actualTokens.every(
      (token, index) => token === expectedTokens[index],
    );
  }
  const tolerance = numericTolerance ?? 0;
  return actualTokens.every((token, index) => {
    const actualNumber = Number(token);
    const expectedNumber = Number(expectedTokens[index]);
    return (
      Number.isFinite(actualNumber) &&
      Number.isFinite(expectedNumber) &&
      Math.abs(actualNumber - expectedNumber) <= tolerance
    );
  });
}

function resultStatus(
  judgeStatus: Awaited<ReturnType<CodeJudgeClient["run"]>>["status"],
  passed: boolean,
): ActivityTestRunResult["status"] {
  if (passed) return "passed";
  if (judgeStatus === "accepted" || judgeStatus === "wrong_answer") {
    return "wrong_answer";
  }
  if (judgeStatus === "compile_error") return "compile_error";
  if (judgeStatus === "runtime_error") return "runtime_error";
  if (judgeStatus === "time_limit_exceeded") return "time_limit_exceeded";
  return "judge_error";
}

function resultMessage(
  outcome: Awaited<ReturnType<CodeJudgeClient["run"]>>,
  status: ActivityTestRunResult["status"],
): string | null {
  if (status === "passed") return null;
  if (status === "wrong_answer") return "Output did not match the answer key.";
  if (status === "compile_error") {
    return (
      outcome.compileOutput ?? outcome.message ?? "The code did not compile."
    );
  }
  if (status === "runtime_error") {
    return (
      outcome.stderr ?? outcome.message ?? "The program stopped with an error."
    );
  }
  if (status === "time_limit_exceeded") {
    return "The program exceeded the execution time limit.";
  }
  return outcome.message ?? "The code judge could not complete this test.";
}

// Grades one program against a list of stdin/expectedStdout test cases,
// short-circuiting the remaining judge calls on the first compile error (or
// an unconfigured judge) since every later case would fail identically.
// Shared by ActivityGradingService and RaceGradingService so both features
// can never drift apart on comparison-mode semantics.
export async function runTestCases(
  codeJudge: CodeJudgeClient,
  spec: {
    language: CodeLanguage;
    comparisonMode: ActivityComparisonMode;
    numericTolerance: number | null;
    testCases: readonly {
      id: string;
      stdin: string;
      expectedStdout: string;
    }[];
  },
  sourceCode: string,
): Promise<ActivityTestRunResult[]> {
  const results: ActivityTestRunResult[] = [];
  let shortCircuitMessage: string | null = null;

  for (const testCase of spec.testCases) {
    if (shortCircuitMessage) {
      results.push({
        testCaseId: testCase.id,
        passed: false,
        actualStdout: null,
        status: "not_run",
        message: shortCircuitMessage,
      });
      continue;
    }
    const outcome = await codeJudge.run({
      language: spec.language,
      sourceCode,
      stdin: testCase.stdin || undefined,
    });
    // A compile error (or an unconfigured judge) fails every test case
    // identically — skip the remaining judge calls rather than burning
    // one per test case for a program that never ran.
    if (outcome.status === "compile_error") {
      shortCircuitMessage = "Not run because the code did not compile.";
    } else if (outcome.status === "not_configured") {
      shortCircuitMessage = "Not run because the code judge is unavailable.";
    }
    const actualOutput = outcome.stdout ?? "";
    const passed =
      outcome.status === "accepted" &&
      outputsMatch(
        actualOutput,
        testCase.expectedStdout,
        spec.comparisonMode,
        spec.numericTolerance,
      );
    const status = resultStatus(outcome.status, passed);
    results.push({
      testCaseId: testCase.id,
      passed,
      actualStdout: outcome.stdout,
      status,
      message: resultMessage(outcome, status),
    });
  }

  return results;
}
