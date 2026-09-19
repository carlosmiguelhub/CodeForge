import {
  quizGenerateResponseSchema,
  type QuizGenerateRequest,
  type QuizGenerateResponse,
} from "@sqweb/contracts";

import { AiGenerationUnavailableError } from "./ai-activity-generator-client";

export interface AiQuizGeneratorClient {
  generate(request: QuizGenerateRequest): Promise<QuizGenerateResponse>;
}

// Used until OPENAI_API_KEY is set, same precedent as
// UnconfiguredAiActivityGeneratorClient — reuses the same error class so
// the service layer can distinguish "no key set yet" (503) from a genuine
// OpenAI failure (502) without string-matching error messages.
export class UnconfiguredAiQuizGeneratorClient implements AiQuizGeneratorClient {
  async generate(): Promise<QuizGenerateResponse> {
    throw new AiGenerationUnavailableError(
      "AI quiz generation is not configured yet. Add OPENAI_API_KEY to enable it.",
    );
  }
}

// One flat item shape covers both quiz types — Lecture generation always
// produces mcq-shaped questions, Code generation produces code_choice-
// shaped ones (questionText/options are code snippets instead of prose).
// Never a oneOf/discriminated union in the JSON schema, which OpenAI's
// strict structured outputs support but this codebase has never needed
// and shouldn't be the first place to try it.
const draftJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          questionText: { type: "string" },
          options: { type: "array", items: { type: "string" } },
          correctAnswer: { type: "string" },
        },
        required: ["questionText", "options", "correctAnswer"],
      },
    },
  },
  required: ["title", "questions"],
} as const;

const difficultyGuidance: Record<QuizGenerateRequest["difficulty"], string> = {
  beginner:
    "Definitions, direct recall, and single-step reasoning — no multi-part or trick questions.",
  intermediate:
    "Applying a concept to a short scenario, or comparing two closely related ideas.",
  advanced:
    "Multi-step reasoning, or distinguishing between subtly different concepts a student could easily confuse.",
};

function countGuidance(): string {
  return "Decide how many questions this brief calls for based on its scope and depth — typically 3 to 15 questions, fewer for a narrow single-concept brief, more for a broad syllabus-style one. Never exceed 20. Do not pad the set with filler questions just to reach a round number.";
}

function systemPrompt(request: QuizGenerateRequest): string {
  const guidance = difficultyGuidance[request.difficulty];
  if (request.quizType === "code") {
    // request.language is guaranteed present here — enforced by
    // quizGenerateRequestSchema's superRefine before this is ever called.
    const language = request.language ?? "python";
    return [
      `You design code-choice quiz questions for a classroom coding quiz, in ${language}.`,
      'Each question\'s "questionText" MUST start with one short, plain-English instructional sentence stating exactly what the student needs to do — e.g. "Which snippet correctly completes the loop below?", "What replaces the blank so this function returns the sum of the list?", or "Which option fixes the bug in this method?" — followed by the code itself. NEVER send a bare code snippet with no lead-in sentence: a student looking at unexplained code with no stated task can\'t tell what they\'re even being asked to solve. Each of the question\'s "options" is itself a complete code snippet the student picks between. Grading is a PLAIN EXACT STRING MATCH against "correctAnswer", with no code execution at all, so "correctAnswer" must be copied verbatim, character-for-character, from one of "options" — never paraphrased or reformatted.',
      "Each question needs 2 to 6 code-snippet choices, all plausible and written in a consistent style, with exactly one correct.",
      "Format every snippet — both \"questionText\" and every option — as properly structured, multi-line, conventionally indented code, exactly like a real code editor would show it: a method/block's opening brace stays on the declaration line, its body goes on its own indented line(s), and the closing brace gets its own line. Use \\n for line breaks and spaces for indentation (2 or 4 spaces, consistent throughout). NEVER cram a multi-statement snippet onto a single line just to save space — length is not a concern, readability and matching normal code style is. A snippet that's genuinely one statement (e.g. a single field declaration) can stay on one line; anything with a method body or block never should.",
      countGuidance(),
      `Difficulty "${request.difficulty}": ${guidance}`,
      "Also write a short, descriptive quiz title reflecting the brief.",
      "Respond only with the JSON object matching the provided schema.",
    ].join(" ");
  }
  return [
    "You design multiple-choice questions for a classroom trivia/lecture-review quiz.",
    'Each question\'s "questionText" is a clear, self-contained question in plain prose, and "options" are its answer choices. Grading is a PLAIN EXACT STRING MATCH against "correctAnswer", so "correctAnswer" must be copied verbatim, character-for-character, from one of "options" — never paraphrased or reformatted.',
    'Each question needs 2 to 6 short, unambiguous answer choices with exactly one correct answer. Avoid "all of the above"/"none of the above" style choices, and avoid choices that overlap or could both be argued correct.',
    countGuidance(),
    `Difficulty "${request.difficulty}": ${guidance}`,
    "Also write a short, descriptive quiz title reflecting the brief.",
    "Respond only with the JSON object matching the provided schema.",
  ].join(" ");
}

// Uses OpenAI's Chat Completions API directly via fetch (no SDK
// dependency), same as OpenAiActivityGeneratorClient, with Structured
// Outputs (response_format: json_schema) so the model's reply is
// guaranteed to parse against our shape.
type ReasoningEffort = "low" | "medium" | "high";

export class OpenAiQuizGeneratorClient implements AiQuizGeneratorClient {
  constructor(
    private readonly apiKey: string,
    private readonly model = "gpt-4o-mini",
    private readonly reasoningEffort?: ReasoningEffort,
  ) {}

  async generate(request: QuizGenerateRequest): Promise<QuizGenerateResponse> {
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
            name: "quiz_draft",
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
    const parsed = quizGenerateResponseSchema.safeParse(draft);
    if (!parsed.success) {
      throw new Error(
        "OpenAI's response didn't match the expected quiz draft shape.",
      );
    }
    return parsed.data;
  }
}
