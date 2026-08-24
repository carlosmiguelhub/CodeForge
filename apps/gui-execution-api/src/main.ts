import { MySqlGuiSessionAccessReader } from "@sqweb/database-platform";
import { ExecutionGrantSigner } from "@sqweb/execution";
import { createPool } from "mysql2/promise";
import { z } from "zod";

import { DockerGuiSessionLogReader } from "./docker-log-reader";
import { buildGuiExecutionServer } from "./server";

const environment = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PLATFORM_DATABASE_URL: z.string().min(1),
    // Shared with platform-api/execution-api — a gui-session grant is
    // verified the same way any other ExecutionGrantSigner-issued grant
    // is, just with its own payload `kind`.
    SQWEB_EXECUTION_GRANT_SECRET: z.string().min(32),
    PORT: z.coerce.number().int().positive().max(65_535).default(8082),
  })
  .superRefine((value, context) => {
    if (value.NODE_ENV === "production")
      context.addIssue({
        code: "custom",
        path: ["NODE_ENV"],
        message:
          "This Docker-log-reader-backed service cannot run in production yet — see plan phase 5 for the Kubernetes log reader.",
      });
  })
  .parse(process.env);

const platformPool = createPool({
  uri: environment.PLATFORM_DATABASE_URL,
  connectionLimit: 5,
  enableKeepAlive: true,
});

const server = await buildGuiExecutionServer({
  grantSigner: new ExecutionGrantSigner(
    environment.SQWEB_EXECUTION_GRANT_SECRET,
  ),
  accessReader: new MySqlGuiSessionAccessReader(platformPool),
  logs: new DockerGuiSessionLogReader(),
});
await server.listen({ host: "0.0.0.0", port: environment.PORT });
