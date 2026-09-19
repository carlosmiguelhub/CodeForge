import { ExecutionGrantSigner } from "@sqweb/execution";
import {
  MySqlActivityGradingRepository,
  MySqlCodeExecutionRepository,
  MySqlExecutionRepository,
  MySqlRaceGradingRepository,
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
  OpenAiActivityGeneratorClient,
  UnconfiguredAiActivityGeneratorClient,
} from "./ai-activity-generator-client";
import {
  OpenAiQuizGeneratorClient,
  UnconfiguredAiQuizGeneratorClient,
} from "./ai-quiz-generator-client";
import { ActivityGradingService } from "./activity-grading-service";
import {
  RapidApiJudge0Client,
  UnconfiguredCodeJudgeClient,
} from "./code-judge-client";
import { ExecutionService } from "./execution-service";
import { FirebaseTokenVerifier } from "./firebase-adapters";
import { MySqlRunner } from "./mysql-runner";
import { QuizGenerationService } from "./quiz-generation-service";
import { RaceGradingService } from "./race-grading-service";
import { RequestVerifier } from "./request-verifier";
import { buildExecutionServer } from "./server";

const environment = z
  .object({
    FIREBASE_PROJECT_ID: z.string().min(1),
    FIREBASE_AUTH_EMULATOR_HOST: z.string().min(1).optional(),
    PLATFORM_DATABASE_URL: z.string().min(1),
    SQWEB_ALLOWED_ORIGINS: z.string().min(1),
    SQWEB_EXECUTION_GRANT_SECRET: z.string().min(32),
    WORKSPACE_SECRET_STORE: z.enum(["local", "google"]).default("google"),
    WORKSPACE_LOCAL_SECRET_DIRECTORY: z.string().min(1).optional(),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    RAPIDAPI_JUDGE0_KEY: z.string().min(1).optional(),
    RAPIDAPI_JUDGE0_HOST: z.string().min(1).default("judge0-ce.p.rapidapi.com"),
    OPENAI_API_KEY: z.string().min(1).optional(),
    OPENAI_MODEL: z.string().min(1).default("gpt-4o-mini"),
    OPENAI_REASONING_EFFORT: z.enum(["low", "medium", "high"]).optional(),
    PORT: z.coerce.number().int().positive().max(65_535).default(8081),
  })
  .superRefine((value, context) => {
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
  // Without this, mysql2 reinterprets TIMESTAMP columns using the Node
  // process's local timezone instead of the UTC instant MySQL actually
  // stored, silently shifting every Date read back by the local UTC
  // offset (e.g. -8h in GMT+0800) — corrupts every schedule/deadline
  // comparison without touching the stored bytes themselves.
  timezone: "Z",
});
const signer = new ExecutionGrantSigner(
  environment.SQWEB_EXECUTION_GRANT_SECRET,
);
const secrets =
  environment.WORKSPACE_SECRET_STORE === "local"
    ? new LocalWorkspaceSecretStore(
        environment.WORKSPACE_LOCAL_SECRET_DIRECTORY ?? "",
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
const aiGenerator = environment.OPENAI_API_KEY
  ? new OpenAiActivityGeneratorClient(
      environment.OPENAI_API_KEY,
      environment.OPENAI_MODEL,
      environment.OPENAI_REASONING_EFFORT,
    )
  : new UnconfiguredAiActivityGeneratorClient();
const aiQuizGenerator = environment.OPENAI_API_KEY
  ? new OpenAiQuizGeneratorClient(
      environment.OPENAI_API_KEY,
      environment.OPENAI_MODEL,
      environment.OPENAI_REASONING_EFFORT,
    )
  : new UnconfiguredAiQuizGeneratorClient();
const codeExecutionHistory = new MySqlCodeExecutionRepository(platformPool);
const activityGrading = new ActivityGradingService({
  codeJudge,
  activities: new MySqlActivityGradingRepository(platformPool),
  aiGenerator,
});
const raceGrading = new RaceGradingService({
  codeJudge,
  races: new MySqlRaceGradingRepository(platformPool),
});
const quizGeneration = new QuizGenerationService({ aiQuizGenerator });
const verifier = new RequestVerifier(new FirebaseTokenVerifier(firebaseApp));
const server = await buildExecutionServer({
  verifier,
  execution,
  codeJudge,
  activityGrading,
  raceGrading,
  quizGeneration,
  codeExecutionHistory,
  allowedOrigins: environment.SQWEB_ALLOWED_ORIGINS.split(",").map((value) =>
    value.trim(),
  ),
});
await server.listen({ host: "0.0.0.0", port: environment.PORT });
