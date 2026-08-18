import { SecretManagerServiceClient } from "@google-cloud/secret-manager";
import type {
  WorkspaceCredential,
  WorkspaceSecretStore,
} from "@sqweb/workspace";

import { parseCredential } from "./credential";

export class GoogleWorkspaceSecretStore implements WorkspaceSecretStore {
  constructor(
    private readonly projectId: string,
    private readonly client = new SecretManagerServiceClient(),
  ) {}

  private validateRef(secretRef: string) {
    if (
      !secretRef.startsWith(
        `projects/${this.projectId}/secrets/sqweb-workspace-`,
      )
    )
      throw new Error(
        "Workspace secret reference is outside the configured project.",
      );
  }

  async put(workspaceId: string, credential: WorkspaceCredential) {
    const parent = `projects/${this.projectId}`;
    const secretId = `sqweb-workspace-${workspaceId}`;
    const secretName = `${parent}/secrets/${secretId}`;
    try {
      await this.client.getSecret({ name: secretName });
    } catch (error) {
      if ((error as { code?: number }).code !== 5) throw error;
      await this.client.createSecret({
        parent,
        secretId,
        secret: { replication: { automatic: {} } },
      });
    }
    const [version] = await this.client.addSecretVersion({
      parent: secretName,
      payload: { data: Buffer.from(JSON.stringify(credential), "utf8") },
    });
    if (!version.name)
      throw new Error("Secret Manager did not return a version reference.");
    return version.name;
  }

  async get(secretRef: string) {
    this.validateRef(secretRef);
    const [version] = await this.client.accessSecretVersion({
      name: secretRef,
    });
    const data = version.payload?.data;
    if (!data) throw new Error("Workspace credential secret is empty.");
    return parseCredential(
      JSON.parse(Buffer.from(data as Uint8Array).toString("utf8")),
    );
  }

  async remove(secretRef: string) {
    this.validateRef(secretRef);
    await this.client.destroySecretVersion({ name: secretRef });
  }
}
