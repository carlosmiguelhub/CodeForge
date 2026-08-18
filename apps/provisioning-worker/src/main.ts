import { setTimeout as delay } from "node:timers/promises";

import { MySqlWorkspaceProvisioningRepository } from "@sqweb/database-platform";
import { ProvisioningWorker } from "@sqweb/workspace";
import { createPool } from "mysql2/promise";
import { z } from "zod";

import { LocalWorkspaceSecretStore } from "./local-secret-store";
import { MySqlWorkspaceAdmin } from "./mysql-workspace-admin";
import { GoogleWorkspaceSecretStore } from "./google-secret-store";

const environment = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PLATFORM_DATABASE_URL: z.string().min(1),
    WORKSPACE_ADMIN_DATABASE_URL: z.string().min(1),
    WORKSPACE_DATABASE_HOST: z.string().min(1),
    WORKSPACE_DATABASE_PORT: z.coerce.number().int().positive().max(65_535),
    WORKSPACE_POOL_INSTANCE_ID: z.string().uuid(),
    WORKSPACE_LOCAL_SECRET_DIRECTORY: z.string().min(1).optional(),
    WORKSPACE_SECRET_STORE: z.enum(["local", "google"]).default("google"),
    GOOGLE_CLOUD_PROJECT: z.string().min(1).optional(),
    WORKER_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(1000),
    WORKER_RUN_ONCE: z.enum(["true", "false"]).default("false"),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === "production" &&
      value.WORKSPACE_SECRET_STORE === "local"
    )
      context.addIssue({
        code: "custom",
        path: ["WORKSPACE_SECRET_STORE"],
        message: "Production requires Google Secret Manager.",
      });
    if (
      value.WORKSPACE_SECRET_STORE === "google" &&
      !value.GOOGLE_CLOUD_PROJECT
    )
      context.addIssue({
        code: "custom",
        path: ["GOOGLE_CLOUD_PROJECT"],
        message: "Google Secret Manager requires a project.",
      });
    if (
      value.WORKSPACE_SECRET_STORE === "local" &&
      !value.WORKSPACE_LOCAL_SECRET_DIRECTORY
    )
      context.addIssue({
        code: "custom",
        path: ["WORKSPACE_LOCAL_SECRET_DIRECTORY"],
        message: "The local secret store requires a directory.",
      });
  })
  .parse(process.env);

const platformPool = createPool({
  uri: environment.PLATFORM_DATABASE_URL,
  connectionLimit: 2,
  enableKeepAlive: true,
});
const workspaceAdminPool = createPool({
  uri: environment.WORKSPACE_ADMIN_DATABASE_URL,
  connectionLimit: 2,
  enableKeepAlive: true,
});
const worker = new ProvisioningWorker({
  repository: new MySqlWorkspaceProvisioningRepository(platformPool),
  databaseAdmin: new MySqlWorkspaceAdmin(
    workspaceAdminPool,
    environment.WORKSPACE_DATABASE_HOST,
    environment.WORKSPACE_DATABASE_PORT,
  ),
  secrets:
    environment.WORKSPACE_SECRET_STORE === "local"
      ? new LocalWorkspaceSecretStore(
          environment.WORKSPACE_LOCAL_SECRET_DIRECTORY ?? "",
          environment.NODE_ENV,
        )
      : new GoogleWorkspaceSecretStore(environment.GOOGLE_CLOUD_PROJECT ?? ""),
  poolInstanceId: environment.WORKSPACE_POOL_INSTANCE_ID,
});

let stopping = false;
process.once("SIGINT", () => (stopping = true));
process.once("SIGTERM", () => (stopping = true));

try {
  do {
    const outcome = await worker.processNext();
    if (environment.WORKER_RUN_ONCE === "true") break;
    if (outcome === "idle") await delay(environment.WORKER_POLL_INTERVAL_MS);
  } while (!stopping);
} finally {
  await Promise.all([platformPool.end(), workspaceAdminPool.end()]);
}
