import { IdentityService } from "@sqweb/auth";
import { ClassroomService } from "@sqweb/classroom";
import { WorkspaceService } from "@sqweb/workspace";
import {
  MySqlAccountRepository,
  MySqlAuditSink,
  MySqlClassroomRepository,
  MySqlWorkspaceRepository,
  platformSchema,
} from "@sqweb/database-platform";
import { drizzle } from "drizzle-orm/mysql2";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { createPool } from "mysql2/promise";
import { z } from "zod";

import {
  FirebaseAppCheckVerifier,
  FirebaseClaimsWriter,
  FirebaseTokenVerifier,
  LocalAppCheckVerifier,
} from "./firebase-adapters";
import { buildServer } from "./server";

const environmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional(),
    PLATFORM_DATABASE_URL: z.string().min(1),
    SQWEB_ALLOWED_ORIGINS: z.string().min(1),
    SQWEB_DEFAULT_INSTITUTION_ID: z.string().uuid(),
    SQWEB_APP_CHECK_MODE: z.enum(["firebase", "local"]).default("firebase"),
    SQWEB_LOCAL_APP_CHECK_TOKEN: z.string().min(32).optional(),
    PORT: z.coerce.number().int().positive().max(65_535).default(8080),
  })
  .superRefine((value, context) => {
    if (
      value.SQWEB_APP_CHECK_MODE === "local" &&
      value.NODE_ENV === "production"
    ) {
      context.addIssue({
        code: "custom",
        path: ["SQWEB_APP_CHECK_MODE"],
        message: "Local App Check cannot run in production.",
      });
    }
    if (
      value.SQWEB_APP_CHECK_MODE === "local" &&
      !value.SQWEB_LOCAL_APP_CHECK_TOKEN
    ) {
      context.addIssue({
        code: "custom",
        path: ["SQWEB_LOCAL_APP_CHECK_TOKEN"],
        message: "Local App Check requires an explicit token.",
      });
    }
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
const identity = new IdentityService({
  accounts: new MySqlAccountRepository(database),
  tokens: new FirebaseTokenVerifier(firebaseApp),
  appCheck:
    environment.SQWEB_APP_CHECK_MODE === "local"
      ? new LocalAppCheckVerifier(environment.SQWEB_LOCAL_APP_CHECK_TOKEN ?? "")
      : new FirebaseAppCheckVerifier(firebaseApp),
  claims: new FirebaseClaimsWriter(firebaseApp),
  audit,
  institutionId: environment.SQWEB_DEFAULT_INSTITUTION_ID,
});
const classroom = new ClassroomService({
  identity,
  classroom: new MySqlClassroomRepository(database),
  audit,
});
const workspace = new WorkspaceService({
  identity,
  workspaces: new MySqlWorkspaceRepository(database),
  audit,
});

const server = await buildServer({
  identity,
  classroom,
  workspace,
  allowedOrigins: environment.SQWEB_ALLOWED_ORIGINS.split(",").map((value) =>
    value.trim(),
  ),
});

await server.listen({ host: "0.0.0.0", port: environment.PORT });
