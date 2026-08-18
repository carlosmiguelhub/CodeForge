import type {
  ProvisionedWorkspace,
  WorkspaceAllocation,
  WorkspaceDatabaseAdmin,
  WorkspaceProvisioningRepository,
  WorkspaceResetTask,
  WorkspaceSecretStore,
} from "./types";

export interface ProvisioningWorkerDependencies {
  readonly repository: WorkspaceProvisioningRepository;
  readonly databaseAdmin: WorkspaceDatabaseAdmin;
  readonly secrets: WorkspaceSecretStore;
  readonly poolInstanceId: string;
}

function failureCode(error: unknown): string {
  if (error instanceof Error && error.name === "WorkspaceProvisioningError")
    return error.message.slice(0, 80);
  return "PROVISIONING_FAILED";
}

export class ProvisioningWorker {
  constructor(private readonly dependencies: ProvisioningWorkerDependencies) {}

  private async discard(
    provisioned: ProvisionedWorkspace | null,
    secretRef: string | null,
  ) {
    if (secretRef)
      await this.dependencies.secrets.remove(secretRef).catch(() => undefined);
    if (provisioned) {
      const allocation: WorkspaceAllocation = {
        id: provisioned.allocationId,
        databaseName: provisioned.databaseName,
        databaseUser: provisioned.databaseUser,
        credentialSecretRef: secretRef ?? "",
      };
      await this.dependencies.databaseAdmin
        .remove(allocation)
        .catch(() => undefined);
    }
  }

  private async provision(workspaceId: string) {
    let provisioned: ProvisionedWorkspace | null = null;
    let secretRef: string | null = null;
    try {
      provisioned =
        await this.dependencies.databaseAdmin.provision(workspaceId);
      secretRef = await this.dependencies.secrets.put(
        workspaceId,
        provisioned.credential,
      );
      return { provisioned, secretRef };
    } catch (error) {
      await this.discard(provisioned, secretRef);
      throw error;
    }
  }

  async processNext(): Promise<"provisioned" | "reset" | "cleanup" | "idle"> {
    const cleanup = await this.dependencies.repository.claimCleanup();
    if (cleanup) {
      try {
        await this.dependencies.databaseAdmin.remove(cleanup);
        await this.dependencies.secrets.remove(cleanup.credentialSecretRef);
        await this.dependencies.repository.completeCleanup(cleanup.id);
      } catch (error) {
        await this.dependencies.repository.failCleanup(
          cleanup,
          failureCode(error),
        );
      }
      return "cleanup";
    }
    const reset = await this.dependencies.repository.claimReset();
    if (reset) return this.processReset(reset);

    const task = await this.dependencies.repository.claimRequested();
    if (!task) return "idle";
    let created: Awaited<ReturnType<ProvisioningWorker["provision"]>> | null =
      null;
    try {
      created = await this.provision(task.workspaceId);
      await this.dependencies.repository.completeProvisioning({
        task,
        ...created,
        poolInstanceId: this.dependencies.poolInstanceId,
      });
      return "provisioned";
    } catch (error) {
      if (created) await this.discard(created.provisioned, created.secretRef);
      await this.dependencies.repository.failProvisioning(
        task.workspaceId,
        failureCode(error),
      );
      return "provisioned";
    }
  }

  private async processReset(task: WorkspaceResetTask): Promise<"reset"> {
    let replacement: Awaited<
      ReturnType<ProvisioningWorker["provision"]>
    > | null = null;
    try {
      replacement = await this.provision(task.workspaceId);
      await this.dependencies.repository.completeReset({
        task,
        ...replacement,
        poolInstanceId: this.dependencies.poolInstanceId,
      });
    } catch (error) {
      if (replacement)
        await this.discard(replacement.provisioned, replacement.secretRef);
      await this.dependencies.repository.failReset(task, failureCode(error));
      return "reset";
    }

    return "reset";
  }
}
