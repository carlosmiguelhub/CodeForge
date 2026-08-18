import { randomUUID } from "node:crypto";

import { AuthorizationError, type IdentityService } from "@sqweb/auth";
import type { ClassroomService } from "@sqweb/classroom";
import type { WorkspaceService } from "@sqweb/workspace";
import {
  accountStatusSchema,
  classCreateRequestSchema,
  classUpdateRequestSchema,
  enrollmentChangeRequestSchema,
  courseCreateRequestSchema,
  departmentCreateRequestSchema,
  invitationCreateRequestSchema,
  joinClassRequestSchema,
  programCreateRequestSchema,
  registrationRequestSchema,
  termCreateRequestSchema,
  workspaceRequestSchema,
  workspaceResetRequestSchema,
} from "@sqweb/contracts";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { z, ZodError } from "zod";

const statusChangeSchema = z.object({
  status: accountStatusSchema.extract(["active", "suspended", "deactivated"]),
  reason: z.string().trim().min(8).max(500),
});

const statusParamsSchema = z.object({
  firebaseUid: z.string().min(1).max(128),
});

const classParamsSchema = z.object({
  id: z.string().uuid(),
});

const rosterParamsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
});

const invitationParamsSchema = z.object({
  id: z.string().uuid(),
});

const workspaceParamsSchema = z.object({ id: z.string().uuid() });

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export interface PlatformServerDependencies {
  readonly identity: IdentityService;
  readonly classroom: ClassroomService;
  readonly workspace: WorkspaceService;
  readonly allowedOrigins: readonly string[];
  readonly logger?: boolean;
}

export async function buildServer(dependencies: PlatformServerDependencies) {
  const server = Fastify({
    logger:
      dependencies.logger === false
        ? false
        : {
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.x-firebase-appcheck",
              ],
              censor: "[REDACTED]",
            },
          },
    requestIdHeader: "x-request-id",
    genReqId: () => randomUUID(),
  });

  await server.register(cors, {
    origin: [...dependencies.allowedOrigins],
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Authorization",
      "Content-Type",
      "X-Firebase-AppCheck",
      "X-Request-ID",
      "Idempotency-Key",
    ],
    credentials: false,
  });

  server.setErrorHandler(async (error, request, reply) => {
    if (error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          requestId: request.id,
        },
      });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: "VALIDATION_FAILED",
          message: "The request contains invalid values.",
          requestId: request.id,
          fieldErrors: error.issues.map((issue) => ({
            path: issue.path.join("."),
            message: issue.message,
          })),
        },
      });
    }

    request.log.error({ err: error }, "Unhandled platform API error");
    return reply.code(500).send({
      error: {
        code: "INTERNAL_ERROR",
        message: "The request could not be completed.",
        requestId: request.id,
      },
    });
  });

  server.get("/health", async () => ({ status: "ok" }));

  server.get("/v1/me", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.identity.getAccount(verified);
  });

  server.post("/v1/registrations", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = registrationRequestSchema.parse(request.body);
    const account = await dependencies.identity.register(
      verified,
      body.displayName,
      body.requestedRole,
    );
    return reply.code(201).send(account);
  });

  server.get("/v1/admin/users/pending", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.identity.listPendingAccounts(verified);
  });

  server.patch("/v1/admin/users/:firebaseUid/status", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = statusParamsSchema.parse(request.params);
    const body = statusChangeSchema.parse(request.body);
    return dependencies.identity.changeAccountStatus(
      verified,
      params.firebaseUid,
      body.status,
      body.reason,
    );
  });

  server.get("/v1/classes", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.classroom.listClasses(verified);
  });

  server.get("/v1/academic-options", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.classroom.listAcademicOptions(verified);
  });

  server.get("/v1/workspaces", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.workspace.listMine(verified);
  });

  server.post("/v1/workspaces", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = workspaceRequestSchema.parse(request.body);
    const workspace = await dependencies.workspace.requestWorkspace(
      verified,
      body,
      headerValue(request.headers["idempotency-key"]),
    );
    return reply.code(202).send(workspace);
  });

  server.get("/v1/workspaces/:id", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = workspaceParamsSchema.parse(request.params);
    return dependencies.workspace.getWorkspace(verified, params.id);
  });

  server.post("/v1/workspaces/:id/reset", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = workspaceParamsSchema.parse(request.params);
    const body = workspaceResetRequestSchema.parse(request.body);
    const workspace = await dependencies.workspace.requestReset(
      verified,
      params.id,
      body,
      headerValue(request.headers["idempotency-key"]),
    );
    return reply.code(202).send(workspace);
  });

  server.get("/v1/admin/academics", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.classroom.listAcademicCatalog(verified);
  });

  server.post("/v1/admin/academics/departments", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = departmentCreateRequestSchema.parse(request.body);
    return reply
      .code(201)
      .send(await dependencies.classroom.createDepartment(verified, body));
  });

  server.post("/v1/admin/academics/programs", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = programCreateRequestSchema.parse(request.body);
    return reply
      .code(201)
      .send(await dependencies.classroom.createProgram(verified, body));
  });

  server.post("/v1/admin/academics/courses", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = courseCreateRequestSchema.parse(request.body);
    return reply
      .code(201)
      .send(await dependencies.classroom.createCourse(verified, body));
  });

  server.post("/v1/admin/academics/terms", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = termCreateRequestSchema.parse(request.body);
    return reply
      .code(201)
      .send(await dependencies.classroom.createTerm(verified, body));
  });

  server.post("/v1/classes", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = classCreateRequestSchema.parse(request.body);
    const created = await dependencies.classroom.createClass(verified, body);
    return reply.code(201).send(created);
  });

  server.get("/v1/classes/:id", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = classParamsSchema.parse(request.params);
    return dependencies.classroom.getClass(verified, params.id);
  });

  server.patch("/v1/classes/:id", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = classParamsSchema.parse(request.params);
    const body = classUpdateRequestSchema.parse(request.body);
    return dependencies.classroom.updateClass(verified, params.id, body);
  });

  server.post("/v1/classes/:id/join", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = classParamsSchema.parse(request.params);
    const body = joinClassRequestSchema.parse(request.body);
    return dependencies.classroom.joinClass(verified, params.id, body.code);
  });

  server.get("/v1/classes/:id/roster", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = classParamsSchema.parse(request.params);
    return dependencies.classroom.getRoster(verified, params.id);
  });

  server.patch("/v1/classes/:id/roster/:userId", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = rosterParamsSchema.parse(request.params);
    const body = enrollmentChangeRequestSchema.parse(request.body);
    return dependencies.classroom.changeEnrollment(
      verified,
      params.id,
      params.userId,
      body,
    );
  });

  server.post("/v1/classes/:id/invites", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = classParamsSchema.parse(request.params);
    const body = invitationCreateRequestSchema.parse(request.body);
    const invitation = await dependencies.classroom.createInvitation(
      verified,
      params.id,
      body,
    );
    return reply.code(201).send(invitation);
  });

  server.delete("/v1/class-invites/:id", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = invitationParamsSchema.parse(request.params);
    await dependencies.classroom.revokeInvitation(verified, params.id);
    return reply.code(204).send();
  });

  return server;
}
