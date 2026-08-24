import { connect } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type {
  GuiContainerAdmin,
  GuiContainerAllocation,
  GuiContainerSpec,
  ProvisionedGuiContainer,
} from "@sqweb/gui-session";
import Docker from "dockerode";

const safeFileName = /^[A-Za-z0-9_]+\.java$/;

function cpuLimitToNanoCpus(cpuLimit: string): number {
  const millis = cpuLimit.endsWith("m")
    ? Number(cpuLimit.slice(0, -1))
    : Number(cpuLimit) * 1000;
  return Math.round((millis / 1000) * 1_000_000_000);
}

export interface DockerGuiContainerAdminOptions {
  readonly imageTag: string;
  readonly network: string;
}

export class DockerGuiContainerAdmin implements GuiContainerAdmin {
  constructor(
    private readonly options: DockerGuiContainerAdminOptions,
    private readonly docker: Docker = new Docker(),
  ) {}

  async provision(spec: GuiContainerSpec): Promise<ProvisionedGuiContainer> {
    for (const file of spec.files) {
      if (!safeFileName.test(file.path)) throw new Error("UNSAFE_FILE_NAME");
    }

    const allocationId = randomUUID();
    const sourceDir = await mkdtemp(
      join(tmpdir(), `sqweb-gui-${spec.sessionId}-`),
    );
    let container: Docker.Container | undefined;
    try {
      await Promise.all(
        spec.files.map((file) =>
          writeFile(join(sourceDir, file.path), file.content, "utf8"),
        ),
      );

      container = await this.docker.createContainer({
        Image: this.options.imageTag,
        Env: [`MAIN_CLASS=${spec.mainClassName}`],
        ExposedPorts: { "6080/tcp": {} },
        HostConfig: {
          Binds: [`${sourceDir}:/workspace/src:ro`],
          Memory: spec.memoryLimitMb * 1024 * 1024,
          NanoCpus: cpuLimitToNanoCpus(spec.cpuLimit),
          PidsLimit: 128,
          ReadonlyRootfs: true,
          Tmpfs: { "/tmp": "size=64m", "/home/student": "size=32m" },
          CapDrop: ["ALL"],
          NetworkMode: this.options.network,
          PortBindings: { "6080/tcp": [{ HostPort: "" }] },
        },
        User: "10001:10001",
      });
      await container.start();

      const inspected = await container.inspect();
      const hostPort =
        inspected.NetworkSettings.Ports["6080/tcp"]?.[0]?.HostPort;
      if (!hostPort) throw new Error("GUI_CONTAINER_PORT_NOT_BOUND");

      const allocation: GuiContainerAllocation = {
        id: allocationId,
        containerRef: container.id,
        internalHost: "127.0.0.1",
        websockifyPort: Number(hostPort),
      };
      const reachable = await this.waitUntilReachable(allocation, 8000);
      if (!reachable) throw new Error("GUI_CONTAINER_NOT_REACHABLE");

      return {
        allocationId,
        containerRef: allocation.containerRef,
        internalHost: allocation.internalHost,
        websockifyPort: allocation.websockifyPort,
      };
    } catch (error) {
      if (container)
        await container.remove({ force: true }).catch(() => undefined);
      await rm(sourceDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw error;
    }
  }

  async remove(allocation: GuiContainerAllocation): Promise<void> {
    const container = this.docker.getContainer(allocation.containerRef);
    let sourceDir: string | undefined;
    try {
      const inspected = await container.inspect();
      sourceDir = inspected.Mounts.find(
        (mount) => mount.Destination === "/workspace/src",
      )?.Source;
    } catch {
      // Container is already gone — nothing to inspect, and the stop/remove
      // calls below are already no-op-safe against that.
    }
    await container.stop({ t: 2 }).catch(() => undefined);
    await container.remove({ force: true }).catch(() => undefined);
    if (sourceDir)
      await rm(sourceDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
  }

  async isReachable(allocation: GuiContainerAllocation): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = connect({
        host: allocation.internalHost,
        port: allocation.websockifyPort,
        timeout: 1000,
      });
      socket.once("connect", () => {
        socket.destroy();
        resolve(true);
      });
      socket.once("error", () => resolve(false));
      socket.once("timeout", () => {
        socket.destroy();
        resolve(false);
      });
    });
  }

  private async waitUntilReachable(
    allocation: GuiContainerAllocation,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.isReachable(allocation)) return true;
      await delay(200);
    }
    return false;
  }
}
