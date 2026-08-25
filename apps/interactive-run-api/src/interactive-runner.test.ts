import { PassThrough } from "node:stream";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Docker from "dockerode";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  const createdBaseDirs: string[] = [];
  afterEach(async () => {
    await Promise.all(
      createdBaseDirs
        .splice(0)
        .map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("binds the HOST-visible path, not this process's own container path, when running Docker-outside-of-Docker", async () => {
    // tmpDir must be real — the manager actually mkdtemp/writeFile's into
    // it. hostTmpDir does not need to exist — nothing in start() reads or
    // writes through it, it only appears in the Binds string, exactly the
    // string dockerode would hand to the HOST daemon in production.
    const tmpDir = await mkdtemp(join(tmpdir(), "sqweb-runner-test-"));
    createdBaseDirs.push(tmpDir);
    const hostTmpDir = "/host/interactive-run-tmp";

    const attached = new PassThrough();
    const container = {
      attach: vi.fn(async () => attached),
      start: vi.fn(async () => undefined),
      wait: vi.fn(async () => {
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
      { imageTag: "sqweb/code-runtime:test", memoryLimitMb: 512, cpuLimit: "1000m", tmpDir, hostTmpDir },
      docker,
    );

    const session = await manager.start({
      language: "python",
      sourceCode: "print('hi')",
      onStdout: vi.fn(),
      onStderr: vi.fn(),
    });

    const [[createArgs]] = createContainer.mock.calls;
    const [bind] = (
      createArgs as { HostConfig: { Binds: string[] } }
    ).HostConfig.Binds;
    expect(bind).toMatch(/^\/host\/interactive-run-tmp\/sqweb-interactive-run-.+:\/workspace\/src:ro$/);
    // ...and never the container-internal tmpDir this process actually
    // wrote the file into — that path means nothing to the host daemon.
    expect(bind.startsWith(tmpDir)).toBe(false);

    await expect(session.wait()).resolves.toBe(0);
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
