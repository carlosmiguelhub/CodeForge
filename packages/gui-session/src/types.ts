import type { GuiSessionState } from "@sqweb/contracts";

export interface GuiSessionFile {
  // A flat filename ("Main.java") — no directories in V1, see plan
  // section 8, item 1.
  readonly path: string;
  readonly content: string;
}

export interface GuiContainerSpec {
  readonly sessionId: string;
  readonly files: readonly GuiSessionFile[];
  readonly mainClassName: string;
  readonly maxRuntimeSeconds: number;
  readonly cpuLimit: string; // e.g. "1000m"
  readonly memoryLimitMb: number;
}

export interface ProvisionedGuiContainer {
  readonly allocationId: string;
  readonly containerRef: string; // pod name (k8s) or container id (docker)
  readonly internalHost: string; // Service DNS (k8s) or "127.0.0.1" (docker)
  readonly websockifyPort: number;
}

export interface GuiContainerAllocation {
  readonly id: string;
  readonly containerRef: string;
  readonly internalHost: string;
  readonly websockifyPort: number;
}

export interface GuiContainerAdmin {
  provision(spec: GuiContainerSpec): Promise<ProvisionedGuiContainer>;
  remove(allocation: GuiContainerAllocation): Promise<void>;
  // TCP-probes the internal websockify port — used both for the
  // post-provision readiness wait and (indirectly, via the repository's
  // safety-net sweep) reap checks.
  isReachable(allocation: GuiContainerAllocation): Promise<boolean>;
}

export interface GuiSessionTask {
  readonly sessionId: string;
  readonly institutionId: string;
  readonly ownerId: string;
  readonly files: readonly GuiSessionFile[];
  readonly mainClassName: string;
  readonly maxRuntimeSeconds: number;
}

export interface GuiSessionCleanupTask extends GuiContainerAllocation {
  readonly sessionId: string;
}

// --- HTTP-facing session access (platform-api's GuiSessionService) ---
// Deliberately separate from GuiSessionProvisioningRepository above: that
// one drives the provisioning worker's claim/complete/fail lifecycle, this
// one answers "create a session row" / "what's its current state" /
// "mark it stopped" for the request/response side.

export interface GuiSessionRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly state: GuiSessionState;
  readonly mainClassName: string;
  readonly maxRuntimeSeconds: number;
  readonly failureCode: string | null;
  readonly startedAt: string | null;
  readonly endsAt: string | null;
  readonly createdAt: string;
}

export interface GuiSessionAccessRepository {
  create(input: {
    id: string;
    institutionId: string;
    ownerId: string;
    mainClassName: string;
    maxRuntimeSeconds: number;
  }): Promise<void>;
  get(sessionId: string): Promise<GuiSessionRecord | null>;
  markStopped(sessionId: string): Promise<void>;
}

export interface GuiSessionProvisioningRepository {
  claimRequested(): Promise<GuiSessionTask | null>;
  claimCleanup(): Promise<GuiSessionCleanupTask | null>;
  completeProvisioning(input: {
    task: GuiSessionTask;
    provisioned: ProvisionedGuiContainer;
    poolInstanceId: string;
  }): Promise<void>;
  failProvisioning(sessionId: string, failureCode: string): Promise<void>;
  completeCleanup(allocationId: string): Promise<void>;
  failCleanup(task: GuiSessionCleanupTask, failureCode: string): Promise<void>;
  // Safety-net sweep: marks any allocation still 'active' whose session
  // has passed its ends_at (and flips that session to 'expired') as
  // 'pending', so the next claimCleanup() call reaps it. Returns the
  // number of rows swept, purely for the caller's own logging.
  reapExpiredActive(): Promise<number>;
}
