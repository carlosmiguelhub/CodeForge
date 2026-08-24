import { PassThrough } from "node:stream";

import Docker from "dockerode";
import { describe, expect, it, vi } from "vitest";

import { DockerInteractiveRunManager } from "./interactive-runner";

describe("DockerInteractiveRunManager", () => {
  it("attaches before start and applies the sandbox limits", async () => {
    const order: string[] = [];
    const attached = new PassThrough();
    let release!: () => void;
    const exited = new Promise<void>((resolve) => (release = resolve));
    const container = {
      id: "container-1",
      attach: vi.fn(async () => {
        order.push("attach");
        return attached;
      }),
      start: vi.fn(async () => {
        order.push("start");
      }),
      wait: vi.fn(async () => {
        await exited;
        attached.end();
        return { StatusCode: 0 };
      }),
      stop: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const createContainer = vi.fn(async () => container);
    const docker = {
      createContainer,
      modem: { demuxStream: vi.fn() },
    } as unknown as Docker;
    const manager = new DockerInteractiveRunManager(
      {
        imageTag: "sqweb/code-runtime:test",
        memoryLimitMb: 512,
        cpuLimit: "1000m",
      },
      docker,
    );

    const session = await manager.start({
      language: "c",
      sourceCode: "int main(void) { return 0; }",
      onStdout: vi.fn(),
      onStderr: vi.fn(),
    });
    expect(order).toEqual(["attach", "start"]);
    expect(createContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        Image: "sqweb/code-runtime:test",
        OpenStdin: true,
        User: "10001:10001",
        Labels: { "sqweb.interactive-run": "true" },
        HostConfig: expect.objectContaining({
          NetworkMode: "none",
          ReadonlyRootfs: true,
          CapDrop: ["ALL"],
          PidsLimit: 128,
          Memory: 512 * 1024 * 1024,
          NanoCpus: 1_000_000_000,
        }),
      }),
    );

    release();
    await expect(session.wait()).resolves.toBe(0);
    expect(container.remove).toHaveBeenCalledWith({ force: true });
  });

  it("removes labeled containers older than the orphan cutoff", async () => {
    const remove = vi.fn(async () => undefined);
    const now = Math.floor(Date.now() / 1000);
    const docker = {
      listContainers: vi.fn(async () => [
        { Id: "old", Created: now - 1_000 },
        { Id: "fresh", Created: now },
      ]),
      getContainer: vi.fn(() => ({ remove })),
    } as unknown as Docker;
    const manager = new DockerInteractiveRunManager(
      { imageTag: "image", memoryLimitMb: 512, cpuLimit: "1000m" },
      docker,
    );

    await expect(manager.sweepOrphans(600)).resolves.toBe(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });
});
