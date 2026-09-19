"use client";

import {
  raceLeaderboardEntrySchema,
  type RaceLeaderboardEntry,
} from "@sqweb/contracts";
import { Trophy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { DEFAULT_POLL_INTERVAL_MS, usePolling } from "@/lib/use-polling";

// Unlike QuizLeaderboard (only counts fully-submitted attempts), this
// reflects every student who has started — "real time" progress is the
// point, so an in-progress student's running percentage already shows up.
export function RaceLeaderboard({ raceId }: Readonly<{ raceId: string }>) {
  const { authorizedFetch } = useAuth();
  const [entries, setEntries] = useState<readonly RaceLeaderboardEntry[]>([]);
  const [status, setStatus] = useState("Loading leaderboard…");

  const load = useCallback(async () => {
    try {
      const response = await authorizedFetch(`/v1/races/${raceId}/leaderboard`);
      if (!response.ok) throw new Error("The leaderboard could not be loaded.");
      const parsed = raceLeaderboardEntrySchema
        .array()
        .parse(await response.json());
      setEntries(parsed);
      setStatus(parsed.length === 0 ? "No one has started yet." : "");
    } catch (loadError) {
      setStatus(
        loadError instanceof Error
          ? loadError.message
          : "The leaderboard could not be loaded.",
      );
    }
  }, [authorizedFetch, raceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  usePolling(() => void load(), DEFAULT_POLL_INTERVAL_MS);

  return (
    <section className="border-structural bg-surface rounded-panel overflow-hidden border">
      <div className="border-divider border-b px-4 py-3">
        <h3 className="text-ink-primary flex items-center gap-2 text-sm font-semibold">
          <Trophy aria-hidden="true" size={15} /> Leaderboard
        </h3>
        <p className="text-ink-muted mt-1 text-[11px]">
          Live rankings by progress, updated automatically.
        </p>
      </div>
      {entries.length === 0 ? (
        <p className="text-ink-muted p-4 text-xs">{status}</p>
      ) : (
        <ol className="divide-divider divide-y">
          {entries.map((entry) => {
            const isTopThree = entry.rank <= 3;
            return (
              <li
                key={entry.studentId}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`rounded-control font-heading grid size-8 shrink-0 place-items-center border text-xs font-semibold ${
                      entry.rank === 1
                        ? "border-action/30 bg-action/10 text-action-soft"
                        : isTopThree
                          ? "border-divider bg-panel text-ink-secondary"
                          : "border-divider bg-panel text-ink-muted"
                    }`}
                  >
                    {isTopThree ? (
                      <Trophy aria-hidden="true" size={13} />
                    ) : (
                      entry.rank
                    )}
                  </span>
                  <p className="text-ink-primary truncate text-sm font-medium">
                    {entry.studentName}
                  </p>
                </div>
                <p className="text-ink-primary shrink-0 text-sm font-semibold tabular-nums">
                  {entry.percentage}%
                  <span className="text-ink-muted ml-1 text-[11px] font-normal">
                    ({entry.totalScore}/{entry.totalPoints} pts)
                  </span>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
