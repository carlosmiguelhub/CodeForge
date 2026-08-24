"use client";

import { Position, type NodeProps } from "@xyflow/react";
import type { KeyboardEvent } from "react";

import { useErdInteraction } from "../erd-interaction-context";
import type { ShapeKind, ShapeNodeType } from "../types";
import { ConnectionHandle } from "./connection-handle";

const handles = [Position.Top, Position.Right, Position.Bottom, Position.Left];

const shapeClassName: Readonly<Record<ShapeKind, string>> = {
  rectangle: "rounded-control",
  diamond: "",
  ellipse: "rounded-full",
};

const shapeSize: Readonly<Record<ShapeKind, string>> = {
  rectangle: "h-16 w-36",
  diamond: "h-24 w-24",
  ellipse: "h-20 w-36",
};

// clip-path (not a rotated box) so React Flow's handle positions and
// selection outline stay aligned with the visible shape instead of a
// rotated bounding box that no longer matches them.
const diamondClipPath = "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)";

export function ShapeNode({ id, data, selected }: NodeProps<ShapeNodeType>) {
  const interaction = useErdInteraction();
  const isPendingSource = interaction.pendingConnectionSourceId === id;
  const isRenaming = interaction.editingNodeId === id;

  return (
    <div
      className={`${shapeSize[data.shapeKind]} ${shapeClassName[data.shapeKind]} ${selected ? "border-action" : "border-structural"} ${isPendingSource ? "ring-action ring-2" : ""} bg-elevated group/node grid place-items-center border shadow-sm`}
      style={
        data.shapeKind === "diamond" ? { clipPath: diamondClipPath } : undefined
      }
      onDoubleClick={() => interaction.startRenamingNode(id)}
    >
      {handles.map((position) => (
        <ConnectionHandle
          key={position}
          nodeId={id}
          position={position}
          selected={selected}
        />
      ))}
      <div className="px-2 text-center">
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={data.label}
            className="nodrag border-action bg-elevated text-ink-primary w-full border-b text-center text-xs outline-none"
            onBlur={(event) =>
              interaction.commitNodeName(id, event.currentTarget.value)
            }
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") interaction.cancelEditing();
            }}
          />
        ) : (
          <p className="text-ink-primary truncate text-xs font-medium">
            {data.label}
          </p>
        )}
      </div>
    </div>
  );
}
