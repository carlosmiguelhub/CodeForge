import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePolling } from "./use-polling";

describe("usePolling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls the callback on each interval tick while the tab is visible", () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000));

    expect(callback).not.toHaveBeenCalled();
    vi.advanceTimersByTime(3000);
    expect(callback).toHaveBeenCalledTimes(3);
  });

  it("does not call the callback while the tab is hidden", () => {
    const callback = vi.fn();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderHook(() => usePolling(callback, 1000));

    vi.advanceTimersByTime(3000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("stops polling once unmounted", () => {
    const callback = vi.fn();
    const { unmount } = renderHook(() => usePolling(callback, 1000));
    unmount();
    vi.advanceTimersByTime(3000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("does not poll when disabled", () => {
    const callback = vi.fn();
    renderHook(() => usePolling(callback, 1000, false));
    vi.advanceTimersByTime(3000);
    expect(callback).not.toHaveBeenCalled();
  });

  it("still calls the callback in a hidden tab when pauseWhenHidden is false", () => {
    const callback = vi.fn();
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    renderHook(() => usePolling(callback, 1000, true, false));

    vi.advanceTimersByTime(3000);
    expect(callback).toHaveBeenCalledTimes(3);
  });
});
