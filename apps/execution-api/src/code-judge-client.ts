import {
  codeLanguageMeta,
  type CodeExecutionRequest,
  type CodeExecutionResponse,
  type CodeExecutionStatus,
} from "@sqweb/contracts";

export interface CodeJudgeClient {
  run(request: CodeExecutionRequest): Promise<CodeExecutionResponse>;
}

// Used until RAPIDAPI_JUDGE0_KEY is set, so the workspace UI is fully usable
// (language switching, editor, layout) before the judge is wired up.
export class UnconfiguredCodeJudgeClient implements CodeJudgeClient {
  async run(): Promise<CodeExecutionResponse> {
    return {
      status: "not_configured",
      stdout: null,
      stderr: null,
      compileOutput: null,
      message:
        "Code execution is not configured yet. Add RAPIDAPI_JUDGE0_KEY to enable it.",
      timeMs: null,
      memoryKb: null,
    };
  }
}

// https://ce.judge0.com/ status IDs. 1/2 shouldn't reach us since we submit
// with wait=true, but are mapped defensively in case of a slow judge.
const judge0StatusMap: Readonly<Record<number, CodeExecutionStatus>> = {
  1: "processing",
  2: "processing",
  3: "accepted",
  4: "wrong_answer",
  5: "time_limit_exceeded",
  6: "compile_error",
  13: "internal_error",
  14: "internal_error",
};

function statusForJudge0Id(id: number): CodeExecutionStatus {
  if (judge0StatusMap[id]) return judge0StatusMap[id];
  // 7-12 are the various runtime-error subtypes (SIGSEGV, SIGABRT, NZEC, ...).
  return id >= 7 && id <= 12 ? "runtime_error" : "internal_error";
}

function decodeBase64(value: string | null | undefined): string | null {
  if (!value) return null;
  return Buffer.from(value, "base64").toString("utf8");
}

interface Judge0Submission {
  readonly stdout: string | null;
  readonly stderr: string | null;
  readonly compile_output: string | null;
  readonly message: string | null;
  readonly status: { readonly id: number; readonly description: string };
  readonly time: string | null;
  readonly memory: number | null;
}

export class RapidApiJudge0Client implements CodeJudgeClient {
  constructor(
    private readonly apiKey: string,
    private readonly host = "judge0-ce.p.rapidapi.com",
  ) {}

  async run(request: CodeExecutionRequest): Promise<CodeExecutionResponse> {
    const meta = codeLanguageMeta[request.language];
    const response = await fetch(
      `https://${this.host}/submissions?base64_encoded=true&wait=true`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-RapidAPI-Key": this.apiKey,
          "X-RapidAPI-Host": this.host,
        },
        body: JSON.stringify({
          source_code: Buffer.from(request.sourceCode).toString("base64"),
          language_id: meta.judge0Id,
          stdin: request.stdin
            ? Buffer.from(request.stdin).toString("base64")
            : undefined,
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Judge0 request failed with status ${response.status}`);
    }
    const payload = (await response.json()) as Judge0Submission;
    return {
      status: statusForJudge0Id(payload.status.id),
      stdout: decodeBase64(payload.stdout),
      stderr: decodeBase64(payload.stderr),
      compileOutput: decodeBase64(payload.compile_output),
      message: decodeBase64(payload.message) ?? payload.status.description,
      timeMs: payload.time ? Math.round(Number(payload.time) * 1000) : null,
      memoryKb: payload.memory ?? null,
    };
  }
}
