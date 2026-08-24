import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearActive,
  idleDuration,
  IDLE_TIMEOUT_MS,
  isIdleExpired,
  markActive,
} from "./idle-session";

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(0);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("idle session tracking", () => {
  it("reports no idle duration until activity has been recorded", () => {
    expect(idleDuration()).toBeNull();
    expect(isIdleExpired()).toBe(false);
  });

  it("tracks elapsed time since the last recorded activity", () => {
    markActive();
    vi.setSystemTime(5_000);
    expect(idleDuration()).toBe(5_000);
  });

  it("is not expired before the idle timeout elapses", () => {
    markActive();
    vi.setSystemTime(IDLE_TIMEOUT_MS - 1);
    expect(isIdleExpired()).toBe(false);
  });

  it("is expired once the idle timeout has elapsed", () => {
    markActive();
    vi.setSystemTime(IDLE_TIMEOUT_MS);
    expect(isIdleExpired()).toBe(true);
  });

  it("resets the clock on fresh activity", () => {
    markActive();
    vi.setSystemTime(IDLE_TIMEOUT_MS - 1);
    markActive();
    vi.setSystemTime(IDLE_TIMEOUT_MS + 5_000 - 1);
    expect(isIdleExpired()).toBe(false);
  });

  it("clears the recorded activity", () => {
    markActive();
    clearActive();
    expect(idleDuration()).toBeNull();
  });
});
