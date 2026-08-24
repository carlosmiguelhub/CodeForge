"use client";

import { Position, type NodeProps } from "@xyflow/react";
import type { KeyboardEvent } from "react";

import { useErdInteraction } from "../erd-interaction-context";
import type { TextNodeType } from "../types";
import { ConnectionHandle } from "./connection-handle";

export function TextNode({ id, data, selected }: NodeProps<TextNodeType>) {
  const interaction = useErdInteraction();
  const isPendingSource = interaction.pendingConnectionSourceId === id;
  const isRenaming = interaction.editingNodeId === id;

  return (
    <div
      className={`${selected ? "border-action" : "border-transparent"} ${isPendingSource ? "ring-action ring-2" : ""} rounded-control group/node min-w-24 border border-dashed px-2 py-1`}
      onDoubleClick={() => interaction.startRenamingNode(id)}
    >
      <ConnectionHandle
        nodeId={id}
        position={Position.Top}
        selected={selected}
      />
      {isRenaming ? (
        <textarea
          autoFocus
          defaultValue={data.text}
          rows={2}
          className="nodrag border-action bg-elevated text-ink-secondary w-full resize-none border-b text-xs outline-none"
          onBlur={(event) =>
            interaction.commitNodeName(id, event.currentTarget.value)
          }
          onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
            if (event.key === "Escape") interaction.cancelEditing();
          }}
        />
      ) : (
        <p className="text-ink-secondary max-w-48 text-xs whitespace-pre-wrap">
          {data.text}
        </p>
      )}
    </div>
  );
}
