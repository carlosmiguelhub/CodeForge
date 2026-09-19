import { describe, expect, it, vi } from "vitest";

import { AiGenerationUnavailableError } from "./ai-activity-generator-client";
import type { AiQuizGeneratorClient } from "./ai-quiz-generator-client";
import { QuizGenerationService } from "./quiz-generation-service";

describe("QuizGenerationService", () => {
  const draft = {
    title: "Photosynthesis basics",
    questions: [
      {
        questionText: "What gas do plants absorb during photosynthesis?",
        options: ["Oxygen", "Carbon dioxide", "Nitrogen", "Hydrogen"],
        correctAnswer: "Carbon dioxide",
      },
    ],
  };

  function buildService(aiQuizGenerator: AiQuizGeneratorClient) {
    return new QuizGenerationService({ aiQuizGenerator });
  }

  it("returns the AI generator's draft unchanged on success", async () => {
    const aiQuizGenerator: AiQuizGeneratorClient = {
      generate: vi.fn().mockResolvedValue(draft),
    };
    const service = buildService(aiQuizGenerator);
    const result = await service.generateQuiz({
      topic: "photosynthesis",
      quizType: "lecture",
      difficulty: "beginner",
    });
    expect(aiQuizGenerator.generate).toHaveBeenCalledWith({
      topic: "photosynthesis",
      quizType: "lecture",
      difficulty: "beginner",
    });
    expect(result).toEqual(draft);
  });

  it("maps an unconfigured AI generator to a 503", async () => {
    const aiQuizGenerator: AiQuizGeneratorClient = {
      generate: vi
        .fn()
        .mockRejectedValue(new AiGenerationUnavailableError("not configured")),
    };
    const service = buildService(aiQuizGenerator);
    await expect(
      service.generateQuiz({
        topic: "x",
        quizType: "lecture",
        difficulty: "beginner",
      }),
    ).rejects.toMatchObject({
      code: "AI_GENERATION_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("maps a generic AI generator failure to a 502", async () => {
    const aiQuizGenerator: AiQuizGeneratorClient = {
      generate: vi
        .fn()
        .mockRejectedValue(new Error("OpenAI request failed with status 500")),
    };
    const service = buildService(aiQuizGenerator);
    await expect(
      service.generateQuiz({
        topic: "x",
        quizType: "code",
        language: "python",
        difficulty: "beginner",
      }),
    ).rejects.toMatchObject({
      code: "AI_GENERATION_FAILED",
      statusCode: 502,
    });
  });
});
