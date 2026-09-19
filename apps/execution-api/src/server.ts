import { AuthorizationError } from "@sqweb/auth";
import type {
  CodeExecutionHistoryItem,
  CodeExecutionStatus,
  CodeLanguage,
} from "@sqweb/contracts";
import {
  activityGenerateRequestSchema,
  activityTestRunRequestSchema,
  activityVerifyReferenceRequestSchema,
  activityViolationRequestSchema,
  codeExecutionRequestSchema,
  executionRequestSchema,
  interactiveRunHistoryRequestSchema,
  quizGenerateRequestSchema,
  raceProblemSubmitRequestSchema,
  raceViolationRequestSchema,
} from "@sqweb/contracts";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z, ZodError } from "zod";

import type { ActivityGradingService } from "./activity-grading-service";
import type { CodeJudgeClient } from "./code-judge-client";
import type { ExecutionService } from "./execution-service";
import { ConfirmationRequiredError } from "./execution-service";
import type { QuizGenerationService } from "./quiz-generation-service";
import type { RaceGradingService } from "./race-grading-service";
import type { RequestVerifier } from "./request-verifier";

export interface CodeExecutionHistoryStore {
  record(
    firebaseUid: string,
    language: CodeLanguage,
    status: CodeExecutionStatus,
    timeMs: number | null,
  ): Promise<void>;
  listHistory(
    firebaseUid: string,
  ): Promise<readonly CodeExecutionHistoryItem[]>;
}

const idSchema = z.object({ id: z.string().uuid() });
const historySchema = z.object({ workspaceId: z.string().uuid() });
const raceProblemParamsSchema = z.object({
  id: z.string().uuid(),
  problemId: z.string().uuid(),
});

function header(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function buildExecutionServer(dependencies: {
  verifier: RequestVerifier;
  execution: ExecutionService;
  codeJudge: CodeJudgeClient;
  activityGrading: ActivityGradingService;
  raceGrading: RaceGradingService;
  quizGeneration: QuizGenerationService;
  codeExecutionHistory: CodeExecutionHistoryStore;
  allowedOrigins: readonly string[];
  logger?: boolean;
}) {
  const server = Fastify({
    logger:
      dependencies.logger === false
        ? false
        : {
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.x-sqweb-execution-grant",
                "req.body.sql",
                "req.body.grant",
                "req.body.confirmation",
                "req.body.sourceCode",
                "req.body.stdin",
              ],
              censor: "[REDACTED]",
            },
          },
    bodyLimit: 150_000,
  });
  await server.register(cors, {
    origin: [...dependencies.allowedOrigins],
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-SQWeb-Execution-Grant",
    ],
  });

  server.setErrorHandler(async (error, request, reply) => {
    if (error instanceof ConfirmationRequiredError)
      return reply.code(409).send({
        error: {
          code: "DESTRUCTIVE_CONFIRMATION_REQUIRED",
          message: error.message,
          confirmation: {
            token: error.token,
            statementHash: error.statementHash,
          },
        },
      });
    if (error instanceof AuthorizationError)
      return reply.code(error.statusCode).send({
        error: { code: error.code, message: error.message },
      });
    if (error instanceof ZodError)
      return reply.code(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "The request is invalid.",
          fieldErrors: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode && statusCode >= 400 && statusCode < 500)
      return reply.code(statusCode).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "The request is invalid.",
        },
      });
    request.log.error({ err: error }, "Unhandled execution API error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The execution request failed.",
      },
    });
  });

  const verify = (request: {
    headers: Record<string, string | string[] | undefined>;
  }) => dependencies.verifier.verify(header(request.headers.authorization));

  server.get("/health", async () => ({ status: "ok" }));
  server.post("/v1/executions", async (request) => {
    const identity = await verify(request);
    return dependencies.execution.execute(
      identity,
      executionRequestSchema.parse(request.body),
    );
  });
  server.delete("/v1/executions/:id", async (request) => {
    const identity = await verify(request);
    return dependencies.execution.cancel(
      identity,
      idSchema.parse(request.params).id,
    );
  });
  server.get("/v1/workspaces/:id/schema", async (request) => {
    const identity = await verify(request);
    idSchema.parse(request.params);
    const grant = header(request.headers["x-sqweb-execution-grant"]);
    if (!grant)
      throw new AuthorizationError(
        "INVALID_GRANT",
        "Execution authorization is required.",
        403,
      );
    return dependencies.execution.schema(identity, grant);
  });
  server.get("/v1/query-history", async (request) => {
    const identity = await verify(request);
    return dependencies.execution.history(
      identity,
      historySchema.parse(request.query).workspaceId,
    );
  });
  server.post("/v1/code-executions", async (request) => {
    const identity = await verify(request);
    const body = codeExecutionRequestSchema.parse(request.body);
    const result = await dependencies.codeJudge.run(body);
    // Best-effort: the judge result is what the caller is waiting on, a
    // history-recording failure shouldn't turn that into a 500.
    dependencies.codeExecutionHistory
      .record(identity.uid, body.language, result.status, result.timeMs)
      .catch((error: unknown) =>
        request.log.error(
          { err: error },
          "Could not record code execution history",
        ),
      );
    return result;
  });
  server.post("/v1/activities/:id/test-runs", async (request) => {
    const identity = await verify(request);
    const params = idSchema.parse(request.params);
    const body = activityTestRunRequestSchema.parse(request.body);
    return dependencies.activityGrading.testCode(
      identity,
      params.id,
      body.sourceCode,
    );
  });
  server.post("/v1/activities/:id/submissions", async (request) => {
    const identity = await verify(request);
    const params = idSchema.parse(request.params);
    const body = activityTestRunRequestSchema.parse(request.body);
    return dependencies.activityGrading.submitAttempt(
      identity,
      params.id,
      body.sourceCode,
    );
  });
  server.post("/v1/activities/:id/violations", async (request) => {
    const identity = await verify(request);
    const params = idSchema.parse(request.params);
    const body = activityViolationRequestSchema.parse(request.body);
    return dependencies.activityGrading.recordViolation(
      identity,
      params.id,
      body.kind,
    );
  });
  server.post("/v1/races/:id/attempts/start", async (request, reply) => {
    const identity = await verify(request);
    const params = idSchema.parse(request.params);
    const attempt = await dependencies.raceGrading.startAttempt(
      identity,
      params.id,
    );
    return reply.code(201).send(attempt);
  });
  server.post(
    "/v1/races/:id/problems/:problemId/test-runs",
    async (request) => {
      const identity = await verify(request);
      const params = raceProblemParamsSchema.parse(request.params);
      const body = activityTestRunRequestSchema.parse(request.body);
      return dependencies.raceGrading.runProblem(
        identity,
        params.id,
        params.problemId,
        body.sourceCode,
      );
    },
  );
  server.post(
    "/v1/races/:id/problems/:problemId/submissions",
    async (request) => {
      const identity = await verify(request);
      const params = raceProblemParamsSchema.parse(request.params);
      const body = raceProblemSubmitRequestSchema.parse(request.body);
      return dependencies.raceGrading.submitProblem(
        identity,
        params.id,
        params.problemId,
        body.sourceCode,
      );
    },
  );
  server.post("/v1/races/:id/finish", async (request) => {
    const identity = await verify(request);
    const params = idSchema.parse(request.params);
    return dependencies.raceGrading.finishAttempt(identity, params.id);
  });
  server.post("/v1/races/:id/violations", async (request) => {
    const identity = await verify(request);
    const params = idSchema.parse(request.params);
    // Validated for request-shape even though the kind isn't distinguished
    // downstream today — see RaceGradingService.recordViolation.
    raceViolationRequestSchema.parse(request.body);
    return dependencies.raceGrading.recordViolation(identity, params.id);
  });
  // Stateless — a teacher checking a reference solution against a draft's
  // test cases before the activity is even saved. No activity/role check,
  // matching the existing /v1/executions precedent (any authenticated
  // account can invoke the judge there too); nothing here reads or writes
  // anything belonging to a specific activity.
  server.post("/v1/activities/verify-reference", async (request) => {
    await verify(request);
    const body = activityVerifyReferenceRequestSchema.parse(request.body);
    return dependencies.activityGrading.verifyReferenceSolution(body);
  });
  // Same auth posture as verify-reference above (token verification only,
  // no teacher-role check) — execution-api has no cross-service role
  // lookup today, so this matches the existing precedent for this class of
  // stateless, non-activity-scoped endpoint rather than inventing new
  // authorization plumbing just for this feature.
  server.post("/v1/activities/generate", async (request) => {
    await verify(request);
    const body = activityGenerateRequestSchema.parse(request.body);
    return dependencies.activityGrading.generateActivity(body);
  });
  // Same auth posture as activities/generate above — Quiz's own CRUD lives
  // entirely in platform-api, but generation is stateless (nothing is
  // saved yet) and reuses this service's OpenAI wiring, same precedent as
  // Code Racing reusing activities/generate for its own problems.
  server.post("/v1/quizzes/generate", async (request) => {
    await verify(request);
    const body = quizGenerateRequestSchema.parse(request.body);
    return dependencies.quizGeneration.generateQuiz(body);
  });
  server.get("/v1/code-execution-history", async (request) => {
    const identity = await verify(request);
    return dependencies.codeExecutionHistory.listHistory(identity.uid);
  });
  // Interactive runs (apps/interactive-run-api) never touch this database
  // themselves — the client reports the outcome here once a run reaches a
  // natural exit, so it's counted the same way a judged run is. No judge
  // concept of "wrong answer" applies to a live interactive console (there's
  // no expected output to compare against), so this only distinguishes a
  // clean exit from everything else.
  server.post("/v1/interactive-run-history", async (request) => {
    const identity = await verify(request);
    const body = interactiveRunHistoryRequestSchema.parse(request.body);
    await dependencies.codeExecutionHistory.record(
      identity.uid,
      body.language,
      body.exitCode === 0 ? "accepted" : "runtime_error",
      body.timeMs,
    );
    return { recorded: true };
  });
  return server;
}
