"use client";

import {
  topContributorListResponseSchema,
  type TopContributorRecord,
} from "@sqweb/contracts";
import {
  AppWindow,
  Bookmark,
  CheckCircle2,
  Code2,
  Database,
  Network,
  Trophy,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { IdentityStatus } from "@/components/auth/identity-status";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

const breakdownFields: readonly {
  key: keyof Pick<
    TopContributorRecord,
    | "sqlExecutionCount"
    | "codeExecutionCount"
    | "erdDiagramCount"
    | "savedQueryCount"
    | "guiSessionCount"
  >;
  label: string;
  icon: typeof Database;
}[] = [
  { key: "sqlExecutionCount", label: "SQL", icon: Database },
  { key: "codeExecutionCount", label: "Code", icon: Code2 },
  { key: "erdDiagramCount", label: "ERD", icon: Network },
  { key: "savedQueryCount", label: "Saved", icon: Bookmark },
  { key: "guiSessionCount", label: "GUI", icon: AppWindow },
];

export function TopContributorsView() {
  const { authorizedFetch } = useAuth();
  const [items, setItems] = useState<readonly TopContributorRecord[] | null>(
    null,
  );
  const [status, setStatus] = useState("Loading top contributors…");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(
        "/v1/admin/top-contributors",
        {},
        true,
      );
      if (!response.ok)
        throw new Error("Top contributors could not be loaded.");
      const parsed = topContributorListResponseSchema.parse(
        await response.json(),
      );
      setItems(parsed.items);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Top contributors could not be loaded.",
      );
    } finally {
      setStatus("");
    }
  }, [authorizedFetch]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  if (items === null) {
    return (
      <p role="status" aria-live="polite" className="text-ink-muted text-xs">
        {error ?? status}
      </p>
    );
  }

  const maxScore = Math.max(1, ...items.map((item) => item.contributionScore));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-heading text-ink-primary text-base font-semibold">
          Student leaderboard
        </h3>
        <p className="text-ink-muted mt-0.5 text-xs">
          Ranked by total activity across SQL, code, ERD, saved queries, and
          Java GUI work — with the subset that actually succeeded called out
          separately.
        </p>
      </div>

      {error ? <IdentityStatus tone="error">{error}</IdentityStatus> : null}

      {items.length === 0 ? (
        <div className="rounded-panel border-structural bg-surface grid min-h-32 place-items-center border px-6 py-8 text-center">
          <div className="text-ink-muted flex flex-col items-center gap-2">
            <Trophy aria-hidden="true" size={20} strokeWidth={1.7} />
            <p className="max-w-xs text-xs leading-5">
              No student contributions recorded yet.
            </p>
          </div>
        </div>
      ) : (
        <ol className="space-y-2.5">
          {items.map((contributor) => (
            <ContributorRow
              key={contributor.id}
              contributor={contributor}
              maxScore={maxScore}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

function ContributorRow({
  contributor,
  maxScore,
}: Readonly<{ contributor: TopContributorRecord; maxScore: number }>) {
  const barPercent =
    contributor.contributionScore === 0
      ? 0
      : Math.max(
          4,
          Math.round((contributor.contributionScore / maxScore) * 100),
        );
  const isTopThree = contributor.rank <= 3;

  return (
    <li className="rounded-panel border-structural bg-surface border p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span
            className={`rounded-control font-heading grid size-9 shrink-0 place-items-center border text-sm font-semibold ${
              contributor.rank === 1
                ? "border-action/30 bg-action/10 text-action-soft"
                : isTopThree
                  ? "border-divider bg-panel text-ink-secondary"
                  : "border-divider bg-panel text-ink-muted"
            }`}
          >
            {isTopThree ? (
              <Trophy aria-hidden="true" size={15} strokeWidth={1.7} />
            ) : (
              contributor.rank
            )}
          </span>
          <div className="min-w-0">
            <p className="text-ink-primary truncate text-sm font-semibold">
              {contributor.displayName}
            </p>
            <p className="text-ink-muted mt-0.5 truncate text-xs">
              <span>{contributor.sectionName ?? "No section"}</span> · Rank #
              {contributor.rank}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <p className="text-ink-primary text-lg leading-none font-semibold tabular-nums">
            <span>{contributor.contributionScore.toLocaleString()}</span>
            <span className="text-ink-muted ml-1 text-[11px] font-normal">
              pts
            </span>
          </p>
          <span className="border-success/30 bg-success/10 text-success rounded-control inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-medium">
            <CheckCircle2 aria-hidden="true" size={12} />
            {contributor.successfulWorkCount.toLocaleString()} successful
          </span>
        </div>
      </div>

      <div
        role="meter"
        aria-label={`Contribution score: ${contributor.contributionScore} points`}
        aria-valuenow={contributor.contributionScore}
        aria-valuemin={0}
        aria-valuemax={maxScore}
        className="bg-action/10 mt-3 h-2 w-full overflow-hidden rounded-full"
      >
        <div
          className="bg-action h-full rounded-full transition-[width]"
          style={{ width: `${barPercent}%` }}
        />
      </div>

      <div className="text-ink-muted mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        {breakdownFields.map(({ key, label, icon: Icon }) => (
          <span key={key} className="inline-flex items-center gap-1">
            <Icon aria-hidden="true" size={12} strokeWidth={1.7} />
            {label} {contributor[key].toLocaleString()}
          </span>
        ))}
      </div>
    </li>
  );
}
