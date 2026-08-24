"use client";

import type { ReactNode } from "react";

// Purely decorative, CSS-only mockups of each workbench — not screenshots
// (there's nothing to photograph safely without live auth), but built from
// the same layout shapes (query lines + result grid, file tree + editor,
// linked table cards) so each card hints at the real thing before you open
// the guide.
function PreviewFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div aria-hidden="true" className="bg-panel">
      <div className="bg-elevated border-divider flex items-center gap-1.5 border-b px-3 py-2">
        <span className="bg-danger/60 size-1.5 rounded-full" />
        <span className="bg-warning/60 size-1.5 rounded-full" />
        <span className="bg-success/60 size-1.5 rounded-full" />
        <span className="bg-surface ml-2 h-2 flex-1 rounded-full" />
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function CodeLine({
  tone = "muted",
  width,
  indent = 0,
}: Readonly<{
  tone?: "keyword" | "string" | "muted";
  width: number;
  indent?: number;
}>) {
  const toneClass =
    tone === "keyword"
      ? "bg-info/60"
      : tone === "string"
        ? "bg-success/60"
        : "bg-ink-muted/40";
  return (
    <span
      className={`${toneClass} block h-2 rounded-full`}
      style={{ width: `${width}%`, marginLeft: `${indent}%` }}
    />
  );
}

export function SqlWorkspacePreview() {
  return (
    <PreviewFrame>
      <div className="space-y-1.5">
        <div className="flex gap-1.5">
          <CodeLine tone="keyword" width={20} />
          <CodeLine width={34} />
        </div>
        <div className="flex gap-1.5">
          <CodeLine tone="keyword" width={16} />
          <CodeLine width={24} />
        </div>
        <div className="flex gap-1.5">
          <CodeLine tone="keyword" width={22} />
          <CodeLine width={26} />
          <CodeLine tone="string" width={12} />
        </div>
      </div>
      <div className="border-divider bg-surface mt-3 overflow-hidden rounded border">
        <div className="bg-elevated grid grid-cols-3 gap-px">
          <span className="h-4" />
          <span className="h-4" />
          <span className="h-4" />
        </div>
        <div className="divide-divider divide-y">
          {[0, 1].map((row) => (
            <div key={row} className="grid grid-cols-3 gap-2 px-2 py-1.5">
              <span className="bg-ink-disabled/40 h-1.5 w-2/3 rounded-full" />
              <span className="bg-ink-disabled/40 h-1.5 w-1/2 rounded-full" />
              <span className="bg-ink-disabled/40 h-1.5 w-3/4 rounded-full" />
            </div>
          ))}
        </div>
      </div>
    </PreviewFrame>
  );
}

export function CodeWorkspacePreview() {
  return (
    <PreviewFrame>
      <div className="flex gap-3">
        <div className="w-14 shrink-0 space-y-1.5 pt-0.5">
          <div className="flex items-center gap-1">
            <span className="bg-action-soft/70 size-1.5 shrink-0 rounded-sm" />
            <span className="bg-ink-muted/40 h-1.5 w-7 rounded-full" />
          </div>
          <div className="ml-2 flex items-center gap-1">
            <span className="bg-ink-disabled/60 size-1.5 shrink-0 rounded-sm" />
            <span className="bg-ink-muted/30 h-1.5 w-6 rounded-full" />
          </div>
          <div className="ml-2 flex items-center gap-1">
            <span className="bg-ink-disabled/60 size-1.5 shrink-0 rounded-sm" />
            <span className="bg-ink-muted/30 h-1.5 w-8 rounded-full" />
          </div>
          <div className="flex items-center gap-1">
            <span className="bg-action-soft/70 size-1.5 shrink-0 rounded-sm" />
            <span className="bg-ink-muted/40 h-1.5 w-9 rounded-full" />
          </div>
        </div>
        <div className="border-divider flex-1 space-y-1.5 border-l pl-3">
          <CodeLine tone="keyword" width={30} />
          <CodeLine tone="string" width={40} indent={10} />
          <CodeLine tone="keyword" width={22} indent={10} />
          <CodeLine width={50} indent={20} />
          <CodeLine tone="keyword" width={18} />
        </div>
      </div>
    </PreviewFrame>
  );
}

function ErdTableChip({
  fields,
  emphasize = false,
}: Readonly<{ fields: number; emphasize?: boolean }>) {
  return (
    <div className="border-divider bg-surface w-16 shrink-0 overflow-hidden rounded border">
      <div
        className={`h-3 border-b ${emphasize ? "bg-action-soft/30 border-action-soft/40" : "bg-elevated-high border-divider"}`}
      />
      <div className="space-y-1 p-1.5">
        {Array.from({ length: fields }).map((_, index) => (
          <span
            key={index}
            className="bg-ink-disabled/40 block h-1 rounded-full"
            style={{ width: index === 0 ? "100%" : "65%" }}
          />
        ))}
      </div>
    </div>
  );
}

function ErdConnector() {
  return (
    <div className="flex w-5 shrink-0 items-center self-center">
      <span className="bg-action-soft size-1.5 shrink-0 rounded-full" />
      <span className="bg-divider h-px flex-1" />
      <span className="bg-action-soft size-1.5 shrink-0 rounded-full" />
    </div>
  );
}

export function ErdWorkspacePreview() {
  return (
    <PreviewFrame>
      <div className="flex items-center justify-center gap-0 py-1.5">
        <ErdTableChip fields={2} />
        <ErdConnector />
        <ErdTableChip fields={3} emphasize />
        <ErdConnector />
        <ErdTableChip fields={2} />
      </div>
    </PreviewFrame>
  );
}
