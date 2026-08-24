import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useStandaloneDisplayMode } from "./use-standalone-display-mode";

describe("useStandaloneDisplayMode", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tracks changes to the standalone display-mode media query", () => {
    let matches = false;
    const listeners = new Set<EventListenerOrEventListenerObject>();
    const query = {
      get matches() {
        return matches;
      },
      media: "(display-mode: standalone)",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: (
        _event: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        listeners.add(listener);
      },
      removeEventListener: (
        _event: string,
        listener: EventListenerOrEventListenerObject,
      ) => {
        listeners.delete(listener);
      },
      dispatchEvent: vi.fn(() => true),
    } as unknown as MediaQueryList;
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => query),
    );

    const { result } = renderHook(() => useStandaloneDisplayMode());
    expect(result.current).toBe(false);

    act(() => {
      matches = true;
      const event = new Event("change");
      listeners.forEach((listener) => {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      });
    });

    expect(result.current).toBe(true);
  });
});
