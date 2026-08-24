"use client";

import {
  type AllocationCleanupState,
  guiSessionAdminListResponseSchema,
  type GuiSessionAdminRecord,
  guiSessionOverviewSchema,
  type GuiSessionOverview,
  type GuiSessionState,
  infrastructureOverviewSchema,
  type InfrastructureOverview,
  type PoolInstanceSummary,
  workspaceAllocationListResponseSchema,
  type WorkspaceAllocationRecord,
} from "@sqweb/contracts";
import {
  AlertTriangle,
  AppWindow,
  ChevronLeft,
  ChevronRight,
  Clock,
  Database,
  Search,
  Server,
  ServerCog,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

const PAGE_SIZE = 20;

const poolStateTone: Record<PoolInstanceSummary["state"], string> = {
  active: "text-success",
  draining: "text-warning",
  offline: "text-ink-disabled",
};

const cleanupStateTone: Record<AllocationCleanupState, string> = {
  active: "text-success",
  pending: "text-warning",
  cleaning: "text-warning",
  complete: "text-ink-muted",
  failed: "text-danger",
};

const guiSessionStateTone: Record<GuiSessionState, string> = {
  requested: "text-ink-muted",
  provisioning: "text-warning",
  running: "text-success",
  stopped: "text-ink-muted",
  failed: "text-danger",
  expired: "text-ink-disabled",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function InfrastructureView() {
  return (
    <div className="space-y-6">
      <OverviewSection />
      <AllocationsSection />
      <GuiSessionOverviewSection />
      <GuiSessionsSection />
    </div>
  );
}

function OverviewSection() {
  const { authorizedFetch } = useAuth();
  const [overview, setOverview] = useState<InfrastructureOverview | null>(null);
  const [status, setStatus] = useState("Loading infrastructure overview…");

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(
        "/v1/admin/infrastructure",
        {},
        true,
      );
      if (!response.ok)
        throw new Error("The infrastructure overview could not be loaded.");
      const parsed = infrastructureOverviewSchema.parse(await response.json());
      setOverview(parsed);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The infrastructure overview could not be loaded.",
      );
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  if (!overview) {
    return (
      <p role="status" aria-live="polite" className="text-ink-muted text-xs">
        {status}
      </p>
    );
  }

  const totalDatabases = overview.poolInstances.reduce(
    (sum, instance) => sum + instance.databaseCount,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={Database}
          label="Provisioned databases"
          value={overview.activeAllocationCount}
        />
        <StatTile
          icon={Clock}
          label="Pending cleanup"
          value={overview.cleanupPendingCount}
        />
        <StatTile
          icon={AlertTriangle}
          label="Cleanup failures"
          value={overview.cleanupFailedCount}
        />
        <StatTile
          icon={AlertTriangle}
          label="Failed workspaces"
          value={overview.workspacesByState.failed}
        />
      </div>

      <section aria-labelledby="pool-instances-title">
        <h3
          id="pool-instances-title"
          className="font-heading text-ink-primary text-base font-semibold"
        >
          Pool instances
        </h3>
        <p className="text-ink-muted mt-0.5 text-xs">
          The MySQL server instances student databases are provisioned onto ·{" "}
          {totalDatabases} database{totalDatabases === 1 ? "" : "s"} total
        </p>
        {overview.poolInstances.length === 0 ? (
          <p className="text-ink-muted mt-3 text-xs">
            No pool instances are registered.
          </p>
        ) : (
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview.poolInstances.map((instance) => (
              <div
                key={instance.id}
                className="rounded-panel border-structural bg-surface border p-4"
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-control border-divider bg-panel text-action-soft grid size-9 shrink-0 place-items-center border">
                    <Server aria-hidden="true" size={16} strokeWidth={1.7} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-ink-primary truncate text-sm font-medium">
                      {instance.environment} · {instance.region}
                    </p>
                    <p
                      className={`mt-0.5 text-xs font-medium ${poolStateTone[instance.state]}`}
                    >
                      {instance.state}
                    </p>
                  </div>
                </div>
                <p className="text-ink-muted mt-3 text-xs">
                  {instance.databaseCount} database
                  {instance.databaseCount === 1 ? "" : "s"} · registered{" "}
                  {formatDate(instance.createdAt)}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function AllocationsSection() {
  const { authorizedFetch } = useAuth();
  const [items, setItems] = useState<readonly WorkspaceAllocationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchTimeout = useRef<number | null>(null);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        if (search.trim()) query.set("search", search.trim());
        const response = await authorizedFetch(
          `/v1/admin/infrastructure/allocations?${query.toString()}`,
          {},
          true,
        );
        if (!response.ok)
          throw new Error("Provisioned databases could not be loaded.");
        const parsed = workspaceAllocationListResponseSchema.parse(
          await response.json(),
        );
        setItems(parsed.items);
        setTotal(parsed.total);
        setPage(parsed.page);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Provisioned databases could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [authorizedFetch, search],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(page), DEFAULT_POLL_INTERVAL_MS);

  function onSearchChange(value: string) {
    setSearch(value);
    if (searchTimeout.current !== null)
      window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      void load(1);
    }, 300);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-panel border-structural bg-surface border">
      <div className="border-divider border-b px-4 py-3">
        <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
          Provisioned databases
        </h2>
        <p className="text-ink-muted mt-1 text-xs">
          Every per-student MySQL database allocation, most recently provisioned
          first.
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="border-structural bg-canvas rounded-control flex min-h-9 max-w-sm items-center gap-2 border px-2.5">
          <Search aria-hidden="true" size={14} className="text-ink-disabled" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by owner or database name…"
            aria-label="Search provisioned databases"
            className="text-ink-primary min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
          />
        </div>
      </div>

      {error ? (
        <div className="px-4 pb-3">
          <IdentityStatus tone="error">{error}</IdentityStatus>
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-40 place-items-center">
          <Spinner size={20} />
        </div>
      ) : items.length === 0 ? (
        <div className="grid min-h-32 place-items-center px-6 py-8 text-center">
          <div className="text-ink-muted flex flex-col items-center gap-2">
            <ServerCog aria-hidden="true" size={20} strokeWidth={1.7} />
            <p className="max-w-xs text-xs leading-5">
              No provisioned databases match this filter.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-ink-muted border-divider border-y text-[11px] uppercase">
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Database</th>
                <th className="px-4 py-2 font-medium">Pool</th>
                <th className="px-4 py-2 font-medium">Workspace</th>
                <th className="px-4 py-2 font-medium">Cleanup</th>
                <th className="px-4 py-2 font-medium">Allocated</th>
              </tr>
            </thead>
            <tbody className="divide-divider divide-y">
              {items.map((allocation) => (
                <tr key={allocation.id}>
                  <td className="px-4 py-2.5">
                    <p className="text-ink-primary text-xs font-medium">
                      {allocation.ownerDisplayName}
                    </p>
                    <p className="text-ink-muted text-xs">
                      {allocation.ownerEmail}
                    </p>
                  </td>
                  <td className="text-ink-secondary px-4 py-2.5 font-mono text-xs">
                    {allocation.databaseName}
                  </td>
                  <td className="text-ink-muted px-4 py-2.5 text-xs whitespace-nowrap">
                    {allocation.poolEnvironment} · {allocation.poolRegion}
                  </td>
                  <td className="text-ink-muted px-4 py-2.5 text-xs">
                    {allocation.workspaceState}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-xs font-medium ${cleanupStateTone[allocation.cleanupState]}`}
                  >
                    {allocation.cleanupState}
                    {allocation.cleanupState === "failed" &&
                    allocation.cleanupError
                      ? ` · ${allocation.cleanupError}`
                      : ""}
                  </td>
                  <td className="text-ink-muted px-4 py-2.5 text-xs whitespace-nowrap">
                    {formatDate(allocation.allocatedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > 0 ? (
        <div className="border-divider flex items-center justify-between border-t px-4 py-3">
          <p className="text-ink-muted text-xs">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
              aria-label="Previous page"
              className="border-structural text-ink-muted rounded-control grid size-8 place-items-center border disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" size={14} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => void load(page + 1)}
              aria-label="Next page"
              className="border-structural text-ink-muted rounded-control grid size-8 place-items-center border disabled:opacity-40"
            >
              <ChevronRight aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function GuiSessionOverviewSection() {
  const { authorizedFetch } = useAuth();
  const [overview, setOverview] = useState<GuiSessionOverview | null>(null);
  const [status, setStatus] = useState("Loading Java GUI session overview…");

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(
        "/v1/admin/gui-sessions/overview",
        {},
        true,
      );
      if (!response.ok)
        throw new Error("The Java GUI session overview could not be loaded.");
      const parsed = guiSessionOverviewSchema.parse(await response.json());
      setOverview(parsed);
    } catch (error) {
      setStatus(
        error instanceof Error
          ? error.message
          : "The Java GUI session overview could not be loaded.",
      );
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  return (
    <section aria-labelledby="gui-session-overview-title">
      <h3
        id="gui-session-overview-title"
        className="font-heading text-ink-primary text-base font-semibold"
      >
        Java GUI sessions
      </h3>
      <p className="text-ink-muted mt-0.5 text-xs">
        Docker containers running student Swing/AWT programs — a separate
        resource from the MySQL pool above.
      </p>
      {!overview ? (
        <p
          role="status"
          aria-live="polite"
          className="text-ink-muted mt-3 text-xs"
        >
          {status}
        </p>
      ) : (
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            icon={AppWindow}
            label="Active containers"
            value={overview.activeContainerCount}
          />
          <StatTile
            icon={AppWindow}
            label="Running"
            value={overview.sessionsByState.running}
          />
          <StatTile
            icon={AlertTriangle}
            label="Failed"
            value={overview.sessionsByState.failed}
          />
          <StatTile
            icon={Clock}
            label="Expired"
            value={overview.sessionsByState.expired}
          />
        </div>
      )}
    </section>
  );
}

function GuiSessionsSection() {
  const { authorizedFetch } = useAuth();
  const [items, setItems] = useState<readonly GuiSessionAdminRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const searchTimeout = useRef<number | null>(null);

  const load = useCallback(
    async (targetPage: number) => {
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(PAGE_SIZE),
        });
        if (search.trim()) query.set("search", search.trim());
        const response = await authorizedFetch(
          `/v1/admin/gui-sessions?${query.toString()}`,
          {},
          true,
        );
        if (!response.ok)
          throw new Error("Java GUI sessions could not be loaded.");
        const parsed = guiSessionAdminListResponseSchema.parse(
          await response.json(),
        );
        setItems(parsed.items);
        setTotal(parsed.total);
        setPage(parsed.page);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Java GUI sessions could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [authorizedFetch, search],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(page), DEFAULT_POLL_INTERVAL_MS);

  function onSearchChange(value: string) {
    setSearch(value);
    if (searchTimeout.current !== null)
      window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      void load(1);
    }, 300);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-panel border-structural bg-surface border">
      <div className="border-divider border-b px-4 py-3">
        <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
          Java GUI session runs
        </h2>
        <p className="text-ink-muted mt-1 text-xs">
          Every Java GUI Workspace container run, most recently created first.
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="border-structural bg-canvas rounded-control flex min-h-9 max-w-sm items-center gap-2 border px-2.5">
          <Search aria-hidden="true" size={14} className="text-ink-disabled" />
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search by owner or class name…"
            aria-label="Search Java GUI sessions"
            className="text-ink-primary min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none"
          />
        </div>
      </div>

      {error ? (
        <div className="px-4 pb-3">
          <IdentityStatus tone="error">{error}</IdentityStatus>
        </div>
      ) : null}

      {loading ? (
        <div className="grid min-h-40 place-items-center">
          <Spinner size={20} />
        </div>
      ) : items.length === 0 ? (
        <div className="grid min-h-32 place-items-center px-6 py-8 text-center">
          <div className="text-ink-muted flex flex-col items-center gap-2">
            <AppWindow aria-hidden="true" size={20} strokeWidth={1.7} />
            <p className="max-w-xs text-xs leading-5">
              No Java GUI sessions match this filter.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-ink-muted border-divider border-y text-[11px] uppercase">
                <th className="px-4 py-2 font-medium">Owner</th>
                <th className="px-4 py-2 font-medium">Main class</th>
                <th className="px-4 py-2 font-medium">State</th>
                <th className="px-4 py-2 font-medium">Started</th>
                <th className="px-4 py-2 font-medium">Ends</th>
              </tr>
            </thead>
            <tbody className="divide-divider divide-y">
              {items.map((session) => (
                <tr key={session.id}>
                  <td className="px-4 py-2.5">
                    <p className="text-ink-primary text-xs font-medium">
                      {session.ownerDisplayName}
                    </p>
                    <p className="text-ink-muted text-xs">
                      {session.ownerEmail}
                    </p>
                  </td>
                  <td className="text-ink-secondary px-4 py-2.5 font-mono text-xs">
                    {session.mainClassName}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-xs font-medium ${guiSessionStateTone[session.state]}`}
                  >
                    {session.state}
                  </td>
                  <td className="text-ink-muted px-4 py-2.5 text-xs whitespace-nowrap">
                    {session.startedAt ? formatDate(session.startedAt) : "—"}
                  </td>
                  <td className="text-ink-muted px-4 py-2.5 text-xs whitespace-nowrap">
                    {session.endsAt ? formatDate(session.endsAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && total > 0 ? (
        <div className="border-divider flex items-center justify-between border-t px-4 py-3">
          <p className="text-ink-muted text-xs">
            Page {page} of {totalPages} · {total} total
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => void load(page - 1)}
              aria-label="Previous page"
              className="border-structural text-ink-muted rounded-control grid size-8 place-items-center border disabled:opacity-40"
            >
              <ChevronLeft aria-hidden="true" size={14} />
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => void load(page + 1)}
              aria-label="Next page"
              className="border-structural text-ink-muted rounded-control grid size-8 place-items-center border disabled:opacity-40"
            >
              <ChevronRight aria-hidden="true" size={14} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function StatTile({
  icon: Icon,
  label,
  value,
}: Readonly<{ icon: typeof Database; label: string; value: number }>) {
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
