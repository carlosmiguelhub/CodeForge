import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

import type {
  WorkspaceCredential,
  WorkspaceSecretStore,
} from "@sqweb/workspace";

import { parseCredential } from "./credential";

export class LocalWorkspaceSecretStore implements WorkspaceSecretStore {
  private readonly root: string;

  constructor(root: string, nodeEnvironment: string) {
    if (nodeEnvironment === "production")
      throw new Error(
        "The local workspace secret store cannot run in production.",
      );
    this.root = resolve(root);
  }

  private path(secretRef: string) {
    const prefix = "local-secret://";
    if (!secretRef.startsWith(prefix))
      throw new Error("Unsupported local secret reference.");
    const name = secretRef.slice(prefix.length);
    if (basename(name) !== name || !/^[a-f0-9-]+\.json$/.test(name))
      throw new Error("Unsafe local secret reference.");
    return resolve(this.root, name);
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

  async get(secretRef: string) {
    return parseCredential(
      JSON.parse(await readFile(this.path(secretRef), "utf8")),
    );
  }

  async remove(secretRef: string) {
    await rm(this.path(secretRef), { force: true });
  }
}
