import { describe, expect, it, vi } from "vitest";

import type {
  ProvisionedWorkspace,
  WorkspaceDatabaseAdmin,
  WorkspaceProvisioningRepository,
  WorkspaceSecretStore,
} from "./types";
import { ProvisioningWorker } from "./provisioning-worker";

const task = {
  workspaceId: "00000000-0000-4000-8000-000000000040",
  institutionId: "00000000-0000-4000-8000-000000000001",
  actorId: "00000000-0000-4000-8000-000000000010",
  quotaBytes: 100 * 1024 * 1024,
  templateVersionId: null,
};
const provisioned: ProvisionedWorkspace = {
  allocationId: "00000000-0000-4000-8000-000000000041",
  databaseName: "sqw_test_database",
  databaseUser: "sqw_test_user",
  credential: {
    host: "workspace-mysql",
    port: 3306,
    database: "sqw_test_database",
    username: "sqw_test_user",
    password: "not-a-real-password",
  },
};

function setup() {
  const repository: WorkspaceProvisioningRepository = {
    claimRequested: vi.fn().mockResolvedValue(task),
    claimReset: vi.fn().mockResolvedValue(null),
    claimCleanup: vi.fn().mockResolvedValue(null),
    completeProvisioning: vi.fn().mockResolvedValue(undefined),
    completeReset: vi.fn().mockResolvedValue(undefined),
    failProvisioning: vi.fn().mockResolvedValue(undefined),
    failReset: vi.fn().mockResolvedValue(undefined),
    completeCleanup: vi.fn().mockResolvedValue(undefined),
    failCleanup: vi.fn().mockResolvedValue(undefined),
  };
  const databaseAdmin: WorkspaceDatabaseAdmin = {
    provision: vi.fn().mockResolvedValue(provisioned),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const secrets: WorkspaceSecretStore = {
    put: vi.fn().mockResolvedValue("secret://workspace"),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  return {
    repository,
    databaseAdmin,
    secrets,
    worker: new ProvisioningWorker({
      repository,
      databaseAdmin,
      secrets,
      poolInstanceId: "00000000-0000-4000-8000-000000000030",
    }),
  };
}

describe("ProvisioningWorker", () => {
  it("stores credentials before making a workspace ready", async () => {
    const { worker, repository, secrets } = setup();
    await expect(worker.processNext()).resolves.toBe("provisioned");
    expect(secrets.put).toHaveBeenCalledWith(
      task.workspaceId,
      provisioned.credential,
    );
    expect(repository.completeProvisioning).toHaveBeenCalledWith(
      expect.objectContaining({ secretRef: "secret://workspace", provisioned }),
    );
  });

  it("removes a newly provisioned database if metadata activation fails", async () => {
    const { worker, repository, databaseAdmin, secrets } = setup();
    vi.mocked(repository.completeProvisioning).mockRejectedValue(
      new Error("metadata unavailable"),
    );
    await worker.processNext();
    expect(databaseAdmin.remove).toHaveBeenCalledWith(
      expect.objectContaining({ databaseName: provisioned.databaseName }),
    );
    expect(secrets.remove).toHaveBeenCalledWith("secret://workspace");
    expect(repository.failProvisioning).toHaveBeenCalled();
  });

  it("activates a replacement before removing the old allocation", async () => {
    const { worker, repository, databaseAdmin, secrets } = setup();
    const previousAllocation = {
      id: "00000000-0000-4000-8000-000000000042",
      databaseName: "sqw_previous",
      databaseUser: "sqw_previous",
      credentialSecretRef: "secret://previous",
    };
    vi.mocked(repository.claimReset).mockResolvedValue({
      ...task,
      resetId: "00000000-0000-4000-8000-000000000043",
      previousAllocation,
    });
    await expect(worker.processNext()).resolves.toBe("reset");
    expect(repository.completeReset).toHaveBeenCalled();
    expect(databaseAdmin.remove).not.toHaveBeenCalledWith(previousAllocation);
    expect(secrets.remove).not.toHaveBeenCalledWith("secret://previous");
  });

  it("persists cleanup completion for a retired allocation", async () => {
    const { worker, repository, databaseAdmin, secrets } = setup();
    const cleanup = {
      id: "00000000-0000-4000-8000-000000000042",
      workspaceId: task.workspaceId,
      institutionId: task.institutionId,
      actorId: task.actorId,
      databaseName: "sqw_previous",
      databaseUser: "sqw_previous",
      credentialSecretRef: "secret://previous",
    };
    vi.mocked(repository.claimCleanup).mockResolvedValue(cleanup);
    await expect(worker.processNext()).resolves.toBe("cleanup");
    expect(databaseAdmin.remove).toHaveBeenCalledWith(cleanup);
    expect(secrets.remove).toHaveBeenCalledWith(cleanup.credentialSecretRef);
    expect(repository.completeCleanup).toHaveBeenCalledWith(cleanup.id);
  });

  it("keeps the old allocation when replacement provisioning fails", async () => {
    const { worker, repository, databaseAdmin, secrets } = setup();
    const previousAllocation = {
      id: "00000000-0000-4000-8000-000000000042",
      databaseName: "sqw_previous",
      databaseUser: "sqw_previous",
      credentialSecretRef: "secret://previous",
    };
    vi.mocked(repository.claimReset).mockResolvedValue({
      ...task,
      resetId: "00000000-0000-4000-8000-000000000043",
      previousAllocation,
    });
    vi.mocked(databaseAdmin.provision).mockRejectedValue(new Error("capacity"));
    await worker.processNext();
    expect(repository.failReset).toHaveBeenCalled();
    expect(databaseAdmin.remove).not.toHaveBeenCalledWith(previousAllocation);
    expect(secrets.remove).not.toHaveBeenCalledWith("secret://previous");
  });
});
