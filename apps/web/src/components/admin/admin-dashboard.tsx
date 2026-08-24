"use client";

import { adminDashboardStatsSchema, type AdminDashboardStats } from "@sqweb/contracts";
import { ClipboardList, ShieldCheck, UserPlus, Users } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";
import { WorkspaceUsageCard } from "./workspace-usage-card";

export function AdminDashboard() {
  const { authorizedFetch } = useAuth();
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);
  const [status, setStatus] = useState("Loading dashboard…");

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch("/v1/admin/dashboard", {}, true);
      if (!response.ok) throw new Error("The dashboard could not be loaded.");
      const parsed = adminDashboardStatsSchema.parse(await response.json());
      setStats(parsed);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The dashboard could not be loaded.",
      );
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Live-reflects new activity without a manual refresh.
  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  if (!stats) {
    return (
      <p role="status" aria-live="polite" className="text-ink-muted text-xs">
        {status}
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={Users} label="Total users" value={stats.totalUsers} />
        <StatTile
          icon={ShieldCheck}
          label="Active"
          value={stats.usersByStatus.active}
        />
        <StatTile
          icon={ClipboardList}
          label="Pending approval"
          value={stats.usersByStatus.pending_approval}
        />
        <StatTile
          icon={UserPlus}
          label="Teachers"
          value={stats.usersByRole.teacher}
        />
      </div>

      <section aria-labelledby="workspace-usage-title">
        <h3
          id="workspace-usage-title"
          className="font-heading text-ink-primary text-base font-semibold"
        >
          Workspace usage
        </h3>
        <p className="text-ink-muted mt-0.5 text-xs">
          Total actions and the last {stats.workspaceUsage[0]?.dailyCounts.length ?? 14} days of activity, per workspace
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {stats.workspaceUsage.map((stat) => (
            <WorkspaceUsageCard key={stat.workspace} stat={stat} />
          ))}
        </div>
      </section>
    </div>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: Readonly<{ icon: typeof Users; label: string; value: number }>) {
  return (
    <div className="rounded-panel border-structural bg-surface flex items-center gap-3 border p-4">
      <span className="rounded-control border-divider bg-panel text-info grid size-10 shrink-0 place-items-center border">
        <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
      </span>
      <div className="min-w-0">
        <p className="text-ink-primary text-lg font-semibold">{value}</p>
        <p className="text-ink-muted text-xs">{label}</p>
      </div>
    </div>
  );
}

