import {
  activityGeneratedTestCaseSchema,
  codeLanguageMeta,
  type ActivityGenerateRequest,
  type ActivityGeneratedTestCase,
} from "@sqweb/contracts";
import { z } from "zod";

export interface GeneratedActivityDraft {
  title: string;
  instructions: string;
  starterCode: string | null;
  referenceSolution: string;
  testCases: readonly ActivityGeneratedTestCase[];
}

export interface AiActivityGeneratorClient {
  generate(request: ActivityGenerateRequest): Promise<GeneratedActivityDraft>;
}

// Thrown only by UnconfiguredAiActivityGeneratorClient, so the service
// layer can distinguish "no key set yet" (503) from a genuine OpenAI
// failure (502) without string-matching error messages.
export class AiGenerationUnavailableError extends Error {}

// Used until OPENAI_API_KEY is set, so the rest of the "Generate with AI"
// feature (form, button, error handling) is fully wired and testable
// before an actual key exists.
export class UnconfiguredAiActivityGeneratorClient implements AiActivityGeneratorClient {
  async generate(): Promise<GeneratedActivityDraft> {
    throw new AiGenerationUnavailableError(
      "AI activity generation is not configured yet. Add OPENAI_API_KEY to enable it.",
    );
  }
}

// Defense-in-depth beyond OpenAI's "strict" structured-output mode — cheap
// insurance against a malformed or unexpected reply reaching the caller as
// an untyped blind cast.
const generatedActivityDraftSchema = z.object({
  title: z.string(),
  instructions: z.string(),
  starterCode: z.string().nullable(),
  referenceSolution: z.string(),
  testCases: z.array(activityGeneratedTestCaseSchema),
});

const draftJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    instructions: { type: "string" },
    starterCode: { type: ["string", "null"] },
    referenceSolution: { type: "string" },
    testCases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          stdin: { type: "string" },
          expectedStdout: { type: "string" },
          isHidden: { type: "boolean" },
        },
        required: ["stdin", "expectedStdout", "isHidden"],
      },
    },
  },
  required: [
    "title",
    "instructions",
    "starterCode",
    "referenceSolution",
    "testCases",
  ],
} as const;

const difficultyGuidance: Record<
  ActivityGenerateRequest["difficulty"],
  string
> = {
  beginner:
    "Suitable for a student in their first semester of programming — basic variables, conditionals, loops, or simple string/number operations. No advanced data structures or libraries.",
  intermediate:
    "Assumes comfort with functions, arrays/lists, and basic algorithms — nested loops, simple recursion, or common data structure operations are fine.",
  advanced:
    "Can assume familiarity with more advanced algorithms or data structures appropriate for the language, but must still be solvable within a short classroom exercise.",
};

function systemPrompt(request: ActivityGenerateRequest): string {
  const meta = codeLanguageMeta[request.language];
  const hiddenCount = Math.max(1, Math.floor(request.testCaseCount / 2));
  return [
    `You design short, single-file ${meta.label} programming exercises for a classroom coding-quiz platform.`,
    // The brief can be a one-line topic OR a fully worked spec (exact
    // class/method/field names, exact test case data). When it's the
    // latter, the teacher has already made every decision — the generic
    // guidance below is only a fallback for what the brief leaves open.
    'The "Topic / brief" you receive may already be a complete specification — exact class, field, and method names/signatures, an exact driver/main behavior, and/or exact test case inputs and expected outputs. When it is, follow it precisely and do not deviate, invent additional requirements, or add test cases beyond what it describes — treat it as authoritative over everything below.',
    `Only when the brief does not already specify test cases: generate exactly ${request.testCaseCount} test cases, marking exactly ${hiddenCount} of them "isHidden": true and the rest false, with hidden and visible cases using genuinely different input values from each other (not just cosmetic variations) so a student can't pass by hardcoding the visible sample's output — and the program must read that varying data from stdin, not from literals baked into the source, so its output is genuinely input-dependent.`,
    "If the brief's driver/main code is specified to construct fixed, hardcoded values (e.g. always the same named objects) rather than reading input, honor that exactly — do not invent stdin-driven variance the brief didn't ask for, even if that means every test case's expected output is identical for reasons outside the student's control.",
    "expectedStdout must be EXACTLY what a correct program prints for that stdin — nothing more, nothing less, no trailing commentary.",
    'Unless the brief explicitly asks for one, do NOT require the program to print an input prompt (e.g. "Enter a number: ") before reading stdin — have it read silently and print only the meaningful result. A prompt is ordinary stdout to this judge, so grading it means matching that exact prompt text character-for-character, which is needless fragility for a simple exercise and an easy trap for a teacher who edits one of expectedStdout/instructions/referenceSolution later without updating the other two to match. If the brief does explicitly ask for a prompt, keep instructions, referenceSolution, and every expectedStdout describing the exact same prompt text — they must never disagree with each other.',
    "The program's output must be fully deterministic — no randomness, current time/date, or environment-dependent values.",
    `referenceSolution must be a complete, correct program that this platform's judge can run AS SUBMITTED, with no separate driver file — its entry point must match this language's required shape exactly, e.g.: ${meta.template.trim()}. If the brief names a class separately from the driver/main logic (for example a class like "Student" plus driver code that creates and uses instances of it), referenceSolution must include BOTH the named class AND that runnable entry point/driver code in the same submission — never emit just the named class with no way to execute it.`,
    ...(request.language === "java"
      ? [
          'This judge compiles Java as a file literally named Main.java, so the file\'s single PUBLIC class must be named exactly "Main" and contain "public static void main(String[] args)" — never rename that public class to match a class the brief describes (e.g. "Student"). If the brief names its own class, define it as a separate, non-public (package-private) class in the SAME file, and put all driver logic inside Main.main(). This applies to both referenceSolution and starterCode.',
        ]
      : []),
    "starterCode should be a short skeleton with TODO comments in exactly the places the brief says to leave blank (or null if a skeleton wouldn't help, e.g. a trivial one-liner exercise) — never fill in blanks the brief asked to leave for the student. It must still include the same runnable entry point/driver code as referenceSolution (not left as a TODO) unless the brief explicitly asks the student to write the driver themselves.",
    "instructions should read like a real assignment prompt: clear, specific, step-by-step language covering every requirement in the brief, without revealing hidden test case data. No markdown headers.",
    `Difficulty level "${request.difficulty}": ${difficultyGuidance[request.difficulty]}`,
    "Respond only with the JSON object matching the provided schema.",
  ].join(" ");
}

// Uses OpenAI's Chat Completions API directly via fetch (no SDK dependency,
// consistent with how RapidApiJudge0Client talks to Judge0 in this file's
// sibling) with Structured Outputs (response_format: json_schema) so the
// model's reply is guaranteed to parse against our shape.
// reasoning_effort only applies to o-series reasoning models (o1, o3,
// o3-mini, o4-mini, ...) — sending it to a non-reasoning model like
// gpt-4o-mini is ignored by some and rejected by others, so it's only
// included in the request body when explicitly configured.
type ReasoningEffort = "low" | "medium" | "high";

export class OpenAiActivityGeneratorClient implements AiActivityGeneratorClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-4o-mini",
    private readonly reasoningEffort?: ReasoningEffort,
  ) {}

  async generate(
    request: ActivityGenerateRequest,
  ): Promise<GeneratedActivityDraft> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        ...(this.reasoningEffort
          ? { reasoning_effort: this.reasoningEffort }
          : {}),
        messages: [
          { role: "system", content: systemPrompt(request) },
          { role: "user", content: `Topic / brief: ${request.topic}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "activity_draft",
            strict: true,
            schema: draftJsonSchema,
          },
        },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(
        `OpenAI request failed with status ${response.status}${detail ? `: ${detail}` : ""}`,
      );
    }
    const payload = (await response.json()) as {
      choices?: readonly { message?: { content?: string | null } }[];
    };
    const content = payload.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("OpenAI returned an empty response.");
    }
    let draft: unknown;
    try {
      draft = JSON.parse(content);
    } catch {
      throw new Error("OpenAI returned a response that wasn't valid JSON.");
    }
    const parsed = generatedActivityDraftSchema.safeParse(draft);
    if (!parsed.success) {
      throw new Error(
        "OpenAI's response didn't match the expected activity draft shape.",
      );
    }
    return parsed.data;
  }
}
