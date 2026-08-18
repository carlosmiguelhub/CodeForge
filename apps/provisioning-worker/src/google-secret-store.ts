import type {
  WorkspaceCredential,
  WorkspaceSecretStore,
} from "@sqweb/workspace";
import { SecretManagerServiceClient } from "@google-cloud/secret-manager";

export class GoogleWorkspaceSecretStore implements WorkspaceSecretStore {
  constructor(
    private readonly projectId: string,
    private readonly client = new SecretManagerServiceClient(),
  ) {}

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

  async remove(secretRef: string) {
    if (
      !secretRef.startsWith(
        `projects/${this.projectId}/secrets/sqweb-workspace-`,
      )
    )
      throw new Error(
        "Workspace secret reference is outside the configured project.",
      );
    await this.client.destroySecretVersion({ name: secretRef });
  }
}
