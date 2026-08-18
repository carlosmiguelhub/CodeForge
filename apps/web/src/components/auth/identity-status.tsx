export function IdentityStatus({
  children,
  tone = "neutral",
}: Readonly<{ children: string; tone?: "neutral" | "error" | "success" }>) {
  const toneClasses = {
    neutral: "border-divider bg-panel text-ink-secondary",
    error: "border-danger/30 bg-danger/5 text-danger",
    success: "border-success/30 bg-success/5 text-success",
  } as const;
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-control border px-3 py-2 text-sm ${toneClasses[tone]}`}
    >
      {children}
    </div>
  );
}
