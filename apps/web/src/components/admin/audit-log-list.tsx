"use client";

import { auditEventListResponseSchema, type AuditEventRecord } from "@sqweb/contracts";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { Spinner } from "@/components/ui/spinner";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

const PAGE_SIZE = 20;

const resultTone: Record<AuditEventRecord["result"], string> = {
  succeeded: "text-success",
  denied: "text-warning",
  failed: "text-danger",
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

export function AuditLogList() {
  const { authorizedFetch } = useAuth();
  const [items, setItems] = useState<readonly AuditEventRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
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
        if (action.trim()) query.set("action", action.trim());
        const response = await authorizedFetch(
          `/v1/admin/audit-events?${query.toString()}`,
          {},
          true,
        );
        if (!response.ok) throw new Error("Audit events could not be loaded.");
        const parsed = auditEventListResponseSchema.parse(
          await response.json(),
        );
        setItems(parsed.items);
        setTotal(parsed.total);
        setPage(parsed.page);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Audit events could not be loaded.",
        );
      } finally {
        setLoading(false);
      }
    },
    [authorizedFetch, action],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load(1);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  // Live-reflects new audit events as they're recorded, without a manual
  // refresh.
  usePolling(() => void load(page), DEFAULT_POLL_INTERVAL_MS);

  function onActionChange(value: string) {
    setAction(value);
    if (searchTimeout.current !== null) window.clearTimeout(searchTimeout.current);
    searchTimeout.current = window.setTimeout(() => {
      void load(1);
    }, 300);
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section className="rounded-panel border-structural bg-surface border">
      <div className="border-divider border-b px-4 py-3">
        <h2 className="font-heading text-ink-primary text-lg font-semibold tracking-[-0.02em]">
          Audit logs
        </h2>
        <p className="text-ink-muted mt-1 text-xs">
          Every recorded platform action, most recent first.
        </p>
      </div>

      <div className="px-4 py-3">
        <div className="border-structural bg-canvas rounded-control flex min-h-9 max-w-sm items-center gap-2 border px-2.5">
          <Search aria-hidden="true" size={14} className="text-ink-disabled" />
          <input
            value={action}
            onChange={(event) => onActionChange(event.target.value)}
            placeholder="Filter by action…"
            aria-label="Filter by action"
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
        <p className="text-ink-muted px-4 pb-6 text-center text-xs">
          No audit events match this filter.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-ink-muted border-divider border-y text-[11px] uppercase">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Actor</th>
                <th className="px-4 py-2 font-medium">Action</th>
                <th className="px-4 py-2 font-medium">Target</th>
                <th className="px-4 py-2 font-medium">Result</th>
              </tr>
            </thead>
            <tbody className="divide-divider divide-y">
              {items.map((event) => (
                <tr key={event.id}>
                  <td className="text-ink-muted px-4 py-2.5 text-xs whitespace-nowrap">
                    {formatDate(event.occurredAt)}
                  </td>
                  <td className="text-ink-secondary px-4 py-2.5 text-xs">
                    {event.actorDisplayName ?? "Unknown"}
                  </td>
                  <td className="text-ink-primary px-4 py-2.5 font-mono text-xs">
                    {event.action}
                  </td>
                  <td className="text-ink-muted px-4 py-2.5 truncate font-mono text-xs">
                    {event.targetId}
                  </td>
                  <td
                    className={`px-4 py-2.5 text-xs font-medium ${resultTone[event.result]}`}
                  >
                    {event.result}
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
