import { randomUUID } from "node:crypto";

import { AuthorizationError, type IdentityService } from "@sqweb/auth";
import type { AdminInsightsService } from "@sqweb/admin-insights";
import type { CodeWorkspaceService } from "@sqweb/code-workspace";
import type { ErdService } from "@sqweb/erd";
import type { GuiSessionService } from "@sqweb/gui-session";
import type { GuiWorkspaceService } from "@sqweb/gui-workspace";
import type { SavedQueryService } from "@sqweb/saved-queries";
import type { SectionService } from "@sqweb/sections";
import type { WorkspaceService } from "@sqweb/workspace";
import type { ExecutionGrantSigner } from "@sqweb/execution";
import {
  accountListQuerySchema,
  accountStatusSchema,
  activityResetRequestSchema,
  adminAssignSectionRequestSchema,
  adminCreateUserRequestSchema,
  adminSetPasswordRequestSchema,
  auditEventListQuerySchema,
  codeWorkspaceSaveRequestSchema,
  erdDiagramCreateRequestSchema,
  erdDiagramRenameRequestSchema,
  erdDiagramSaveContentRequestSchema,
  executionGrantRequestSchema,
  guiSessionAdminListQuerySchema,
  guiSessionCreateRequestSchema,
  interactiveExecutionLimits,
  javaGuiWorkspaceSaveRequestSchema,
  maintenanceUpdateRequestSchema,
  profileUpdateRequestSchema,
  registrationRequestSchema,
  roleAssignmentRequestSchema,
  roleSchema,
  savedQueryCreateRequestSchema,
  savedQueryUpdateRequestSchema,
  sectionCreateRequestSchema,
  sectionLockedWorkspacesUpdateRequestSchema,
  topContributorListQuerySchema,
  workspaceAllocationListQuerySchema,
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

const roleParamsSchema = z.object({
  firebaseUid: z.string().min(1).max(128),
  role: roleSchema,
});

const sectionParamsSchema = z.object({ id: z.string().uuid() });
const workspaceParamsSchema = z.object({ id: z.string().uuid() });
const erdDiagramParamsSchema = z.object({ id: z.string().uuid() });
const savedQueryParamsSchema = z.object({ id: z.string().uuid() });
const guiSessionParamsSchema = z.object({ id: z.string().uuid() });
const savedQueryListQuerySchema = z.object({ workspaceId: z.string().uuid() });

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export interface PlatformServerDependencies {
  readonly identity: IdentityService;
  readonly adminInsights: AdminInsightsService;
  readonly section: SectionService;
  readonly workspace: WorkspaceService;
  readonly erd: ErdService;
  readonly codeWorkspace: CodeWorkspaceService;
  readonly savedQuery: SavedQueryService;
  readonly guiWorkspace: GuiWorkspaceService;
  readonly guiSession: GuiSessionService;
  readonly executionGrantSigner: ExecutionGrantSigner;
  readonly interactiveRunGrantLifetimeSeconds?: number;
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
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
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

  server.get("/v1/me/workspace-access", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.section.getWorkspaceAccess(verified);
  });

  server.patch("/v1/me", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = profileUpdateRequestSchema.parse(request.body);
    return dependencies.identity.updateProfile(verified, body.displayName);
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
      body.sectionId,
    );
    return reply.code(201).send(account);
  });

  server.get("/v1/sections", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    return dependencies.section.listPublic();
  });

  server.get("/v1/system/status", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    return dependencies.identity.getSystemStatus();
  });

  server.put("/v1/admin/settings/maintenance", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = maintenanceUpdateRequestSchema.parse(request.body);
    return dependencies.identity.setMaintenanceMode(
      verified,
      body.enabled,
      body.message ?? null,
    );
  });

  server.post("/v1/admin/settings/activity-reset", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = activityResetRequestSchema.parse(request.body);
    return dependencies.adminInsights.resetActivityHistory(verified, body);
  });

  server.get("/v1/admin/sections", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.section.listAll(verified);
  });

  server.post("/v1/admin/sections", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = sectionCreateRequestSchema.parse(request.body);
    const created = await dependencies.section.createSection(
      verified,
      body.name,
    );
    return reply.code(201).send(created);
  });

  server.delete("/v1/admin/sections/:id", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = sectionParamsSchema.parse(request.params);
    await dependencies.section.archiveSection(verified, params.id);
    return reply.code(204).send();
  });

  server.post("/v1/admin/sections/:id/restore", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = sectionParamsSchema.parse(request.params);
    await dependencies.section.restoreSection(verified, params.id);
    return reply.code(204).send();
  });

  server.patch("/v1/admin/sections/:id/locked-workspaces", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = sectionParamsSchema.parse(request.params);
    const body = sectionLockedWorkspacesUpdateRequestSchema.parse(request.body);
    return dependencies.section.setLockedWorkspaces(
      verified,
      params.id,
      body.lockedWorkspaces,
    );
  });

  server.get("/v1/admin/users", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const query = accountListQuerySchema.parse(request.query);
    return dependencies.identity.listAccounts(verified, query);
  });

  server.post("/v1/admin/users", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = adminCreateUserRequestSchema.parse(request.body);
    const account = await dependencies.identity.createAccount(verified, body);
    return reply.code(201).send(account);
  });

  server.get("/v1/admin/users/:firebaseUid", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = statusParamsSchema.parse(request.params);
    return dependencies.identity.getAccountDetail(verified, params.firebaseUid);
  });

  server.get("/v1/admin/users/:firebaseUid/usage", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = statusParamsSchema.parse(request.params);
    return dependencies.adminInsights.getUserUsage(
      verified,
      params.firebaseUid,
    );
  });

  server.post("/v1/admin/users/:firebaseUid/roles", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = statusParamsSchema.parse(request.params);
    const body = roleAssignmentRequestSchema.parse(request.body);
    return dependencies.identity.assignRole(
      verified,
      params.firebaseUid,
      body.role,
    );
  });

  server.patch("/v1/admin/users/:firebaseUid/section", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = statusParamsSchema.parse(request.params);
    const body = adminAssignSectionRequestSchema.parse(request.body);
    return dependencies.identity.assignSection(
      verified,
      params.firebaseUid,
      body.sectionId,
    );
  });

  server.delete("/v1/admin/users/:firebaseUid/roles/:role", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = roleParamsSchema.parse(request.params);
    return dependencies.identity.removeRole(
      verified,
      params.firebaseUid,
      params.role,
    );
  });

  server.post(
    "/v1/admin/users/:firebaseUid/reset-password",
    async (request, reply) => {
      await dependencies.identity.verifyAppCheck(
        headerValue(request.headers["x-firebase-appcheck"]),
      );
      const verified = await dependencies.identity.verifyBearer(
        request.headers.authorization,
      );
      const params = statusParamsSchema.parse(request.params);
      await dependencies.identity.recordPasswordResetRequested(
        verified,
        params.firebaseUid,
      );
      return reply.code(204).send();
    },
  );

  server.post(
    "/v1/admin/users/:firebaseUid/set-password",
    async (request, reply) => {
      await dependencies.identity.verifyAppCheck(
        headerValue(request.headers["x-firebase-appcheck"]),
      );
      const verified = await dependencies.identity.verifyBearer(
        request.headers.authorization,
      );
      const params = statusParamsSchema.parse(request.params);
      const body = adminSetPasswordRequestSchema.parse(request.body);
      await dependencies.identity.setAccountPassword(
        verified,
        params.firebaseUid,
        body.password,
      );
      return reply.code(204).send();
    },
  );

  server.delete("/v1/admin/users/:firebaseUid", async (request, reply) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = statusParamsSchema.parse(request.params);
    await dependencies.identity.deleteAccount(verified, params.firebaseUid);
    return reply.code(204).send();
  });

  server.get("/v1/admin/dashboard", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.adminInsights.getDashboardStats(verified);
  });

  server.get("/v1/admin/top-contributors", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const query = topContributorListQuerySchema.parse(request.query);
    return dependencies.adminInsights.listTopContributors(verified, query);
  });

  server.get("/v1/admin/audit-events", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const query = auditEventListQuerySchema.parse(request.query);
    return dependencies.adminInsights.listAuditEvents(verified, query);
  });

  server.get("/v1/admin/infrastructure", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.adminInsights.getInfrastructureOverview(verified);
  });

  server.get("/v1/admin/infrastructure/allocations", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const query = workspaceAllocationListQuerySchema.parse(request.query);
    return dependencies.adminInsights.listWorkspaceAllocations(verified, query);
  });

  server.get("/v1/admin/gui-sessions/overview", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    return dependencies.adminInsights.getGuiSessionOverview(verified);
  });

  server.get("/v1/admin/gui-sessions", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const query = guiSessionAdminListQuerySchema.parse(request.query);
    return dependencies.adminInsights.listGuiSessions(verified, query);
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

  server.get("/v1/workspaces", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "sql-workbench",
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
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "sql-workbench",
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
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "sql-workbench",
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
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "sql-workbench",
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

  server.get("/v1/erd-diagrams", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(verified, "erd-editor");
    return dependencies.erd.listMine(verified);
  });

  server.post("/v1/erd-diagrams", async (request, reply) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(verified, "erd-editor");
    const body = erdDiagramCreateRequestSchema.parse(request.body ?? {});
    const diagram = await dependencies.erd.createDiagram(verified, body);
    return reply.code(201).send(diagram);
  });

  server.get("/v1/erd-diagrams/:id", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(verified, "erd-editor");
    const params = erdDiagramParamsSchema.parse(request.params);
    return dependencies.erd.getDiagram(verified, params.id);
  });

  server.patch("/v1/erd-diagrams/:id", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(verified, "erd-editor");
    const params = erdDiagramParamsSchema.parse(request.params);
    const body = erdDiagramRenameRequestSchema.parse(request.body);
    return dependencies.erd.renameDiagram(verified, params.id, body);
  });

  server.put("/v1/erd-diagrams/:id/content", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(verified, "erd-editor");
    const params = erdDiagramParamsSchema.parse(request.params);
    const body = erdDiagramSaveContentRequestSchema.parse(request.body);
    return dependencies.erd.saveContent(verified, params.id, body);
  });

  server.delete("/v1/erd-diagrams/:id", async (request, reply) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(verified, "erd-editor");
    const params = erdDiagramParamsSchema.parse(request.params);
    await dependencies.erd.deleteDiagram(verified, params.id);
    return reply.code(204).send();
  });

  server.get("/v1/code-workspace", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "code-compiler",
    );
    return dependencies.codeWorkspace.get(verified);
  });

  server.put("/v1/code-workspace", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "code-compiler",
    );
    const body = codeWorkspaceSaveRequestSchema.parse(request.body);
    return dependencies.codeWorkspace.save(verified, body);
  });

  server.get("/v1/gui-workspace", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "java-gui-workspace",
    );
    return dependencies.guiWorkspace.get(verified);
  });

  server.put("/v1/gui-workspace", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "java-gui-workspace",
    );
    const body = javaGuiWorkspaceSaveRequestSchema.parse(request.body);
    return dependencies.guiWorkspace.save(verified, body);
  });

  // The workspace-lock check for gui-sessions happens inside
  // GuiSessionService.createSession itself, not here — unlike
  // /v1/gui-workspace above, session creation atomically bundles the lock
  // check with saving the submitted content and creating the session row,
  // so it can't drift out of sync with a separate route-level check.
  server.post("/v1/gui-sessions", async (request, reply) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const body = guiSessionCreateRequestSchema.parse(request.body);
    const session = await dependencies.guiSession.createSession(verified, body);
    return reply.code(202).send(session);
  });

  server.get("/v1/gui-sessions/:id", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = guiSessionParamsSchema.parse(request.params);
    return dependencies.guiSession.getSession(verified, params.id);
  });

  server.delete("/v1/gui-sessions/:id", async (request, reply) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    const params = guiSessionParamsSchema.parse(request.params);
    await dependencies.guiSession.stopSession(verified, params.id);
    return reply.code(204).send();
  });

  server.get("/v1/saved-queries", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "saved-queries",
    );
    const query = savedQueryListQuerySchema.parse(request.query);
    return dependencies.savedQuery.listMine(verified, query.workspaceId);
  });

  server.post("/v1/saved-queries", async (request, reply) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "saved-queries",
    );
    const body = savedQueryCreateRequestSchema.parse(request.body);
    const query = await dependencies.savedQuery.createQuery(verified, body);
    return reply.code(201).send(query);
  });

  server.patch("/v1/saved-queries/:id", async (request) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "saved-queries",
    );
    const params = savedQueryParamsSchema.parse(request.params);
    const body = savedQueryUpdateRequestSchema.parse(request.body);
    return dependencies.savedQuery.updateQuery(verified, params.id, body);
  });

  server.delete("/v1/saved-queries/:id", async (request, reply) => {
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "saved-queries",
    );
    const params = savedQueryParamsSchema.parse(request.params);
    await dependencies.savedQuery.deleteQuery(verified, params.id);
    return reply.code(204).send();
  });

  server.post("/v1/interactive-run-grants", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "code-compiler",
    );
    const actor = await dependencies.identity.requireActiveAccount(verified, [
      "student",
      "teacher",
    ]);
    const issued = dependencies.executionGrantSigner.issueInteractiveRun(
      actor,
      dependencies.interactiveRunGrantLifetimeSeconds ?? 330,
    );
    return {
      token: issued.token,
      expiresAt: new Date(issued.payload.expiresAt * 1000).toISOString(),
    };
  });

  server.post("/v1/execution-grants", async (request) => {
    await dependencies.identity.verifyAppCheck(
      headerValue(request.headers["x-firebase-appcheck"]),
    );
    const verified = await dependencies.identity.verifyBearer(
      request.headers.authorization,
    );
    await dependencies.section.assertWorkspaceUnlocked(
      verified,
      "sql-workbench",
    );
    const actor = await dependencies.identity.requireActiveAccount(verified, [
      "student",
      "teacher",
    ]);
    const body = executionGrantRequestSchema.parse(request.body);
    const workspace = await dependencies.workspace.getWorkspace(
      verified,
      body.workspaceId,
    );
    if (workspace.state !== "ready")
      throw new AuthorizationError(
        "WORKSPACE_NOT_READY",
        "The workspace is not ready for SQL execution.",
        409,
      );
    const issued = dependencies.executionGrantSigner.issueExecution(
      actor,
      workspace.id,
    );
    return {
      grant: issued.token,
      expiresAt: new Date(issued.payload.expiresAt * 1000).toISOString(),
      effectivePolicy: interactiveExecutionLimits,
    };
  });

  return server;
}
