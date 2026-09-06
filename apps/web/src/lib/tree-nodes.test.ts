import { describe, expect, it } from "vitest";

import {
  collectFileIds,
  findNode,
  findParentId,
  insertChild,
  mapNode,
  removeNode,
} from "./tree-nodes";

interface TestFile {
  id: string;
  kind: "file";
  name: string;
}

interface TestFolder {
  id: string;
  kind: "folder";
  name: string;
  children: TestNode[];
}

type TestNode = TestFile | TestFolder;

const tree: TestFolder = {
  id: "root",
  kind: "folder",
  name: "Root",
  children: [
    { id: "a", kind: "file", name: "a.html" },
    {
      id: "nested",
      kind: "folder",
      name: "Nested",
      children: [{ id: "b", kind: "file", name: "b.css" }],
    },
  ],
};

describe("tree node utilities", () => {
  it("finds nodes and direct parents recursively", () => {
    expect(findNode<TestFile, TestFolder>(tree, "b")).toMatchObject({
      name: "b.css",
    });
    expect(findNode<TestFile, TestFolder>(tree, "missing")).toBeNull();
    expect(findParentId<TestFile, TestFolder>(tree, "b")).toBe("nested");
  });

  it("maps only the requested node without mutating the input", () => {
    const mapped = mapNode<TestFile, TestFolder>(tree, "b", (node) => ({
      ...node,
      name: "renamed.css",
    })) as TestFolder;
    expect(findNode<TestFile, TestFolder>(mapped, "b")).toMatchObject({
      name: "renamed.css",
    });
    expect(findNode<TestFile, TestFolder>(tree, "b")).toMatchObject({
      name: "b.css",
    });
  });

  it("inserts and removes nested nodes", () => {
    const inserted = insertChild<TestFile, TestFolder>(tree, "nested", {
      id: "c",
      kind: "file",
      name: "c.js",
    }) as TestFolder;
    expect(collectFileIds<TestFile, TestFolder>(inserted)).toEqual([
      "a",
      "b",
      "c",
    ]);

    const removed = removeNode<TestFile, TestFolder>(inserted, "nested");
    expect(collectFileIds<TestFile, TestFolder>(removed)).toEqual(["a"]);
  });
});
