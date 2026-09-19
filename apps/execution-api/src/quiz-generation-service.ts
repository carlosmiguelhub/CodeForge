import { AuthorizationError } from "@sqweb/auth";
import type {
  QuizGenerateRequest,
  QuizGenerateResponse,
} from "@sqweb/contracts";

import { AiGenerationUnavailableError } from "./ai-activity-generator-client";
import type { AiQuizGeneratorClient } from "./ai-quiz-generator-client";

// Thin wrapper, unlike ActivityGradingService.generateActivity — Quiz has
// no code execution to re-verify a draft against (grading is exact string
// match for both quiz types), so this is just the same error-translation
// slice, nothing else.
export class QuizGenerationService {
  constructor(
    private readonly dependencies: { aiQuizGenerator: AiQuizGeneratorClient },
  ) {}

  async generateQuiz(
    request: QuizGenerateRequest,
  ): Promise<QuizGenerateResponse> {
    try {
      return await this.dependencies.aiQuizGenerator.generate(request);
    } catch (error) {
      if (error instanceof AiGenerationUnavailableError) {
        throw new AuthorizationError(
          "AI_GENERATION_UNAVAILABLE",
          error.message,
          503,
        );
      }
      throw new AuthorizationError(
        "AI_GENERATION_FAILED",
        error instanceof Error
          ? `The AI generator could not produce quiz questions: ${error.message}`
          : "The AI generator could not produce quiz questions.",
        502,
      );
    }
  }
}
