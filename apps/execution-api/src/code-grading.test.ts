import { describe, expect, it, vi } from "vitest";

import type { CodeJudgeClient } from "./code-judge-client";
import { normalizeOutput, outputsMatch, runTestCases } from "./code-grading";

describe("normalizeOutput", () => {
  it("ignores trailing whitespace per line, CRLF, and surrounding blank space", () => {
    expect(normalizeOutput("hi  \r\nbye  \n\n")).toBe("hi\nbye");
  });
});

describe("outputsMatch", () => {
  it("normalized_exact requires the normalized strings to match exactly", () => {
    expect(outputsMatch("Hello  \n", "Hello", "normalized_exact", null)).toBe(
      true,
    );
    expect(outputsMatch("Hello", "Goodbye", "normalized_exact", null)).toBe(
      false,
    );
  });

  it("suffix_exact only requires the actual output to end with the expected text", () => {
    expect(
      outputsMatch("Enter a number: Even", "Even", "suffix_exact", null),
    ).toBe(true);
    expect(
      outputsMatch("Enter a number: Odd", "Even", "suffix_exact", null),
    ).toBe(false);
  });

  it("token mode ignores whitespace layout between tokens", () => {
    expect(outputsMatch("1\n2    3\n", "1 2\n3", "token", null)).toBe(true);
  });

  it("numeric mode accepts differences within tolerance", () => {
    expect(outputsMatch("3.1416\n2", "3.14159 2.000", "numeric", 0.001)).toBe(
      true,
    );
    expect(outputsMatch("3.2\n2", "3.14159 2.000", "numeric", 0.001)).toBe(
      false,
    );
  });
});

describe("runTestCases", () => {
  function makeJudge(run: CodeJudgeClient["run"]): CodeJudgeClient {
    return { run };
  }

  it("grades each test case independently when the program runs cleanly", async () => {
    const run = vi
      .fn()
      .mockResolvedValueOnce({
        status: "accepted",
        stdout: "Even",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 5,
        memoryKb: 10,
      })
      .mockResolvedValueOnce({
        status: "accepted",
        stdout: "Odd",
        stderr: null,
        compileOutput: null,
        message: null,
        timeMs: 5,
        memoryKb: 10,
      });
    const results = await runTestCases(
      makeJudge(run),
      {
        language: "python",
        comparisonMode: "normalized_exact",
        numericTolerance: null,
        testCases: [
          { id: "1", stdin: "8", expectedStdout: "Even" },
          { id: "2", stdin: "7", expectedStdout: "Odd" },
        ],
      },
      "code",
    );
    expect(results).toEqual([
      {
        testCaseId: "1",
        passed: true,
        actualStdout: "Even",
        status: "passed",
        message: null,
      },
      {
        testCaseId: "2",
        passed: true,
        actualStdout: "Odd",
        status: "passed",
        message: null,
      },
    ]);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("short-circuits remaining test cases after a compile error, without more judge calls", async () => {
    const run = vi.fn().mockResolvedValue({
      status: "compile_error",
      stdout: null,
      stderr: null,
      compileOutput: "SyntaxError",
      message: null,
      timeMs: 0,
      memoryKb: 0,
    });
    const results = await runTestCases(
      makeJudge(run),
      {
        language: "python",
        comparisonMode: "normalized_exact",
        numericTolerance: null,
        testCases: [
          { id: "1", stdin: "", expectedStdout: "a" },
          { id: "2", stdin: "", expectedStdout: "b" },
        ],
      },
      "code",
    );
    expect(results[0]?.status).toBe("compile_error");
    expect(results[1]?.status).toBe("not_run");
    expect(run).toHaveBeenCalledTimes(1);
  });
});
