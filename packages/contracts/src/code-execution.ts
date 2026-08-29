import { z } from "zod";

export const codeLanguageSchema = z.enum([
  "python",
  "java",
  "cpp",
  "javascript",
  "c",
]);
export type CodeLanguage = z.infer<typeof codeLanguageSchema>;

export interface CodeLanguageMeta {
  readonly label: string;
  readonly judge0Id: number;
  readonly monacoId: string;
  readonly template: string;
  readonly extension: string;
}

export const codeLanguageMeta: Readonly<
  Record<CodeLanguage, CodeLanguageMeta>
> = {
  python: {
    label: "Python",
    judge0Id: 71,
    monacoId: "python",
    template: 'print("Hello, CodeForge")\n',
    extension: "py",
  },
  java: {
    label: "Java",
    judge0Id: 62,
    monacoId: "java",
    template:
      'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, CodeForge");\n    }\n}\n',
    extension: "java",
  },
  cpp: {
    label: "C++",
    judge0Id: 54,
    monacoId: "cpp",
    template:
      '#include <iostream>\nusing namespace std;\n\nint main() {\n    cout << "Hello, CodeForge" << endl;\n    return 0;\n}\n',
    extension: "cpp",
  },
  javascript: {
    label: "JavaScript",
    judge0Id: 63,
    monacoId: "javascript",
    template: 'console.log("Hello, CodeForge");\n',
    extension: "js",
  },
  c: {
    label: "C",
    judge0Id: 50,
    monacoId: "c",
    template:
      '#include <stdio.h>\n\nint main() {\n    printf("Hello, CodeForge\\n");\n    return 0;\n}\n',
    extension: "c",
  },
};

export const codeExecutionRequestSchema = z.object({
  language: codeLanguageSchema,
  sourceCode: z.string().min(1).max(100_000),
  stdin: z.string().max(50_000).optional(),
});
export type CodeExecutionRequest = z.infer<typeof codeExecutionRequestSchema>;

export const codeExecutionStatusSchema = z.enum([
  "accepted",
  "wrong_answer",
  "compile_error",
  "runtime_error",
  "time_limit_exceeded",
  "internal_error",
  "processing",
  "not_configured",
]);
export type CodeExecutionStatus = z.infer<typeof codeExecutionStatusSchema>;

export const codeExecutionResponseSchema = z.object({
  status: codeExecutionStatusSchema,
  stdout: z.string().nullable(),
  stderr: z.string().nullable(),
  compileOutput: z.string().nullable(),
  message: z.string().nullable(),
  timeMs: z.number().nullable(),
  memoryKb: z.number().nullable(),
});
export type CodeExecutionResponse = z.infer<typeof codeExecutionResponseSchema>;

// Reported by the client after an interactive run (apps/interactive-run-api)
// reaches a natural exit, so it counts toward the same code-execution
// history/leaderboard totals as a judged run — interactive-run-api itself
// has no database access by design, and has no notion of "accepted" vs
// "wrong answer" (there's no expected output to compare against, unlike a
// judged submission), only whether the program exited cleanly.
export const interactiveRunHistoryRequestSchema = z.object({
  language: codeLanguageSchema,
  exitCode: z.number().int(),
  timeMs: z.number().nonnegative().nullable(),
});
export type InteractiveRunHistoryRequest = z.infer<
  typeof interactiveRunHistoryRequestSchema
>;

export const codeExecutionHistoryItemSchema = z.object({
  id: z.string().uuid(),
  language: codeLanguageSchema,
  status: codeExecutionStatusSchema,
  timeMs: z.number().nullable(),
  startedAt: z.iso.datetime({ offset: true }),
});
export type CodeExecutionHistoryItem = z.infer<
  typeof codeExecutionHistoryItemSchema
>;
