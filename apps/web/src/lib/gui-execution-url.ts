// The gui-session grant is the sole credential on these routes (native
// WebSocket can't set an Authorization header), so the frontend builds the
// full ws(s) URL itself from its own env var — the same shape as
// executionFetch building URLs from NEXT_PUBLIC_EXECUTION_API_URL — rather
// than platform-api handing back opaque URLs.
const guiExecutionBaseUrl = process.env.NEXT_PUBLIC_GUI_EXECUTION_API_URL ?? "";

export function guiSessionSocketUrl(
  sessionId: string,
  route: "console" | "vnc",
  grant: string,
): string {
  const wsBase = guiExecutionBaseUrl.replace(/^http/, "ws");
  return `${wsBase}/v1/gui-sessions/${encodeURIComponent(sessionId)}/${route}?token=${encodeURIComponent(grant)}`;
}
