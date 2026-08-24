import type {
  GuiContainerAdmin,
  GuiSessionProvisioningRepository,
} from "./types";

export interface GuiSessionProvisioningWorkerDependencies {
  readonly repository: GuiSessionProvisioningRepository;
  readonly containerAdmin: GuiContainerAdmin;
  readonly poolInstanceId: string;
  // Resource limits are platform-set, not per-request — a student doesn't
  // choose their own quota.
  readonly defaultCpuLimit: string;
  readonly defaultMemoryLimitMb: number;
}

function failureCode(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 80);
  return "PROVISIONING_FAILED";
}

// Mirrors @sqweb/workspace's ProvisioningWorker shape (claim → do the risky
// external work → complete/fail), minus the reset concept — a GUI session
// is fresh-container-per-Run, so there's no "replace this session's
// resource in place" case to handle.
export class GuiSessionProvisioningWorker {
  constructor(
    private readonly dependencies: GuiSessionProvisioningWorkerDependencies,
  ) {}

  async processNext(): Promise<"provisioned" | "cleanup" | "idle"> {
    // Cheap and idempotent — runs every tick so an expired session's
    // allocation becomes claimable by the cleanup step below without
    // waiting for a separate reaper pass.
    await this.dependencies.repository.reapExpiredActive();

    const cleanup = await this.dependencies.repository.claimCleanup();
    if (cleanup) {
      try {
        await this.dependencies.containerAdmin.remove(cleanup);
        await this.dependencies.repository.completeCleanup(cleanup.id);
      } catch (error) {
        await this.dependencies.repository.failCleanup(
          cleanup,
          failureCode(error),
        );
      }
      return "cleanup";
    }

    const task = await this.dependencies.repository.claimRequested();
    if (!task) return "idle";
    try {
      const provisioned = await this.dependencies.containerAdmin.provision({
        sessionId: task.sessionId,
        files: task.files,
        mainClassName: task.mainClassName,
        maxRuntimeSeconds: task.maxRuntimeSeconds,
        cpuLimit: this.dependencies.defaultCpuLimit,
        memoryLimitMb: this.dependencies.defaultMemoryLimitMb,
      });
      await this.dependencies.repository.completeProvisioning({
        task,
        provisioned,
        poolInstanceId: this.dependencies.poolInstanceId,
      });
      return "provisioned";
    } catch (error) {
      await this.dependencies.repository.failProvisioning(
        task.sessionId,
        failureCode(error),
      );
      return "provisioned";
    }
  }
}
