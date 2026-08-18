import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type {
  WorkspaceCredential,
  WorkspaceSecretStore,
} from "@sqweb/workspace";

export class LocalWorkspaceSecretStore implements WorkspaceSecretStore {
  private readonly root: string;

  constructor(root: string, nodeEnvironment: string) {
    if (nodeEnvironment === "production")
      throw new Error(
        "The local workspace secret store cannot run in production.",
      );
    this.root = resolve(root);
  }

  async put(workspaceId: string, credential: WorkspaceCredential) {
    await mkdir(this.root, { recursive: true });
    const name = `${workspaceId}-${randomBytes(8).toString("hex")}.json`;
    const finalPath = resolve(this.root, name);
    const temporaryPath = `${finalPath}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(credential), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    await rename(temporaryPath, finalPath);
    return `local-secret://${name}`;
  }

  async remove(secretRef: string) {
    const prefix = "local-secret://";
    if (!secretRef.startsWith(prefix))
      throw new Error("Unsupported local secret reference.");
    const name = secretRef.slice(prefix.length);
    if (basename(name) !== name || !/^[a-f0-9-]+\.json$/.test(name))
      throw new Error("Unsafe local secret reference.");
    await rm(resolve(this.root, name), { force: true });
  }

  async get(secretRef: string) {
    const prefix = "local-secret://";
    if (!secretRef.startsWith(prefix))
      throw new Error("Unsupported local secret reference.");
    const name = secretRef.slice(prefix.length);
    if (basename(name) !== name || !/^[a-f0-9-]+\.json$/.test(name))
      throw new Error("Unsafe local secret reference.");
    return JSON.parse(
      await readFile(resolve(this.root, name), "utf8"),
    ) as WorkspaceCredential;
  }
}
