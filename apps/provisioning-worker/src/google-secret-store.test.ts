import { describe, expect, it, vi } from "vitest";

import { GoogleWorkspaceSecretStore } from "./google-secret-store";

describe("GoogleWorkspaceSecretStore", () => {
  it("creates a project-bound secret and returns only its version reference", async () => {
    const client = {
      getSecret: vi.fn().mockRejectedValue({ code: 5 }),
      createSecret: vi.fn().mockResolvedValue([{}]),
      addSecretVersion: vi.fn().mockResolvedValue([
        {
          name: "projects/test-project/secrets/sqweb-workspace-id/versions/1",
        },
      ]),
      destroySecretVersion: vi.fn(),
    };
    const store = new GoogleWorkspaceSecretStore(
      "test-project",
      client as never,
    );
    const reference = await store.put("id", {
      host: "private",
      port: 3306,
      database: "workspace",
      username: "workspace",
      password: "secret-value",
    });
    expect(reference).toBe(
      "projects/test-project/secrets/sqweb-workspace-id/versions/1",
    );
    expect(client.createSecret).toHaveBeenCalledWith(
      expect.objectContaining({ parent: "projects/test-project" }),
    );
  });

  it("refuses to destroy a secret outside the configured project", async () => {
    const store = new GoogleWorkspaceSecretStore("test-project", {} as never);
    await expect(
      store.remove("projects/other/secrets/sqweb-workspace-id/versions/1"),
    ).rejects.toThrow(/outside/);
  });
});
