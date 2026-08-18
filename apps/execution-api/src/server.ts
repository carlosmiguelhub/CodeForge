import { AuthorizationError } from "@sqweb/auth";
import { executionRequestSchema } from "@sqweb/contracts";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z, ZodError } from "zod";

import type { ExecutionService } from "./execution-service";
import { ConfirmationRequiredError } from "./execution-service";
import type { RequestVerifier } from "./request-verifier";

const idSchema = z.object({ id: z.string().uuid() });
const historySchema = z.object({ workspaceId: z.string().uuid() });

function header(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export async function buildExecutionServer(dependencies: {
  verifier: RequestVerifier;
  execution: ExecutionService;
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
                "req.headers.x-firebase-appcheck",
                "req.headers.x-sqweb-execution-grant",
                "req.body.sql",
                "req.body.grant",
                "req.body.confirmation",
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
      "X-Firebase-AppCheck",
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
  }) =>
    dependencies.verifier.verify(
      header(request.headers.authorization),
      header(request.headers["x-firebase-appcheck"]),
    );

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
  return server;
}
