const LAST_ACTIVE_KEY = "sqweb:last-active-at";

export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;

export function markActive(): void {
  try {
    window.localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
  } catch {
    // Storage can be unavailable (private browsing, quota). Idle tracking
    // degrades to "never idle" in that case, which is acceptable.
  }
}

export function clearActive(): void {
  try {
    window.localStorage.removeItem(LAST_ACTIVE_KEY);
  } catch {
    // See markActive.
  }
}

/** Milliseconds since the last recorded activity, or null if none is recorded. */
export function idleDuration(): number | null {
  try {
    const stored = window.localStorage.getItem(LAST_ACTIVE_KEY);
    if (!stored) return null;
    const lastActive = Number(stored);
    if (!Number.isFinite(lastActive)) return null;
    return Date.now() - lastActive;
  } catch {
    return null;
  }
}

export function isIdleExpired(): boolean {
  const duration = idleDuration();
  return duration !== null && duration >= IDLE_TIMEOUT_MS;
}
