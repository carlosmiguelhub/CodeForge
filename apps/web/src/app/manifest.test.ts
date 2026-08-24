import { describe, expect, it } from "vitest";

import manifest from "./manifest";

describe("PWA manifest", () => {
  it("uses stable install icons and standalone display mode", () => {
    const value = manifest();

    expect(value).toMatchObject({
      id: "/",
      name: "CodeForge",
      start_url: "/",
      scope: "/",
      display: "standalone",
    });
    expect(value.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          src: "/icon-512.png",
          purpose: "any",
        }),
        expect.objectContaining({
          src: "/icon-maskable-512.png",
          purpose: "maskable",
        }),
      ]),
    );
  });
});
