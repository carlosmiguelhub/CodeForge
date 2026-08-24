import { ExecutionGrantSigner } from "@sqweb/execution";
import Docker from "dockerode";
import { z } from "zod";

import { DockerInteractiveRunManager } from "./interactive-runner";
import { buildInteractiveRunServer } from "./server";

const environment = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
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
    PORT: z.coerce.number().int().positive().max(65_535).default(8084),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production")
      context.addIssue({
        code: "custom",
        path: ["NODE_ENV"],
        message:
          "This local Docker-backed interactive run service is not a production container orchestrator.",
      });
  })
  .parse(process.env);

const runs = new DockerInteractiveRunManager(
  {
    imageTag: environment.CODE_RUNTIME_IMAGE_TAG,
    memoryLimitMb: environment.INTERACTIVE_RUN_MEMORY_LIMIT_MB,
    cpuLimit: environment.INTERACTIVE_RUN_CPU_LIMIT,
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
});
await server.listen({ host: "0.0.0.0", port: environment.PORT });
