import { describe, expect, it } from "vitest";

import { LocalWorkspaceSecretStore } from "./local-secret-store";

describe("LocalWorkspaceSecretStore", () => {
  it("refuses to initialize in production", () => {
    expect(
      () => new LocalWorkspaceSecretStore("ignored", "production"),
    ).toThrow(/cannot run in production/);
  });
});
