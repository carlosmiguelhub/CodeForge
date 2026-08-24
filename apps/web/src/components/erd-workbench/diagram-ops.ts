import type { XYPosition } from "@xyflow/react";

import { randomId } from "@/lib/random-id";

import type {
  Cardinality,
  EdgeAnchor,
  EdgePoint,
  EntityAttribute,
  EntityColumn,
  EntityNodeType,
  ErdEdge,
  ErdNode,
  ShapeKind,
  ShapeNodeType,
  TextNodeType,
} from "./types";

export type ShapeToolId =
  "entity" | "rectangle" | "diamond" | "ellipse" | "text";

// Matches the ReactFlow snapGrid below — keeping new shapes snapped at
// creation time too means every shape starts aligned, not just ones that
// get dragged afterward.
export const GRID_SIZE = 16;

export function snapToGrid(position: XYPosition): XYPosition {
  return {
    x: Math.round(position.x / GRID_SIZE) * GRID_SIZE,
    y: Math.round(position.y / GRID_SIZE) * GRID_SIZE,
  };
}

function newId(): string {
  return randomId();
}

export function createNodeAtPosition(
  tool: ShapeToolId,
  rawPosition: XYPosition,
): ErdNode {
  const id = newId();
  const position = snapToGrid(rawPosition);
  if (tool === "entity") {
    const entity: EntityNodeType = {
      id,
      type: "entity",
      position,
      data: {
        kind: "entity",
        name: "New Entity",
        attributes: [
          {
            id: newId(),
            name: "id",
            dataType: "INT",
            isPrimaryKey: true,
            customValues: {},
          },
        ],
      },
    };
    return entity;
  }
  if (tool === "text") {
    const text: TextNodeType = {
      id,
      type: "text",
      position,
      data: { kind: "text", text: "Note" },
    };
    return text;
  }
  const shapeKind: ShapeKind = tool;
  const shape: ShapeNodeType = {
    id,
    type: "shape",
    position,
    data: {
      kind: "shape",
      shapeKind,
      label: shapeKind.charAt(0).toUpperCase() + shapeKind.slice(1),
    },
  };
  return shape;
}

export function addAttributeRow(entity: EntityNodeType): EntityNodeType {
  const attribute: EntityAttribute = {
    id: newId(),
    name: "",
    dataType: "",
    isPrimaryKey: false,
    customValues: {},
  };
  return {
    ...entity,
    data: {
      ...entity.data,
      attributes: [...entity.data.attributes, attribute],
    },
  };
}

export function removeAttributeRow(
  entity: EntityNodeType,
  attributeId: string,
): EntityNodeType {
  return {
    ...entity,
    data: {
      ...entity.data,
      attributes: entity.data.attributes.filter((a) => a.id !== attributeId),
    },
  };
}

export function updateAttributeRow(
  entity: EntityNodeType,
  attributeId: string,
  changes: Partial<Pick<EntityAttribute, "name" | "dataType">>,
): EntityNodeType {
  return {
    ...entity,
    data: {
      ...entity.data,
      attributes: entity.data.attributes.map((a) =>
        a.id === attributeId ? { ...a, ...changes } : a,
      ),
    },
  };
}

export function updateAttributeCustomValue(
  entity: EntityNodeType,
  attributeId: string,
  columnId: string,
  value: string,
): EntityNodeType {
  return {
    ...entity,
    data: {
      ...entity.data,
      attributes: entity.data.attributes.map((a) =>
        a.id === attributeId
          ? { ...a, customValues: { ...a.customValues, [columnId]: value } }
          : a,
      ),
    },
  };
}

export function createEntityColumn(
  columns: readonly EntityColumn[],
): EntityColumn[] {
  return [...columns, { id: newId(), label: "" }];
}

export function renameEntityColumn(
  columns: readonly EntityColumn[],
  columnId: string,
  label: string,
): EntityColumn[] {
  return columns.map((c) => (c.id === columnId ? { ...c, label } : c));
}

// Leaves the now-orphaned key in each attribute's customValues alone —
// harmless unused data, and simpler than reaching into every entity node to
// strip it out.
export function removeEntityColumn(
  columns: readonly EntityColumn[],
  columnId: string,
): EntityColumn[] {
  return columns.filter((c) => c.id !== columnId);
}

export function togglePrimaryKey(
  entity: EntityNodeType,
  attributeId: string,
): EntityNodeType {
  return {
    ...entity,
    data: {
      ...entity.data,
      attributes: entity.data.attributes.map((a) =>
        a.id === attributeId ? { ...a, isPrimaryKey: !a.isPrimaryKey } : a,
      ),
    },
  };
}

export function renameNode<T extends ErdNode>(node: T, name: string): T {
  if (node.data.kind === "entity")
    return { ...node, data: { ...node.data, name } };
  if (node.data.kind === "shape")
    return { ...node, data: { ...node.data, label: name } };
  return { ...node, data: { ...node.data, text: name } };
}

// A self-edge would be a degenerate loop the notation UI can't meaningfully
// represent, so it's refused at creation rather than allowed and hidden.
export function createEdgeBetween(
  sourceId: string,
  targetId: string,
  bendPoints: EdgePoint[] = [],
  targetAnchor?: EdgeAnchor,
): ErdEdge | null {
  if (sourceId === targetId) return null;
  return {
    id: newId(),
    type: "crowsFoot",
    source: sourceId,
    target: targetId,
    data: {
      sourceCardinality: "none",
      targetCardinality: "none",
      bendPoints,
      ...(targetAnchor ? { targetAnchor } : {}),
    },
  };
}

export function toggleCardinality(
  edge: ErdEdge,
  end: "source" | "target",
  value: Cardinality,
): ErdEdge {
  return {
    ...edge,
    data: {
      sourceCardinality:
        end === "source" ? value : (edge.data?.sourceCardinality ?? "none"),
      targetCardinality:
        end === "target" ? value : (edge.data?.targetCardinality ?? "none"),
      bendPoints: edge.data?.bendPoints ?? [],
    },
  };
}

export function setEdgeBendPoints(
  edge: ErdEdge,
  bendPoints: EdgePoint[],
): ErdEdge {
  return {
    ...edge,
    data: {
      sourceCardinality: edge.data?.sourceCardinality ?? "none",
      targetCardinality: edge.data?.targetCardinality ?? "none",
      bendPoints,
    },
  };
}

export function removeNode(
  nodes: readonly ErdNode[],
  edges: readonly ErdEdge[],
  nodeId: string,
): { nodes: ErdNode[]; edges: ErdEdge[] } {
  return {
    nodes: nodes.filter((n) => n.id !== nodeId),
    edges: edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
  };
}

export function removeEdge(
  edges: readonly ErdEdge[],
  edgeId: string,
): ErdEdge[] {
  return edges.filter((e) => e.id !== edgeId);
}
