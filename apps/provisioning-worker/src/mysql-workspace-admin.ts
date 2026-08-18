import { randomBytes, randomUUID } from "node:crypto";

import type {
  ProvisionedWorkspace,
  WorkspaceAllocation,
  WorkspaceDatabaseAdmin,
} from "@sqweb/workspace";
import type { Pool } from "mysql2/promise";

const safeIdentifier = /^[a-z][a-z0-9_]{0,63}$/;

export function quoteIdentifier(value: string): string {
  if (!safeIdentifier.test(value))
    throw new Error("Unsafe generated MySQL identifier.");
  return `\`${value}\``;
}

export class MySqlWorkspaceAdmin implements WorkspaceDatabaseAdmin {
  constructor(
    private readonly pool: Pool,
    private readonly connectionHost: string,
    private readonly connectionPort: number,
  ) {}

  async provision(workspaceId: string): Promise<ProvisionedWorkspace> {
    const allocationId = randomUUID();
    const suffix = randomBytes(8).toString("hex");
    const databaseName = `sqw_${workspaceId.replaceAll("-", "").slice(0, 12)}_${suffix}`;
    const databaseUser = `sqw_${randomBytes(8).toString("hex")}`;
    const password = randomBytes(32).toString("base64url");
    const database = quoteIdentifier(databaseName);
    let databaseCreated = false;
    let userCreated = false;

    try {
      await this.pool.query(`CREATE DATABASE ${database}`);
      databaseCreated = true;
      await this.pool.query(
        "CREATE USER ?@'%' IDENTIFIED BY ? WITH MAX_USER_CONNECTIONS 2",
        [databaseUser, password],
      );
      userCreated = true;
      await this.pool.query(
        `GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, INDEX, REFERENCES, CREATE VIEW, SHOW VIEW
         ON ${database}.* TO ?@'%'`,
        [databaseUser],
      );
      return {
        allocationId,
        databaseName,
        databaseUser,
        credential: {
          host: this.connectionHost,
          port: this.connectionPort,
          database: databaseName,
          username: databaseUser,
          password,
        },
      };
    } catch (error) {
      if (userCreated)
        await this.pool
          .query("DROP USER IF EXISTS ?@'%'", [databaseUser])
          .catch(() => undefined);
      if (databaseCreated)
        await this.pool
          .query(`DROP DATABASE IF EXISTS ${database}`)
          .catch(() => undefined);
      throw error;
    }
  }

  async remove(allocation: WorkspaceAllocation): Promise<void> {
    await this.pool.query("DROP USER IF EXISTS ?@'%'", [
      allocation.databaseUser,
    ]);
    await this.pool.query(
      `DROP DATABASE IF EXISTS ${quoteIdentifier(allocation.databaseName)}`,
    );
  }
}
