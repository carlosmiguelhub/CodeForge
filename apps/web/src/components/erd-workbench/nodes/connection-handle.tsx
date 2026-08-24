"use client";

import { Handle, type Position } from "@xyflow/react";
import type { MouseEvent as ReactMouseEvent } from "react";

import { useErdInteraction } from "../erd-interaction-context";

// A small dot on the node's border, revealed on hover (or while the node
// is selected), that starts (or finishes) a connection on click — the
// "grab a dot, stretch a line, drop on another shape" gesture from
// Lucidchart, but click-armed rather than click-and-hold: click once to
// arm it, the line then follows the cursor with no button held, click
// empty canvas to drop a waypoint and keep going, click another shape's
// dot (or anywhere on it) to finish. See ErdWorkbenchInner's
// pendingConnection state for the rest of the flow.
//
// isConnectable stays false — React Flow's own built-in handle-drag would
// otherwise start its own connection state machine on the same mousedown,
// racing this component's click handling. React Flow's own stylesheet
// sets `pointer-events: none` on any handle that isn't actively
// connecting (only `.connectingfrom`/`.connectionindicator` get
// `pointer-events: all`, and isConnectable=false means neither class is
// ever applied) — pointer-events-auto below overrides that so this
// component's own onClick can actually receive the click.
//
// Every node's own root element must carry `group/node` for the hover
// reveal to target — a *named* group, since entity rows already use an
// unnamed `group` for their own hover-reveal delete button, and reusing
// that name here would make hovering anywhere on the entity light up
// every row's delete button too.
export function ConnectionHandle({
  nodeId,
  position,
  selected,
}: Readonly<{ nodeId: string; position: Position; selected: boolean }>) {
  const interaction = useErdInteraction();
  const armed = interaction.pendingConnectionSourceId !== null;
  // This exact dot is what a click would connect to right now — see
  // pendingConnectionAlignedTarget in erd-workbench.tsx. Grown and filled
  // solid instead of just the usual hollow ring, so it's unmistakable
  // which dot the guide line actually locked onto.
  const isAlignedTarget =
    interaction.pendingConnectionAlignedTarget?.nodeId === nodeId &&
    interaction.pendingConnectionAlignedTarget?.position === position;

  function onClick(event: ReactMouseEvent) {
    event.stopPropagation();
    if (!interaction.pendingConnectionSourceId) {
      interaction.startPendingConnection(nodeId, position);
    } else if (interaction.pendingConnectionSourceId === nodeId) {
      interaction.cancelEditing();
    } else {
      interaction.finishPendingConnection(nodeId, position);
    }
  }

  return (
    <Handle
      id={position}
      type="source"
      position={position}
      isConnectable={false}
      onClick={onClick}
      className={`!pointer-events-auto !cursor-pointer !rounded-full !border-2 transition-all ${
        isAlignedTarget
          ? "!border-action !bg-action !size-4 opacity-100"
          : `!border-action !bg-elevated !size-3 ${
              selected || armed
                ? "opacity-100"
                : "opacity-0 group-hover/node:opacity-100"
            }`
      }`}
    />
  );
}
