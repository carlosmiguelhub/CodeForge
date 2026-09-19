import type { LucideIcon } from "lucide-react";

export function StatTile({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: Readonly<{
  icon: LucideIcon;
  label: string;
  value: number;
  tone?: "neutral" | "warning";
}>) {
  return (
    <div className="border-structural bg-surface rounded-panel flex items-center gap-3 border p-4">
      <span
        className={`rounded-control grid size-10 shrink-0 place-items-center border ${
          tone === "warning"
            ? "border-warning/30 bg-warning/5 text-warning"
            : "border-divider bg-elevated text-action-soft"
        }`}
      >
        <Icon aria-hidden="true" size={18} strokeWidth={1.7} />
      </span>
      <div>
        <p className="text-ink-primary text-xl font-semibold tracking-[-0.02em]">
          {value}
        </p>
        <p className="text-ink-muted text-xs">{label}</p>
      </div>
    </div>
  );
}
