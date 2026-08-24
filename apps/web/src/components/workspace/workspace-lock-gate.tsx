"use client";

import { workspaceAccessSchema, type WorkspaceKind } from "@sqweb/contracts";
import { Lock } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

export function WorkspaceLockGate({
  workspace,
  children,
}: Readonly<{ workspace: WorkspaceKind; children: ReactNode }>) {
  const { authorizedFetch } = useAuth();
  const [locked, setLocked] = useState<boolean | null>(null);

  const checkAccess = useCallback(async () => {
    try {
      const response = await authorizedFetch("/v1/me/workspace-access");
      if (!response.ok)
        throw new Error("Workspace access could not be checked.");
      const access = workspaceAccessSchema.parse(await response.json());
      setLocked(access.lockedWorkspaces.includes(workspace));
    } catch {
      // Fail open — the server-side gate on every workspace route is the
      // real enforcement boundary, so a transient fetch error here should
      // never block a legitimately-unlocked student.
      setLocked(false);
    }
  }, [authorizedFetch, workspace]);

  useEffect(() => {
    const timer = window.setTimeout(() => void checkAccess(), 0);
    return () => window.clearTimeout(timer);
  }, [checkAccess]);

  // Live-updates the overlay if an admin locks/unlocks this workspace while
  // the student already has the page open — no manual refresh needed.
  usePolling(() => void checkAccess(), DEFAULT_POLL_INTERVAL_MS);

  if (locked === null) {
    return (
      <div className="grid min-h-32 place-items-center">
        <Spinner size={20} />
      </div>
    );
  }

  if (!locked) return <>{children}</>;

  return (
    <div className="relative">
      <div
        aria-hidden="true"
        className="pointer-events-none blur-sm select-none"
      >
        {children}
      </div>
      <div className="absolute inset-0 grid place-items-center p-4">
        <div className="border-structural bg-elevated rounded-panel max-w-sm border p-6 text-center shadow-2xl">
          <span className="rounded-control border-divider bg-surface text-action-soft mx-auto mb-3 grid size-10 place-items-center border">
            <Lock aria-hidden="true" size={18} strokeWidth={1.7} />
          </span>
          <p className="text-action-soft text-xs font-semibold tracking-[0.12em] uppercase">
            Workspace locked
          </p>
          <h2 className="font-heading text-ink-primary mt-2 text-lg font-semibold">
            This workspace isn&apos;t available right now
          </h2>
          <p className="text-ink-muted mt-2 text-sm leading-6">
            An administrator has restricted access to this section. Contact an
            administrator if you believe this is incorrect.
          </p>
        </div>
      </div>
    </div>
  );
}
