import { createServer, type AddressInfo } from "node:net";

import { afterEach, describe, expect, it, vi } from "vitest";

import { DockerGuiContainerAdmin } from "./docker-gui-container-admin";

const spec = {
  sessionId: "00000000-0000-4000-8000-000000000050",
  files: [{ path: "Main.java", content: "class Main {}" }],
  mainClassName: "Main",
  maxRuntimeSeconds: 600,
  cpuLimit: "1000m",
  memoryLimitMb: 512,
};

describe("DockerGuiContainerAdmin", () => {
  it("rejects a file name that could escape the workspace source directory", async () => {
    const createContainer = vi.fn();
    const admin = new DockerGuiContainerAdmin(
      { imageTag: "sqweb/gui-runtime:local", network: "sqweb-gui-sandbox" },
      { createContainer } as never,
    );
    await expect(
      admin.provision({
        ...spec,
        files: [{ path: "../../etc/passwd.java", content: "x" }],
      }),
    ).rejects.toThrow("UNSAFE_FILE_NAME");
    expect(createContainer).not.toHaveBeenCalled();
  });

  describe("with a real local listener standing in for the container's port", () => {
    let listener: ReturnType<typeof createServer> | undefined;

    afterEach(() => {
      listener?.close();
      listener = undefined;
    });

    async function listenOnEphemeralPort(): Promise<number> {
      listener = createServer();
      await new Promise<void>((resolve) => listener?.listen(0, "127.0.0.1", resolve));
      return (listener.address() as AddressInfo).port;
    }

    it("scopes the container to non-root, read-only, capability-dropped limits", async () => {
      // The reachability wait after start() makes a real TCP connection —
      // using an actual local listener (rather than mocking that private
      // step) exercises the same isReachable() code path the Phase 2 smoke
      // test already validated against a real container, without needing
      // to reach into DockerGuiContainerAdmin's internals.
      const port = await listenOnEphemeralPort();
      const inspect = vi.fn().mockResolvedValue({
        NetworkSettings: { Ports: { "6080/tcp": [{ HostPort: String(port) }] } },
      });
      const start = vi.fn().mockResolvedValue(undefined);
      const createContainer = vi.fn().mockResolvedValue({
        id: "container-abc",
        inspect,
        start,
      });
      const admin = new DockerGuiContainerAdmin(
        { imageTag: "sqweb/gui-runtime:local", network: "sqweb-gui-sandbox" },
        { createContainer } as never,
      );

      const result = await admin.provision(spec);

      expect(createContainer).toHaveBeenCalledWith(
        expect.objectContaining({
          Image: "sqweb/gui-runtime:local",
          User: "10001:10001",
          Env: ["MAIN_CLASS=Main"],
          HostConfig: expect.objectContaining({
            ReadonlyRootfs: true,
            CapDrop: ["ALL"],
            PidsLimit: 128,
            NetworkMode: "sqweb-gui-sandbox",
            Memory: 512 * 1024 * 1024,
            NanoCpus: 1_000_000_000,
          }),
        }),
      );
      expect(result).toEqual({
        allocationId: expect.any(String),
        containerRef: "container-abc",
        internalHost: "127.0.0.1",
        websockifyPort: port,
      });
    });

    it("removes a container it can't reach in time", async () => {
      const inspect = vi.fn().mockResolvedValue({
        NetworkSettings: { Ports: { "6080/tcp": [{ HostPort: "1" }] } },
      });
      const start = vi.fn().mockResolvedValue(undefined);
      const remove = vi.fn().mockResolvedValue(undefined);
      const createContainer = vi.fn().mockResolvedValue({
        id: "container-unreachable",
        inspect,
        start,
        remove,
      });
      const admin = new DockerGuiContainerAdmin(
        { imageTag: "sqweb/gui-runtime:local", network: "sqweb-gui-sandbox" },
        { createContainer } as never,
      );
      await expect(admin.provision(spec)).rejects.toThrow(
        "GUI_CONTAINER_NOT_REACHABLE",
      );
      expect(remove).toHaveBeenCalledWith({ force: true });
    }, 15_000);
  });

  it("removes both the container and its bind-mounted source directory", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const stop = vi.fn().mockResolvedValue(undefined);
    const inspect = vi.fn().mockResolvedValue({
      Mounts: [{ Destination: "/workspace/src", Source: "/tmp/does-not-exist" }],
    });
    const getContainer = vi.fn().mockReturnValue({ inspect, stop, remove });
    const admin = new DockerGuiContainerAdmin(
      { imageTag: "sqweb/gui-runtime:local", network: "sqweb-gui-sandbox" },
      { getContainer } as never,
    );
    await admin.remove({
      id: "alloc-1",
      containerRef: "container-abc",
      internalHost: "127.0.0.1",
      websockifyPort: 54321,
    });
    expect(getContainer).toHaveBeenCalledWith("container-abc");
    expect(stop).toHaveBeenCalledWith({ t: 2 });
    expect(remove).toHaveBeenCalledWith({ force: true });
  });
});
