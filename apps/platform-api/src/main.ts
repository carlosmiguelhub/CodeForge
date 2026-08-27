import { IdentityService } from "@sqweb/auth";
import { AdminInsightsService } from "@sqweb/admin-insights";
import { CodeWorkspaceService } from "@sqweb/code-workspace";
import { ErdService } from "@sqweb/erd";
import { GuiSessionService } from "@sqweb/gui-session";
import { GuiWorkspaceService } from "@sqweb/gui-workspace";
import { SavedQueryService } from "@sqweb/saved-queries";
import { SectionService } from "@sqweb/sections";
import { WorkspaceService } from "@sqweb/workspace";
import { ExecutionGrantSigner } from "@sqweb/execution";
import {
  MySqlAccountRepository,
  MySqlAuditSink,
  MySqlCodeWorkspaceRepository,
  MySqlErdDiagramRepository,
  MySqlGuiSessionAccessReader,
  MySqlInfrastructureReader,
  MySqlInstitutionRepository,
  MySqlJavaGuiWorkspaceRepository,
  MySqlSavedQueryRepository,
  MySqlSectionRepository,
  MySqlUsageReader,
  MySqlWorkspaceRepository,
  platformSchema,
} from "@sqweb/database-platform";
import { drizzle } from "drizzle-orm/mysql2";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { createPool } from "mysql2/promise";
import { z } from "zod";

import {
  FirebaseClaimsWriter,
  FirebaseTokenVerifier,
  FirebaseUserProvisioner,
} from "./firebase-adapters";
import { buildServer } from "./server";

const environmentSchema = z
  .object({
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional(),
    PLATFORM_DATABASE_URL: z.string().min(1),
    SQWEB_ALLOWED_ORIGINS: z.string().min(1),
    SQWEB_DEFAULT_INSTITUTION_ID: z.string().uuid(),
    SQWEB_EXECUTION_GRANT_SECRET: z.string().min(32),
    GUI_SESSION_MAX_RUNTIME_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(600),
    INTERACTIVE_RUN_MAX_RUNTIME_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(300),
    PORT: z.coerce.number().int().positive().max(65_535).default(8080),
  });

const environment = environmentSchema.parse(process.env);
const firebaseApp =
  getApps()[0] ??
  initializeApp({
    ...(environment.FIREBASE_AUTH_EMULATOR_HOST
      ? {}
      : { credential: applicationDefault() }),
    projectId: environment.FIREBASE_PROJECT_ID,
  });

const pool = createPool({
  uri: environment.PLATFORM_DATABASE_URL,
  connectionLimit: 5,
  enableKeepAlive: true,
});
const database = drizzle(pool, {
  schema: platformSchema,
  mode: "default",
});

const audit = new MySqlAuditSink(
  database,
  environment.SQWEB_DEFAULT_INSTITUTION_ID,
);
const accounts = new MySqlAccountRepository(database);
const institutions = new MySqlInstitutionRepository(database);
const identity = new IdentityService({
  accounts,
  institutions,
  tokens: new FirebaseTokenVerifier(firebaseApp),
  claims: new FirebaseClaimsWriter(firebaseApp),
  audit,
  provisioner: new FirebaseUserProvisioner(firebaseApp),
  institutionId: environment.SQWEB_DEFAULT_INSTITUTION_ID,
});
const adminInsights = new AdminInsightsService({
  identity,
  accounts,
  usage: new MySqlUsageReader(database),
  auditReader: audit,
  audit,
  infrastructure: new MySqlInfrastructureReader(database),
});
const section = new SectionService({
  institutionId: environment.SQWEB_DEFAULT_INSTITUTION_ID,
  identity,
  sections: new MySqlSectionRepository(database),
  audit,
});
const workspace = new WorkspaceService({
  identity,
  workspaces: new MySqlWorkspaceRepository(database),
  audit,
});
const erd = new ErdService({
  identity,
  diagrams: new MySqlErdDiagramRepository(database),
  audit,
});
const codeWorkspace = new CodeWorkspaceService({
  identity,
  workspaces: new MySqlCodeWorkspaceRepository(database),
});
const savedQuery = new SavedQueryService({
  identity,
  // Reuses the ownership check WorkspaceService.getWorkspace already does
  // (404s on a workspace the caller doesn't own) rather than duplicating it.
  verifyWorkspaceOwnership: async (verified, workspaceId) => {
    await workspace.getWorkspace(verified, workspaceId);
  },
  queries: new MySqlSavedQueryRepository(database),
  audit,
});
const guiWorkspace = new GuiWorkspaceService({
  identity,
  workspaces: new MySqlJavaGuiWorkspaceRepository(database),
});
const executionGrantSigner = new ExecutionGrantSigner(
  environment.SQWEB_EXECUTION_GRANT_SECRET,
);
const guiSession = new GuiSessionService({
  identity,
  sections: section,
  workspaces: new MySqlJavaGuiWorkspaceRepository(database),
  sessions: new MySqlGuiSessionAccessReader(pool),
  grantSigner: executionGrantSigner,
  audit,
  maxRuntimeSeconds: environment.GUI_SESSION_MAX_RUNTIME_SECONDS,
  // Must outlive the whole session, unlike the SQL execution grant's 60s —
  // this same token re-authorizes WS reconnects for the run's full length.
  grantLifetimeSeconds: environment.GUI_SESSION_MAX_RUNTIME_SECONDS + 30,
});

const server = await buildServer({
  identity,
  adminInsights,
  section,
  workspace,
  erd,
  codeWorkspace,
  savedQuery,
  guiWorkspace,
  guiSession,
  executionGrantSigner,
  interactiveRunGrantLifetimeSeconds:
    environment.INTERACTIVE_RUN_MAX_RUNTIME_SECONDS + 30,
  allowedOrigins: environment.SQWEB_ALLOWED_ORIGINS.split(",").map((value) =>
    value.trim(),
  ),
});

await server.listen({ host: "0.0.0.0", port: environment.PORT });
