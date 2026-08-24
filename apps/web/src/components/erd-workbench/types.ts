import type { Edge, Node, Position } from "@xyflow/react";

// The original four crow's-foot (ERD) values keep their original literal
// strings since diagrams already persisted with them. The rest are generic
// line-ending decorations (arrows, UML-style shapes) added alongside, so
// one end can mix e.g. a filled arrow with a plain crow's foot.
export type Cardinality =
  | "none"
  | "arrow-open"
  | "arrow-filled"
  | "arrow-block-open"
  | "arrow-block-filled"
  | "diamond-open"
  | "diamond-filled"
  | "square-open"
  | "square-filled"
  | "circle-open"
  | "circle-filled"
  | "one-bar"
  | "one"
  | "many"
  | "zero-or-one"
  | "zero-or-many";

// Diagram-wide, not per-entity — every entity table shows the same set of
// columns, the way a real schema's attribute properties (nullable, default,
// etc.) would apply uniformly rather than varying table to table.
export interface EntityColumn {
  readonly id: string;
  label: string;
}

export interface EntityAttribute {
  readonly id: string;
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  // Keyed by EntityColumn id. Optional (not just empty-object) because
  // diagrams persisted before this field existed load straight out of
  // localStorage with no `customValues` key at all — every reader must use
  // `attribute.customValues?.[columnId]`, never a direct index.
  customValues?: Record<string, string>;
}

export interface EntityNodeData extends Record<string, unknown> {
  readonly kind: "entity";
  name: string;
  attributes: EntityAttribute[];
}

export type ShapeKind = "rectangle" | "diamond" | "ellipse";

export interface ShapeNodeData extends Record<string, unknown> {
  readonly kind: "shape";
  shapeKind: ShapeKind;
  label: string;
}

export interface TextNodeData extends Record<string, unknown> {
  readonly kind: "text";
  text: string;
}

export type ErdNodeData = EntityNodeData | ShapeNodeData | TextNodeData;

export type EntityNodeType = Node<EntityNodeData, "entity">;
export type ShapeNodeType = Node<ShapeNodeData, "shape">;
export type TextNodeType = Node<TextNodeData, "text">;
export type ErdNode = EntityNodeType | ShapeNodeType | TextNodeType;

export interface EdgePoint {
  readonly x: number;
  readonly y: number;
}

// A specific point on a shape's own border — which side, plus how far
// along it (0 at the side's top/left corner, 1 at its bottom/right
// corner). Lets a connection land at exactly where it was clicked instead
// of always the same handful of fixed centers, so several connections
// into the same shape can spread out across its body rather than all
// converging on the same point.
export interface EdgeAnchor {
  readonly position: Position;
  readonly fraction: number;
}

export interface CrowsFootEdgeData extends Record<string, unknown> {
  sourceCardinality: Cardinality;
  targetCardinality: Cardinality;
  // Intermediate waypoints between the source and target boundary points,
  // in flow coordinates — lets a line be dragged around other shapes
  // instead of always being a single straight segment.
  bendPoints: EdgePoint[];
  // Where this end actually touches its shape. Absent on edges made
  // before this existed (or via the plain Connect-tool click, which has
  // no specific point to anchor to) — those fall back to the dynamic
  // "nearest boundary crossing" CrowsFootEdge already computed.
  targetAnchor?: EdgeAnchor;
}
export type ErdEdge = Edge<CrowsFootEdgeData, "crowsFoot">;

export interface PersistedErdDiagram {
  nodes: ErdNode[];
  edges: ErdEdge[];
  viewport: { x: number; y: number; zoom: number };
  entityColumns: EntityColumn[];
}
