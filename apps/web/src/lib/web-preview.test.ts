import { describe, expect, it } from "vitest";

import {
  assemblePreviewDocument,
  filesByNameInTreeOrder,
  preferredHtmlFile,
  type WebPreviewFolderNode,
} from "./web-preview";

const root: WebPreviewFolderNode = {
  id: "root",
  kind: "folder",
  children: [
    {
      id: "first",
      kind: "folder",
      children: [
        {
          id: "html",
          kind: "file",
          name: "index.html",
          sourceCode:
            '<link rel="stylesheet alternate" href="css/theme.css?v=2#top"><script type="module" src="./app.js?cache=1"></script>',
        },
        {
          id: "css",
          kind: "file",
          name: "theme.css",
          sourceCode: 'body::after { content: "</style>"; }',
        },
        {
          id: "js",
          kind: "file",
          name: "app.js",
          sourceCode: 'document.body.dataset.value = "</script>";',
        },
      ],
    },
    {
      id: "duplicate",
      kind: "file",
      name: "APP.JS",
      sourceCode: "throw new Error('wrong duplicate')",
    },
  ],
};

describe("web preview assembly", () => {
  it("prefers index.html and keeps the first duplicate filename", () => {
    expect(preferredHtmlFile(root)?.id).toBe("html");
    expect(filesByNameInTreeOrder(root).get("app.js")?.id).toBe("js");
  });

  it("inlines local stylesheet and script references with URL suffixes", () => {
    const files = filesByNameInTreeOrder(root);
    const output = assemblePreviewDocument(
      files.get("index.html")!.sourceCode,
      files,
    );
    const parsed = new DOMParser().parseFromString(output, "text/html");

    expect(parsed.querySelector("link")).toBeNull();
    expect(parsed.querySelector("style")?.textContent).toContain(
      'content: "<\\/style>"',
    );
    expect(parsed.querySelector("script")?.getAttribute("type")).toBe("module");
    expect(parsed.querySelector("script")?.hasAttribute("src")).toBe(false);
    expect(parsed.querySelector("script")?.textContent).toContain(
      '"<\\/script>"',
    );
  });

  it("leaves absolute external references untouched", () => {
    const files = filesByNameInTreeOrder(root);
    const output = assemblePreviewDocument(
      '<link rel="stylesheet" href="https://cdn.example/theme.css"><script src="https://cdn.example/app.js"></script>',
      files,
    );
    const parsed = new DOMParser().parseFromString(output, "text/html");

    expect(parsed.querySelector("link")?.getAttribute("href")).toBe(
      "https://cdn.example/theme.css",
    );
    expect(parsed.querySelector("script")?.getAttribute("src")).toBe(
      "https://cdn.example/app.js",
    );
  });
});
