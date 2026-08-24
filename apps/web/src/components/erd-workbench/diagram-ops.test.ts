import { describe, expect, it } from "vitest";

import {
  addAttributeRow,
  createEdgeBetween,
  createNodeAtPosition,
  GRID_SIZE,
  removeAttributeRow,
  removeEdge,
  removeNode,
  renameNode,
  setEdgeBendPoints,
  snapToGrid,
  toggleCardinality,
  togglePrimaryKey,
  updateAttributeRow,
} from "./diagram-ops";
import type { EntityNodeType, ErdEdge, ShapeNodeType, TextNodeType } from "./types";

describe("snapToGrid", () => {
  it("rounds to the nearest grid line in both axes", () => {
    expect(snapToGrid({ x: 10, y: 20 })).toEqual({ x: 16, y: 16 });
    expect(snapToGrid({ x: GRID_SIZE * 3, y: GRID_SIZE * 5 })).toEqual({
      x: GRID_SIZE * 3,
      y: GRID_SIZE * 5,
    });
  });
});

describe("createNodeAtPosition", () => {
  it("creates an entity with one seeded primary-key attribute", () => {
    const node = createNodeAtPosition("entity", { x: 32, y: 48 });
    expect(node.type).toBe("entity");
    expect(node.position).toEqual({ x: 32, y: 48 });
    const entity = node as EntityNodeType;
    expect(entity.data.attributes).toHaveLength(1);
    expect(entity.data.attributes[0]?.isPrimaryKey).toBe(true);
  });

  it("snaps the requested position to the alignment grid", () => {
    const node = createNodeAtPosition("entity", { x: 10, y: 20 });
    expect(node.position).toEqual({ x: 16, y: 16 });
  });

  it("creates a shape node with a capitalized default label", () => {
    const node = createNodeAtPosition("diamond", { x: 0, y: 0 });
    const shape = node as ShapeNodeType;
    expect(shape.type).toBe("shape");
    expect(shape.data.shapeKind).toBe("diamond");
    expect(shape.data.label).toBe("Diamond");
  });

  it("creates a text node with placeholder text", () => {
    const node = createNodeAtPosition("text", { x: 0, y: 0 });
    const text = node as TextNodeType;
    expect(text.type).toBe("text");
    expect(text.data.text).toBe("Note");
  });
});

describe("entity attribute operations", () => {
  function makeEntity(): EntityNodeType {
    return createNodeAtPosition("entity", { x: 0, y: 0 }) as EntityNodeType;
  }

  it("addAttributeRow appends a blank editable row", () => {
    const entity = makeEntity();
    const updated = addAttributeRow(entity);
    expect(updated.data.attributes).toHaveLength(2);
    expect(updated.data.attributes[1]).toMatchObject({
      name: "",
      dataType: "",
      isPrimaryKey: false,
    });
    // Original is untouched (pure function).
    expect(entity.data.attributes).toHaveLength(1);
  });

  it("removeAttributeRow removes only the targeted attribute", () => {
    const entity = addAttributeRow(makeEntity());
    const targetId = entity.data.attributes[0]?.id;
    if (!targetId) throw new Error("expected a seeded attribute");
    const updated = removeAttributeRow(entity, targetId);
    expect(updated.data.attributes).toHaveLength(1);
    expect(updated.data.attributes[0]?.id).not.toBe(targetId);
  });

  it("updateAttributeRow only changes the requested fields", () => {
    const entity = makeEntity();
    const id = entity.data.attributes[0]!.id;
    const updated = updateAttributeRow(entity, id, { name: "email" });
    expect(updated.data.attributes[0]?.name).toBe("email");
    expect(updated.data.attributes[0]?.dataType).toBe("INT");
  });

  it("togglePrimaryKey flips only the targeted attribute", () => {
    const entity = makeEntity();
    const id = entity.data.attributes[0]!.id;
    const toggledOff = togglePrimaryKey(entity, id);
    expect(toggledOff.data.attributes[0]?.isPrimaryKey).toBe(false);
    const toggledOn = togglePrimaryKey(toggledOff, id);
    expect(toggledOn.data.attributes[0]?.isPrimaryKey).toBe(true);
  });
});

describe("renameNode", () => {
  it("renames an entity's name field", () => {
    const entity = createNodeAtPosition("entity", { x: 0, y: 0 }) as EntityNodeType;
    expect(renameNode(entity, "students").data.name).toBe("students");
  });

  it("renames a shape's label field", () => {
    const shape = createNodeAtPosition("rectangle", { x: 0, y: 0 }) as ShapeNodeType;
    expect(renameNode(shape, "Custom").data.label).toBe("Custom");
  });

  it("renames a text node's text field", () => {
    const text = createNodeAtPosition("text", { x: 0, y: 0 }) as TextNodeType;
    expect(renameNode(text, "Reminder").data.text).toBe("Reminder");
  });
});

describe("createEdgeBetween", () => {
  it("creates an edge with a plain line by default (no cardinality mark)", () => {
    const edge = createEdgeBetween("a", "b");
    expect(edge).not.toBeNull();
    expect(edge?.source).toBe("a");
    expect(edge?.target).toBe("b");
    expect(edge?.data).toEqual({
      sourceCardinality: "none",
      targetCardinality: "none",
      bendPoints: [],
    });
  });

  it("refuses to connect a node to itself", () => {
    expect(createEdgeBetween("a", "a")).toBeNull();
  });
});

describe("toggleCardinality", () => {
  it("changes only the requested end", () => {
    const edge = createEdgeBetween("a", "b")!;
    const updated = toggleCardinality(edge, "target", "zero-or-many");
    expect(updated.data).toEqual({
      sourceCardinality: "none",
      targetCardinality: "zero-or-many",
      bendPoints: [],
    });
  });
});

describe("setEdgeBendPoints", () => {
  it("replaces the bend points while preserving cardinality", () => {
    const edge = toggleCardinality(
      createEdgeBetween("a", "b")!,
      "target",
      "many",
    );
    const updated = setEdgeBendPoints(edge, [{ x: 10, y: 20 }]);
    expect(updated.data).toEqual({
      sourceCardinality: "none",
      targetCardinality: "many",
      bendPoints: [{ x: 10, y: 20 }],
    });
  });
});

describe("removeNode", () => {
  it("removes the node and cascades to its edges, leaving unrelated edges intact", () => {
    const nodes = [
      createNodeAtPosition("entity", { x: 0, y: 0 }),
      createNodeAtPosition("entity", { x: 100, y: 0 }),
      createNodeAtPosition("entity", { x: 200, y: 0 }),
    ];
    nodes[0]!.id = "a";
    nodes[1]!.id = "b";
    nodes[2]!.id = "c";
    const edges: ErdEdge[] = [
      createEdgeBetween("a", "b")!,
      createEdgeBetween("b", "c")!,
    ];
    const result = removeNode(nodes, edges, "b");
    expect(result.nodes.map((n) => n.id)).toEqual(["a", "c"]);
    expect(result.edges).toHaveLength(0);
  });
});

describe("removeEdge", () => {
  it("removes only the targeted edge", () => {
    const edges: ErdEdge[] = [
      createEdgeBetween("a", "b")!,
      createEdgeBetween("b", "c")!,
    ];
    const targetId = edges[0]!.id;
    const result = removeEdge(edges, targetId);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).not.toBe(targetId);
  });
});
