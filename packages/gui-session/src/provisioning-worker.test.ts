import { describe, expect, it, vi } from "vitest";

import type {
  GuiContainerAdmin,
  GuiSessionProvisioningRepository,
  ProvisionedGuiContainer,
} from "./types";
import { GuiSessionProvisioningWorker } from "./provisioning-worker";

const task = {
  sessionId: "00000000-0000-4000-8000-000000000050",
  institutionId: "00000000-0000-4000-8000-000000000001",
  ownerId: "00000000-0000-4000-8000-000000000010",
  files: [{ path: "Main.java", content: "class Main {}" }],
  mainClassName: "Main",
  maxRuntimeSeconds: 600,
};
const provisioned: ProvisionedGuiContainer = {
  allocationId: "00000000-0000-4000-8000-000000000051",
  containerRef: "container-abc123",
  internalHost: "127.0.0.1",
  websockifyPort: 16080,
};

function setup() {
  const repository: GuiSessionProvisioningRepository = {
    claimRequested: vi.fn().mockResolvedValue(task),
    claimCleanup: vi.fn().mockResolvedValue(null),
    completeProvisioning: vi.fn().mockResolvedValue(undefined),
    failProvisioning: vi.fn().mockResolvedValue(undefined),
    completeCleanup: vi.fn().mockResolvedValue(undefined),
    failCleanup: vi.fn().mockResolvedValue(undefined),
    reapExpiredActive: vi.fn().mockResolvedValue(0),
  };
  const containerAdmin: GuiContainerAdmin = {
    provision: vi.fn().mockResolvedValue(provisioned),
    remove: vi.fn().mockResolvedValue(undefined),
    isReachable: vi.fn().mockResolvedValue(true),
  };
  return {
    repository,
    containerAdmin,
    worker: new GuiSessionProvisioningWorker({
      repository,
      containerAdmin,
      poolInstanceId: "00000000-0000-4000-8000-000000000060",
      defaultCpuLimit: "1000m",
      defaultMemoryLimitMb: 512,
    }),
  };
}

describe("GuiSessionProvisioningWorker", () => {
  it("sweeps expired allocations before claiming anything else", async () => {
    const { worker, repository } = setup();
    await worker.processNext();
    expect(repository.reapExpiredActive).toHaveBeenCalled();
  });

  it("provisions a claimed session with the worker's own resource limits", async () => {
    const { worker, repository, containerAdmin } = setup();
    await expect(worker.processNext()).resolves.toBe("provisioned");
    expect(containerAdmin.provision).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: task.sessionId,
        mainClassName: task.mainClassName,
        cpuLimit: "1000m",
        memoryLimitMb: 512,
      }),
    );
    expect(repository.completeProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({ task, provisioned }),
    );
  });

  it("fails provisioning without removing anything when the container never started", async () => {
    const { worker, repository, containerAdmin } = setup();
    vi.mocked(containerAdmin.provision).mockRejectedValue(
      new Error("image pull failed"),
    );
    await worker.processNext();
    expect(repository.failProvisioning).toHaveBeenCalledWith(
      task.sessionId,
      "image pull failed",
    );
    expect(containerAdmin.remove).not.toHaveBeenCalled();
  });

  it("removes the container and persists cleanup completion", async () => {
    const { worker, repository, containerAdmin } = setup();
    const cleanup = {
      id: "00000000-0000-4000-8000-000000000052",
      sessionId: task.sessionId,
      containerRef: provisioned.containerRef,
      internalHost: provisioned.internalHost,
      websockifyPort: provisioned.websockifyPort,
    };
    vi.mocked(repository.claimCleanup).mockResolvedValue(cleanup);
    await expect(worker.processNext()).resolves.toBe("cleanup");
    expect(containerAdmin.remove).toHaveBeenCalledWith(cleanup);
    expect(repository.completeCleanup).toHaveBeenCalledWith(cleanup.id);
    expect(repository.claimRequested).not.toHaveBeenCalled();
  });

  it("records a cleanup failure without throwing", async () => {
    const { worker, repository, containerAdmin } = setup();
    const cleanup = {
      id: "00000000-0000-4000-8000-000000000052",
      sessionId: task.sessionId,
      containerRef: provisioned.containerRef,
      internalHost: provisioned.internalHost,
      websockifyPort: provisioned.websockifyPort,
    };
    vi.mocked(repository.claimCleanup).mockResolvedValue(cleanup);
    vi.mocked(containerAdmin.remove).mockRejectedValue(
      new Error("container already gone"),
    );
    await expect(worker.processNext()).resolves.toBe("cleanup");
    expect(repository.failCleanup).toHaveBeenCalledWith(
      cleanup,
      "container already gone",
    );
    expect(repository.completeCleanup).not.toHaveBeenCalled();
  });

  it("reports idle when nothing is claimable", async () => {
    const { worker, repository } = setup();
    vi.mocked(repository.claimRequested).mockResolvedValue(null);
    await expect(worker.processNext()).resolves.toBe("idle");
  });
});
