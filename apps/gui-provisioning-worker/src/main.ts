import { setTimeout as delay } from "node:timers/promises";

import { MySqlGuiSessionProvisioningRepository } from "@sqweb/database-platform";
import { GuiSessionProvisioningWorker } from "@sqweb/gui-session";
import Docker from "dockerode";
import { createPool } from "mysql2/promise";
import { z } from "zod";

import { DockerGuiContainerAdmin } from "./docker-gui-container-admin";

const environment = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PLATFORM_DATABASE_URL: z.string().min(1),
    GUI_SESSION_POOL_INSTANCE_ID: z.string().uuid(),
    GUI_RUNTIME_IMAGE_TAG: z.string().min(1).default("sqweb/gui-runtime:local"),
    GUI_SANDBOX_NETWORK: z.string().min(1).default("sqweb-gui-sandbox"),
    GUI_SESSION_CPU_LIMIT: z.string().min(1).default("1000m"),
    GUI_SESSION_MEMORY_LIMIT_MB: z.coerce.number().int().positive().default(512),
    WORKER_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(60_000)
      .default(1000),
    WORKER_RUN_ONCE: z.enum(["true", "false"]).default("false"),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production")
      context.addIssue({
        code: "custom",
        path: ["NODE_ENV"],
        message:
          "This local Docker-backed worker cannot run in production — see plan phase 5 for KubernetesGuiContainerAdmin.",
      });
  })
  .parse(process.env);

// The worker ensures its own bridge network exists rather than depending
// on a manual `docker network create` step or unrelated docker-compose
// wiring.
//
// NOT internal: Docker silently drops published-port support entirely on
// `internal: true` networks (verified empirically — `NetworkSettings.Ports`
// comes back empty even with an explicit PortBindings request), and this
// worker/gui-execution-api reach the container via its published host
// port, not a direct bridge-IP route (Docker Desktop's Windows/Mac VM
// networking model doesn't reliably expose container IPs to the host the
// way native Linux Docker does). So true network-level egress-blocking for
// local dev is NOT achieved by this admin — it's a real, deliberate scope
// gap versus production, where KubernetesGuiContainerAdmin (Phase 5)
// enforces it correctly via a Kubernetes NetworkPolicy on real Linux
// networking. Every other isolation layer (non-root uid, read-only rootfs,
// dropped capabilities, pids/cpu/memory limits) still applies locally.
async function ensureSandboxNetwork(docker: Docker, name: string) {
  const networks = await docker.listNetworks({ filters: { name: [name] } });
  if (networks.some((network) => network.Name === name)) return;
  await docker.createNetwork({ Name: name });
}

const platformPool = createPool({
  uri: environment.PLATFORM_DATABASE_URL,
  connectionLimit: 2,
  enableKeepAlive: true,
});

const docker = new Docker();
await ensureSandboxNetwork(docker, environment.GUI_SANDBOX_NETWORK);

const worker = new GuiSessionProvisioningWorker({
  repository: new MySqlGuiSessionProvisioningRepository(platformPool),
  containerAdmin: new DockerGuiContainerAdmin({
    imageTag: environment.GUI_RUNTIME_IMAGE_TAG,
    network: environment.GUI_SANDBOX_NETWORK,
  }),
  poolInstanceId: environment.GUI_SESSION_POOL_INSTANCE_ID,
  defaultCpuLimit: environment.GUI_SESSION_CPU_LIMIT,
  defaultMemoryLimitMb: environment.GUI_SESSION_MEMORY_LIMIT_MB,
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
  await platformPool.end();
}
