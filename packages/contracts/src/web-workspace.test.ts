import { describe, expect, it } from "vitest";

import {
  WEB_SOURCE_MAX_CHARS,
  countWebWorkspaceFiles,
  webFileKindFromName,
  webWorkspaceContentSchema,
} from "./web-workspace";

const content = {
  root: {
    id: "root",
    kind: "folder" as const,
    name: "My files",
    children: [
      {
        id: "nested",
        kind: "folder" as const,
        name: "site",
        children: [
          {
            id: "html",
            kind: "file" as const,
            name: "index.HTML",
            sourceCode: "<h1>Hello</h1>",
          },
          {
            id: "css",
            kind: "file" as const,
            name: "style.css",
            sourceCode: "h1 {}",
          },
        ],
      },
    ],
  },
  expanded: ["nested"],
  openFileIds: ["html"],
  activeFileId: "html",
};

describe("web workspace contracts", () => {
  it("accepts supported extensions case-insensitively and counts nested files", () => {
    const parsed = webWorkspaceContentSchema.parse(content);
    expect(countWebWorkspaceFiles(parsed.root)).toBe(2);
    expect(webFileKindFromName("INDEX.HTML")).toBe("html");
    expect(webFileKindFromName("client.js")).toBe("javascript");
  });

  it("rejects unsupported files and oversized source", () => {
    expect(
      webWorkspaceContentSchema.safeParse({
        ...content,
        root: {
          ...content.root,
          children: [
            {
              id: "bad",
              kind: "file",
              name: "notes.txt",
              sourceCode: "notes",
            },
          ],
        },
      }).success,
    ).toBe(false);
    expect(
      webWorkspaceContentSchema.safeParse({
        ...content,
        root: {
          ...content.root,
          children: [
            {
              id: "large",
              kind: "file",
              name: "large.js",
              sourceCode: "x".repeat(WEB_SOURCE_MAX_CHARS + 1),
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("accepts an image file node and identifies its kind", () => {
    const parsed = webWorkspaceContentSchema.safeParse({
      ...content,
      root: {
        ...content.root,
        children: [
          {
            id: "logo",
            kind: "file",
            name: "logo.png",
            sourceCode: "data:image/png;base64,AAAA",
          },
        ],
      },
    });
    expect(parsed.success).toBe(true);
    expect(webFileKindFromName("logo.PNG")).toBe("image");
    expect(webFileKindFromName("photo.jpeg")).toBe("image");
    expect(webFileKindFromName("notes.txt")).toBeNull();
  });
});
