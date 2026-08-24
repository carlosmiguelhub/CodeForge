import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { LocalWorkspaceSecretStore } from "./local-secret-store";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true })),
  );
});

describe("LocalWorkspaceSecretStore", () => {
  it("round-trips a credential behind an opaque reference", async () => {
    const root = await mkdtemp(join(tmpdir(), "sqweb-secret-test-"));
    roots.push(root);
    const store = new LocalWorkspaceSecretStore(root);
    const credential = {
      host: "127.0.0.1",
      port: 3308,
      database: "workspace_01",
      username: "workspace_01",
      password: "a-secure-local-password-value-123456",
    };
    const secretRef = await store.put(
      "00000000-0000-4000-8000-000000000020",
      credential,
    );

    expect(secretRef).toMatch(/^local-secret:\/\//);
    expect(await store.get(secretRef)).toEqual(credential);
    expect(
      await readFile(join(root, secretRef.slice(15)), "utf8"),
    ).not.toContain("local-secret://");
    await store.remove(secretRef);
    await expect(store.get(secretRef)).rejects.toThrow();
  });

  it("rejects unsafe references", async () => {
    const store = new LocalWorkspaceSecretStore("ignored");
    await expect(
      store.get("local-secret://../credential.json"),
    ).rejects.toThrow(/Unsafe/);
  });
});
