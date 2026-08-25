import { ExecutionGrantSigner } from "@sqweb/execution";
import Docker from "dockerode";
import { z } from "zod";

import { DockerInteractiveRunManager } from "./interactive-runner";
import { buildInteractiveRunServer } from "./server";

const environment = z
  .object({
    SQWEB_EXECUTION_GRANT_SECRET: z.string().min(32),
    CODE_RUNTIME_IMAGE_TAG: z
      .string()
      .min(1)
      .default("sqweb/code-runtime:local"),
    INTERACTIVE_RUN_MAX_RUNTIME_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(300),
    INTERACTIVE_RUN_MEMORY_LIMIT_MB: z.coerce
      .number()
      .int()
      .positive()
      .default(512),
    INTERACTIVE_RUN_CPU_LIMIT: z.string().min(1).default("1000m"),
    INTERACTIVE_RUN_ORPHAN_SWEEP_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(10_000)
      .default(120_000),
    // Bounds how many containers this one Docker daemon will ever run for
    // interactive runs at once. Size this to what the box can actually hold
    // alongside everything else: (available RAM for runs) / INTERACTIVE_RUN_MEMORY_LIMIT_MB.
    // Default assumes a small single-VPS deployment (see infrastructure/vps
    // sizing notes) with ~1.5-2GB left for runs after MySQL x2 + the other
    // Node services + OS/Docker overhead, at the default 512MB/run limit.
    INTERACTIVE_RUN_MAX_CONCURRENT: z.coerce
      .number()
      .int()
      .positive()
      .default(3),
    // Only needed when this process itself runs inside a container talking
    // to the HOST's Docker daemon over a mounted socket (Docker-outside-
    // of-Docker) — see interactive-runner.ts's DockerInteractiveRunManagerOptions
    // comment for why the container-vs-host path split matters. Leave both
    // unset for local dev, where this process runs directly on the host.
    INTERACTIVE_RUN_TMP_DIR: z.string().min(1).optional(),
    INTERACTIVE_RUN_HOST_TMP_DIR: z.string().min(1).optional(),
    PORT: z.coerce.number().int().positive().max(65_535).default(8084),
  })
  .superRefine((value, context) => {
    if (
      Boolean(value.INTERACTIVE_RUN_TMP_DIR) !==
      Boolean(value.INTERACTIVE_RUN_HOST_TMP_DIR)
    )
      context.addIssue({
        code: "custom",
        message:
          "INTERACTIVE_RUN_TMP_DIR and INTERACTIVE_RUN_HOST_TMP_DIR must be set together, or not at all.",
      });
  })
  .parse(process.env);

const runs = new DockerInteractiveRunManager(
  {
    imageTag: environment.CODE_RUNTIME_IMAGE_TAG,
    memoryLimitMb: environment.INTERACTIVE_RUN_MEMORY_LIMIT_MB,
    cpuLimit: environment.INTERACTIVE_RUN_CPU_LIMIT,
    ...(environment.INTERACTIVE_RUN_TMP_DIR
      ? { tmpDir: environment.INTERACTIVE_RUN_TMP_DIR }
      : {}),
    ...(environment.INTERACTIVE_RUN_HOST_TMP_DIR
      ? { hostTmpDir: environment.INTERACTIVE_RUN_HOST_TMP_DIR }
      : {}),
  },
  new Docker(),
);

const maxOrphanAgeSeconds = environment.INTERACTIVE_RUN_MAX_RUNTIME_SECONDS * 2;
await runs.sweepOrphans(maxOrphanAgeSeconds);
const sweepTimer = setInterval(() => {
  void runs.sweepOrphans(maxOrphanAgeSeconds);
}, environment.INTERACTIVE_RUN_ORPHAN_SWEEP_INTERVAL_MS);
sweepTimer.unref();

const server = await buildInteractiveRunServer({
  grantSigner: new ExecutionGrantSigner(
    environment.SQWEB_EXECUTION_GRANT_SECRET,
  ),
  runs,
  maxRuntimeSeconds: environment.INTERACTIVE_RUN_MAX_RUNTIME_SECONDS,
  maxConcurrentRuns: environment.INTERACTIVE_RUN_MAX_CONCURRENT,
});
await server.listen({ host: "0.0.0.0", port: environment.PORT });
