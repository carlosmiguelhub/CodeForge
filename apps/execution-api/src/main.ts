import { ExecutionGrantSigner } from "@sqweb/execution";
import {
  MySqlCodeExecutionRepository,
  MySqlExecutionRepository,
} from "@sqweb/database-platform";
import { MySqlParserClassifier } from "@sqweb/sql-classifier";
import {
  GoogleWorkspaceSecretStore,
  LocalWorkspaceSecretStore,
} from "@sqweb/workspace-secrets";
import { applicationDefault, getApps, initializeApp } from "firebase-admin/app";
import { createPool } from "mysql2/promise";
import { z } from "zod";

import {
  RapidApiJudge0Client,
  UnconfiguredCodeJudgeClient,
} from "./code-judge-client";
import { ExecutionService } from "./execution-service";
import {
  FirebaseAppCheckVerifier,
  FirebaseTokenVerifier,
  LocalAppCheckVerifier,
} from "./firebase-adapters";
import { MySqlRunner } from "./mysql-runner";
import { RequestVerifier } from "./request-verifier";
import { buildExecutionServer } from "./server";

const environment = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional(),
    PLATFORM_DATABASE_URL: z.string().min(1),
    SQWEB_ALLOWED_ORIGINS: z.string().min(1),
    SQWEB_APP_CHECK_MODE: z.enum(["firebase", "local"]).default("firebase"),
    SQWEB_LOCAL_APP_CHECK_TOKEN: z.string().min(32).optional(),
    SQWEB_EXECUTION_GRANT_SECRET: z.string().min(32),
    WORKSPACE_SECRET_STORE: z.enum(["local", "google"]).default("google"),
    WORKSPACE_LOCAL_SECRET_DIRECTORY: z.string().min(1).optional(),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    RAPIDAPI_JUDGE0_KEY: z.string().min(1).optional(),
    RAPIDAPI_JUDGE0_HOST: z.string().min(1).default("judge0-ce.p.rapidapi.com"),
    PORT: z.coerce.number().int().positive().max(65_535).default(8081),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === "production" &&
      (value.SQWEB_APP_CHECK_MODE === "local" ||
        value.WORKSPACE_SECRET_STORE === "local")
    )
      context.addIssue({
        code: "custom",
        message: "Local security adapters cannot run in production.",
      });
    if (
      value.SQWEB_APP_CHECK_MODE === "local" &&
      !value.SQWEB_LOCAL_APP_CHECK_TOKEN
    )
      context.addIssue({
        code: "custom",
        path: ["SQWEB_LOCAL_APP_CHECK_TOKEN"],
        message: "Local App Check token is required.",
      });
    if (
      value.WORKSPACE_SECRET_STORE === "local" &&
      !value.WORKSPACE_LOCAL_SECRET_DIRECTORY
    )
      context.addIssue({
        code: "custom",
        path: ["WORKSPACE_LOCAL_SECRET_DIRECTORY"],
        message: "Local secret directory is required.",
      });
    if (
      value.WORKSPACE_SECRET_STORE === "google" &&
      !value.GOOGLE_CLOUD_PROJECT
    )
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_CLOUD_PROJECT"],
        message: "Google Cloud project is required.",
      });
  })
  .parse(process.env);

const firebaseApp =
  getApps()[0] ??
  initializeApp({
    ...(environment.FIREBASE_AUTH_EMULATOR_HOST
      ? {}
      : { credential: applicationDefault() }),
    projectId: environment.FIREBASE_PROJECT_ID,
  });
const platformPool = createPool({
  uri: environment.PLATFORM_DATABASE_URL,
  connectionLimit: 5,
  enableKeepAlive: true,
});
const signer = new ExecutionGrantSigner(
  environment.SQWEB_EXECUTION_GRANT_SECRET,
);
const secrets =
  environment.WORKSPACE_SECRET_STORE === "local"
    ? new LocalWorkspaceSecretStore(
        environment.WORKSPACE_LOCAL_SECRET_DIRECTORY ?? "",
        environment.NODE_ENV,
      )
    : new GoogleWorkspaceSecretStore(environment.GOOGLE_CLOUD_PROJECT ?? "");
const runner = new MySqlRunner();
const execution = new ExecutionService({
  signer,
  classifier: new MySqlParserClassifier(),
  repository: new MySqlExecutionRepository(platformPool),
  secrets,
  runner,
});
const codeJudge = environment.RAPIDAPI_JUDGE0_KEY
  ? new RapidApiJudge0Client(
      environment.RAPIDAPI_JUDGE0_KEY,
      environment.RAPIDAPI_JUDGE0_HOST,
    )
  : new UnconfiguredCodeJudgeClient();
const codeExecutionHistory = new MySqlCodeExecutionRepository(platformPool);
const verifier = new RequestVerifier(
  new FirebaseTokenVerifier(firebaseApp),
  environment.SQWEB_APP_CHECK_MODE === "local"
    ? new LocalAppCheckVerifier(environment.SQWEB_LOCAL_APP_CHECK_TOKEN ?? "")
    : new FirebaseAppCheckVerifier(firebaseApp),
);
const server = await buildExecutionServer({
  verifier,
  execution,
  codeJudge,
  codeExecutionHistory,
  allowedOrigins: environment.SQWEB_ALLOWED_ORIGINS.split(",").map((value) =>
    value.trim(),
  ),
});
await server.listen({ host: "0.0.0.0", port: environment.PORT });
