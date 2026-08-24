"use client";

import { useEffect, useRef } from "react";

export const DEFAULT_POLL_INTERVAL_MS = 5000;

// Shared "live snap" primitive: re-runs `callback` on an interval so lists
// and status views reflect changes made elsewhere (another admin session,
// another tab, an admin locking a workspace) without a manual refresh.
// By default skips ticks while the tab is hidden so background tabs don't
// keep hammering the API — pass `pauseWhenHidden: false` for anything
// security-critical (e.g. detecting a suspended account) that must keep
// checking even in a tab the user isn't currently looking at.
export function usePolling(
  callback: () => void,
  intervalMs: number,
  enabled = true,
  pauseWhenHidden = true,
) {
  const callbackRef = useRef(callback);
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => {
      if (!pauseWhenHidden || document.visibilityState === "visible")
        callbackRef.current();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, enabled, pauseWhenHidden]);
}
