"use client";

import {
  workspaceKindLabels,
  type WorkspaceKind,
  type WorkspaceUsageStat,
} from "@sqweb/contracts";
import { AppWindow, Bookmark, Code2, Database, Network } from "lucide-react";
import { type PointerEvent, useId, useState } from "react";

const workspaceIcons: Record<WorkspaceKind, typeof Database> = {
  "sql-workbench": Database,
  "code-compiler": Code2,
  "erd-editor": Network,
  "saved-queries": Bookmark,
  "java-gui-workspace": AppWindow,
};

const SPARKLINE_WIDTH = 240;
const SPARKLINE_HEIGHT = 56;
const SPARKLINE_TOP_PADDING = 8;

function formatShortDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function WorkspaceUsageCard({
  stat,
}: Readonly<{ stat: WorkspaceUsageStat }>) {
  const Icon = workspaceIcons[stat.workspace];
  return (
    <div className="rounded-panel border-structural bg-surface border p-4">
      <div className="flex items-center gap-3">
        <span className="rounded-control border-divider bg-panel text-action-soft grid size-9 shrink-0 place-items-center border">
          <Icon aria-hidden="true" size={16} strokeWidth={1.7} />
        </span>
        <div className="min-w-0">
          <p className="text-ink-primary text-lg font-semibold">
            {stat.totalCount.toLocaleString()}
          </p>
          <p className="text-ink-muted text-xs">
            {workspaceKindLabels[stat.workspace]}
          </p>
        </div>
      </div>
      <div className="mt-3">
        <Sparkline dailyCounts={stat.dailyCounts} />
      </div>
    </div>
  );
}

function Sparkline({
  dailyCounts,
}: Readonly<{
  dailyCounts: readonly { date: string; count: number }[];
}>) {
  const gradientId = useId();
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  if (dailyCounts.length === 0) return null;

  const maxCount = Math.max(1, ...dailyCounts.map((day) => day.count));
  const usableHeight = SPARKLINE_HEIGHT - SPARKLINE_TOP_PADDING;
  const stepX =
    dailyCounts.length > 1 ? SPARKLINE_WIDTH / (dailyCounts.length - 1) : 0;

  const points = dailyCounts.map((day, index) => ({
    x: dailyCounts.length > 1 ? index * stepX : SPARKLINE_WIDTH / 2,
    y: SPARKLINE_HEIGHT - (day.count / maxCount) * usableHeight,
    date: day.date,
    count: day.count,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? "M" : "L"}${point.x},${point.y}`)
    .join(" ");
  const lastPoint = points[points.length - 1]!;
  const firstPoint = points[0]!;
  const areaPath = `${linePath} L${lastPoint.x},${SPARKLINE_HEIGHT} L${firstPoint.x},${SPARKLINE_HEIGHT} Z`;

  const totalInWindow = dailyCounts.reduce((sum, day) => sum + day.count, 0);
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handlePointerMove(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX =
      ((event.clientX - rect.left) / rect.width) * SPARKLINE_WIDTH;
    const index = stepX > 0 ? Math.round(relativeX / stepX) : 0;
    setHoverIndex(Math.min(Math.max(index, 0), points.length - 1));
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
        className="h-14 w-full touch-none"
        role="img"
        aria-label={`Last ${dailyCounts.length} days: ${totalInWindow} total, most recent ${formatShortDate(lastPoint.date)}: ${lastPoint.count}`}
        onPointerMove={handlePointerMove}
        onPointerLeave={() => setHoverIndex(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-action)" stopOpacity="0.18" />
            <stop offset="100%" stopColor="var(--color-action)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradientId})`} stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="var(--color-action)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {hovered ? (
          <line
            x1={hovered.x}
            x2={hovered.x}
            y1={0}
            y2={SPARKLINE_HEIGHT}
            stroke="var(--color-divider)"
            strokeWidth={1}
          />
        ) : null}
        {points.map((point, index) =>
          index === points.length - 1 || index === hoverIndex ? (
            <circle
              key={point.date}
              cx={point.x}
              cy={point.y}
              r={4}
              fill="var(--color-action)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          ) : null,
        )}
      </svg>
      {hovered ? (
        <div
          className="border-structural bg-elevated text-ink-primary rounded-control pointer-events-none absolute top-0 z-10 border px-2 py-1 text-[11px] whitespace-nowrap shadow-lg"
          style={{
            left: `${(hovered.x / SPARKLINE_WIDTH) * 100}%`,
            transform: "translate(-50%, -115%)",
          }}
        >
          <span className="font-semibold">{hovered.count}</span>{" "}
          <span className="text-ink-muted">{formatShortDate(hovered.date)}</span>
        </div>
      ) : null}
    </div>
  );
}
