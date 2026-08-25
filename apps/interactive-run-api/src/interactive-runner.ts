import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  basename,
  isAbsolute,
  join,
  posix,
  relative,
  resolve,
} from "node:path";

import type { CodeLanguage } from "@sqweb/contracts";
import Docker from "dockerode";

const entryFileByLanguage: Readonly<Record<CodeLanguage, string>> = {
  python: "main.py",
  java: "Main.java",
  cpp: "main.cpp",
  javascript: "main.js",
  c: "main.c",
};

function cpuLimitToNanoCpus(cpuLimit: string): number {
  const millis = cpuLimit.endsWith("m")
    ? Number(cpuLimit.slice(0, -1))
    : Number(cpuLimit) * 1000;
  if (!Number.isFinite(millis) || millis <= 0)
    throw new Error("INVALID_CPU_LIMIT");
  return Math.round((millis / 1000) * 1_000_000_000);
}

export interface InteractiveRunSpec {
  readonly language: CodeLanguage;
  readonly sourceCode: string;
  readonly onStdout: (data: string) => void;
  readonly onStderr: (data: string) => void;
}

export interface InteractiveRunSession {
  writeStdin(data: string): void;
  wait(): Promise<number>;
  stop(): Promise<void>;
}

export interface InteractiveRunManager {
  start(spec: InteractiveRunSpec): Promise<InteractiveRunSession>;
  sweepOrphans(maxAgeSeconds: number): Promise<number>;
}

export interface DockerInteractiveRunManagerOptions {
  readonly imageTag: string;
  readonly memoryLimitMb: number;
  readonly cpuLimit: string;
  // Base directory (as seen by THIS process's own filesystem) under which
  // per-run source directories are created. Defaults to the OS temp dir —
  // correct for local dev, where this process runs directly on the host.
  readonly tmpDir?: string;
  // The HOST's view of that same directory, used only when constructing a
  // spawned container's Binds source. In production this process itself
  // runs in a container that talks to the HOST's Docker daemon over a
  // mounted socket (Docker-outside-of-Docker) — dockerode's bind-mount
  // source paths are resolved by that HOST daemon against the HOST
  // filesystem, not this container's own, so a plain tmpDir path here
  // would silently bind-mount an empty directory into the spawned
  // container instead of the real source file. Defaults to tmpDir itself,
  // correct whenever this process is NOT itself containerized.
  readonly hostTmpDir?: string;
}

export class DockerInteractiveRunManager implements InteractiveRunManager {
  constructor(
    private readonly options: DockerInteractiveRunManagerOptions,
    private readonly docker: Docker = new Docker(),
  ) {}

  // Swaps the tmpDir prefix for hostTmpDir, only when both are configured
  // and differ — a no-op (identity) whenever this process isn't itself
  // containerized, which is the only case where the two paths could ever
  // legitimately diverge.
  private hostPathFor(containerPath: string): string {
    const { tmpDir, hostTmpDir } = this.options;
    if (!hostTmpDir || !tmpDir || hostTmpDir === tmpDir) return containerPath;
    // hostTmpDir names a path on the HOST daemon's filesystem, which is
    // always Linux in this deployment regardless of what OS this process
    // itself runs under (e.g. a Windows machine in local dev) — posix.join,
    // not the platform-native join, so the result is never backslashed.
    return posix.join(hostTmpDir, relative(tmpDir, containerPath));
  }

  async start(spec: InteractiveRunSpec): Promise<InteractiveRunSession> {
    const baseDir = this.options.tmpDir ?? tmpdir();
    const sourceDir = await mkdtemp(join(baseDir, "sqweb-interactive-run-"));
    let container: Docker.Container | undefined;
    let attached: NodeJS.ReadWriteStream | undefined;
    try {
      await writeFile(
        join(sourceDir, entryFileByLanguage[spec.language]),
        spec.sourceCode,
        "utf8",
      );
      container = await this.docker.createContainer({
        Image: this.options.imageTag,
        Env: [`LANGUAGE=${spec.language}`],
        OpenStdin: true,
        StdinOnce: false,
        Tty: false,
        Labels: {
          "sqweb.interactive-run": "true",
        },
        HostConfig: {
          Binds: [`${this.hostPathFor(sourceDir)}:/workspace/src:ro`],
          Memory: this.options.memoryLimitMb * 1024 * 1024,
          NanoCpus: cpuLimitToNanoCpus(this.options.cpuLimit),
          PidsLimit: 128,
          ReadonlyRootfs: true,
          // Native C/C++ output executes from /tmp, so that one bounded
          // tmpfs must explicitly allow exec. The image root stays read-only.
          Tmpfs: {
            "/tmp": "rw,exec,nosuid,size=64m,mode=1777",
            "/home/student": "rw,nosuid,noexec,size=32m,mode=700",
          },
          CapDrop: ["ALL"],
          // Interactive compiler runs never need network access. `none` is
          // stronger than the GUI runtime's bridge and works on Docker Desktop.
          NetworkMode: "none",
        },
        User: "10001:10001",
      });

      // Attach before start so a fast compile failure or first prompt cannot
      // be emitted before stdout/stderr listeners exist.
      const attachQuery = {
        stream: true,
        stdin: true,
        stdout: true,
        stderr: true,
        hijack: true,
      };
      // docker-modem serializes POST options into a request body which becomes
      // stdin after the HTTP upgrade. Make that body deterministic, terminate
      // it as one line, and let entrypoint.sh consume that single handshake
      // line before launching student code.
      // Docker Desktop can defer the attach response until the container has
      // started. Initiate attach first, then allow start to proceed in
      // parallel. The entrypoint blocks on the unterminated handshake body,
      // so student code still cannot run before the stream is ready.
      const [attachStream] = await Promise.all([
        container.attach({
          ...attachQuery,
          _query: attachQuery,
          _body: { "sqweb-handshake": true },
        } as Docker.ContainerAttachOptions),
        container.start(),
      ]);
      attached = attachStream;
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      stdout.on("data", (chunk: Buffer) =>
        spec.onStdout(chunk.toString("utf8")),
      );
      stderr.on("data", (chunk: Buffer) =>
        spec.onStderr(chunk.toString("utf8")),
      );
      this.docker.modem.demuxStream(attached, stdout, stderr);
      attached.write("\n");

      let streamEnded = false;
      const streamDone = new Promise<void>((resolve) => {
        const finish = () => {
          if (streamEnded) return;
          streamEnded = true;
          resolve();
        };
        attached!.once("end", finish);
        attached!.once("close", finish);
        attached!.once("error", finish);
      });

      let stopRequested = false;
      let cleanupPromise: Promise<void> | undefined;
      const cleanup = (stopFirst: boolean) => {
        cleanupPromise ??= (async () => {
          if (stopFirst) await container!.stop({ t: 2 }).catch(() => undefined);
          if ("destroy" in attached! && typeof attached!.destroy === "function")
            attached!.destroy();
          await container!.remove({ force: true }).catch(() => undefined);
          await rm(sourceDir, { recursive: true, force: true }).catch(
            () => undefined,
          );
        })();
        return cleanupPromise;
      };

      const waitPromise = container
        .wait()
        .then((result) => result.StatusCode)
        .catch((error: unknown) => {
          if (stopRequested) return 137;
          throw error;
        })
        .then(async (exitCode) => {
          await Promise.race([streamDone, delay(1_000)]);
          await cleanup(false);
          return exitCode;
        });

      return {
        writeStdin(data) {
          if (!attached!.writable) throw new Error("STDIN_CLOSED");
          attached!.write(data);
        },
        wait: () => waitPromise,
        async stop() {
          stopRequested = true;
          await cleanup(true);
        },
      };
    } catch (error) {
      if (
        attached &&
        "destroy" in attached &&
        typeof attached.destroy === "function"
      )
        attached.destroy();
      if (container)
        await container.remove({ force: true }).catch(() => undefined);
      await rm(sourceDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
      throw error;
    }
  }

  async sweepOrphans(maxAgeSeconds: number): Promise<number> {
    const cutoff = Math.floor(Date.now() / 1000) - maxAgeSeconds;
    const containers = await this.docker.listContainers({
      all: true,
      filters: { label: ["sqweb.interactive-run=true"] },
    });
    const stale = containers.filter((container) => container.Created < cutoff);
    await Promise.all(
      stale.map(async (container) => {
        const handle = this.docker.getContainer(container.Id);
        let sourceDir: string | undefined;
        try {
          const inspected = await handle.inspect();
          sourceDir = inspected.Mounts.find(
            (mount) => mount.Destination === "/workspace/src",
          )?.Source;
        } catch {
          // The container may disappear between list and inspect.
        }
        await handle.remove({ force: true }).catch(() => undefined);
        // sourceDir here is whatever was actually passed as the Binds
        // source — the HOST-visible path when hostTmpDir is configured —
        // but this process can only rm() a path within its OWN
        // filesystem, so translate it back before deleting.
        if (sourceDir && this.isOwnedTempDirectory(sourceDir))
          await rm(this.containerPathFor(sourceDir), {
            recursive: true,
            force: true,
          }).catch(() => undefined);
      }),
    );
    return stale.length;
  }

  // Inverse of hostPathFor — same no-op-when-unconfigured behavior. hostPath
  // is always POSIX (see hostPathFor's comment), so posix.relative here too.
  private containerPathFor(hostPath: string): string {
    const { tmpDir, hostTmpDir } = this.options;
    if (!hostTmpDir || !tmpDir || hostTmpDir === tmpDir) return hostPath;
    return join(tmpDir, posix.relative(hostTmpDir, hostPath));
  }

  private isOwnedTempDirectory(path: string): boolean {
    const tempRoot = resolve(this.options.hostTmpDir ?? this.options.tmpDir ?? tmpdir());
    const candidate = resolve(path);
    const pathWithinTemp = relative(tempRoot, candidate);
    return (
      pathWithinTemp !== "" &&
      !pathWithinTemp.startsWith("..") &&
      !isAbsolute(pathWithinTemp) &&
      basename(candidate).startsWith("sqweb-interactive-run-")
    );
  }
}
