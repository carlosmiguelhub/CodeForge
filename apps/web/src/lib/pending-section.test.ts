import { beforeEach, describe, expect, it } from "vitest";

import {
  clearPendingSectionId,
  getPendingSectionId,
  setPendingSectionId,
} from "./pending-section";

describe("pending section relay", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("returns null when nothing has been set", () => {
    expect(getPendingSectionId()).toBeNull();
  });

  it("round-trips a section id through sessionStorage", () => {
    setPendingSectionId("00000000-0000-4000-8000-000000000010");
    expect(getPendingSectionId()).toBe("00000000-0000-4000-8000-000000000010");
  });

  it("clears the stored section id", () => {
    setPendingSectionId("00000000-0000-4000-8000-000000000010");
    clearPendingSectionId();
    expect(getPendingSectionId()).toBeNull();
  });
});
