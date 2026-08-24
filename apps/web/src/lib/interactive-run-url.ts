const interactiveRunBaseUrl =
  process.env.NEXT_PUBLIC_INTERACTIVE_RUN_API_URL ?? "";

export function interactiveRunSocketUrl(token: string): string {
  const wsBase = interactiveRunBaseUrl.replace(/^http/, "ws");
  return `${wsBase}/v1/interactive-runs?token=${encodeURIComponent(token)}`;
}
