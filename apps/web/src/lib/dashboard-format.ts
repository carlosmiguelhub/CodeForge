export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Used for "closes in Xh" style countdowns on dashboard deadline widgets.
// Callers are expected to have already filtered out items whose deadline
// has fully passed, so a <=0 diff only happens from clock skew between
// client and server — "closing now" degrades sensibly rather than showing
// a negative duration.
export function formatClosesIn(iso: string) {
  const diffMs = Date.parse(iso) - Date.now();
  if (diffMs <= 0) return "closing now";
  const hours = Math.round(diffMs / (60 * 60 * 1000));
  if (hours < 1) return "closes in <1h";
  if (hours < 24) return `closes in ${hours}h`;
  return `closes in ${Math.round(hours / 24)}d`;
}
