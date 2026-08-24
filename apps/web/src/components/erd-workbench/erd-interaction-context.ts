import type { Position } from "@xyflow/react";
import { createContext, useContext } from "react";

import type { ToolId } from "./tools";
import type { Cardinality, EdgePoint, EntityColumn } from "./types";

export interface EditingCell {
  readonly nodeId: string;
  readonly attributeId: string;
  readonly field: "name" | "dataType" | "custom";
  // Only set (and only meaningful) when field is "custom" — which of the
  // diagram's entity columns this cell belongs to.
  readonly columnId?: string;
}

// Header-label editing has no attribute row to key off, so it's tracked
// separately from EditingCell rather than shoehorned into it. Columns are
// diagram-wide, so every entity renders a header cell for the same column
// — nodeId records which entity's copy is showing the live input, so only
// one renders it. (Without this, every entity would mount an autoFocus
// input for the same column at once; the last one to mount would steal
// focus from the others, firing their blur handlers and committing/
// clearing the edit before the user could type anything.)
export interface EditingColumnLabel {
  readonly nodeId: string;
  readonly columnId: string;
}

export interface ErdInteractionValue {
  readonly activeTool: ToolId;
  readonly pendingConnectionSourceId: string | null;
  // Which specific dot armed the connection, if any — lets the preview
  // line anchor to that exact point instead of a recomputed guess. Null
  // when a connection was started via the click-the-node-body Connect
  // tool instead of a dot, which has no specific handle to anchor to.
  readonly pendingConnectionSourcePosition: Position | null;
  // Set once the armed line's locked axis comes near another shape's own
  // dot — that dot is what a click will actually connect to right now,
  // used to give it (and the preview line) a distinct "you're aimed at
  // this" highlight before you commit.
  readonly pendingConnectionAlignedTarget: {
    nodeId: string;
    position: Position;
  } | null;
  readonly editingNodeId: string | null;
  readonly editingCell: EditingCell | null;
  readonly editingColumnLabel: EditingColumnLabel | null;
  readonly entityColumns: readonly EntityColumn[];
  startRenamingNode(id: string): void;
  commitNodeName(id: string, name: string): void;
  cancelEditing(): void;
  startEditingCell(cell: EditingCell): void;
  addAttribute(nodeId: string): void;
  removeAttribute(nodeId: string, attributeId: string): void;
  updateAttributeText(
    nodeId: string,
    attributeId: string,
    field: "name" | "dataType",
    value: string,
  ): void;
  updateAttributeCustomValue(
    nodeId: string,
    attributeId: string,
    columnId: string,
    value: string,
  ): void;
  togglePrimaryKey(nodeId: string, attributeId: string): void;
  addEntityColumn(nodeId: string): void;
  startEditingColumnLabel(nodeId: string, columnId: string): void;
  commitEntityColumnLabel(columnId: string, label: string): void;
  removeEntityColumn(columnId: string): void;
  setEdgeCardinality(
    edgeId: string,
    end: "source" | "target",
    value: Cardinality,
  ): void;
  setEdgeBendPoints(edgeId: string, bendPoints: EdgePoint[]): void;
  // Click-driven connection drawing: click a dot to arm it (line follows
  // the cursor from then on, no button held), click empty canvas to drop a
  // waypoint and keep going, click another shape's dot to finish. Lets a
  // connector reach a diagonally-placed target as clean routed segments
  // instead of one diagonal line cutting across whatever's in between.
  startPendingConnection(nodeId: string, position?: Position): void;
  finishPendingConnection(nodeId: string, position?: Position): void;
}

// Node/edge components only receive their own `data` via React Flow's
// NodeProps/EdgeProps — mutation callbacks and transient selection/editing
// state (never persisted to localStorage) travel through this context
// instead, so `data` stays pure, JSON-serializable diagram content.
export const ErdInteractionContext = createContext<ErdInteractionValue | null>(
  null,
);

export function useErdInteraction(): ErdInteractionValue {
  const value = useContext(ErdInteractionContext);
  if (!value)
    throw new Error(
      "useErdInteraction must be used inside ErdInteractionContext.Provider.",
    );
  return value;
}
