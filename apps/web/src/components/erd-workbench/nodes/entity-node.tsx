"use client";

import { Position, type NodeProps } from "@xyflow/react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import type { KeyboardEvent } from "react";

import { useErdInteraction } from "../erd-interaction-context";
import type { EntityColumn, EntityNodeType } from "../types";
import { ConnectionHandle } from "./connection-handle";

const handles = [Position.Top, Position.Right, Position.Bottom, Position.Left];

// Fixed name/type columns plus a slot per diagram-wide custom column — the
// box grows to fit rather than squeezing cells, since custom values (e.g.
// "nullable", "default") need real room to be legible.
const BASE_WIDTH = 224;
const CUSTOM_COLUMN_WIDTH = 60;

export function EntityNode({ id, data, selected }: NodeProps<EntityNodeType>) {
  const interaction = useErdInteraction();
  const isPendingSource = interaction.pendingConnectionSourceId === id;
  const isRenaming = interaction.editingNodeId === id;
  const columns = interaction.entityColumns;

  return (
    <div
      className={`${selected ? "border-action" : "border-structural"} ${isPendingSource ? "ring-action ring-2" : ""} bg-elevated rounded-control group/node border shadow-sm`}
      style={{ width: BASE_WIDTH + columns.length * CUSTOM_COLUMN_WIDTH }}
    >
      {handles.map((position) => (
        <ConnectionHandle
          key={position}
          nodeId={id}
          position={position}
          selected={selected}
        />
      ))}
      <div
        className="border-divider bg-elevated-high rounded-t-control border-b px-2 py-1.5"
        onDoubleClick={() => interaction.startRenamingNode(id)}
      >
        {isRenaming ? (
          <input
            autoFocus
            defaultValue={data.name}
            className="nodrag border-action bg-elevated text-ink-primary w-full border-b px-1 text-xs font-semibold outline-none"
            onBlur={(event) =>
              interaction.commitNodeName(id, event.currentTarget.value)
            }
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") interaction.cancelEditing();
            }}
          />
        ) : (
          <p className="text-ink-primary truncate text-xs font-semibold">
            {data.name}
          </p>
        )}
      </div>
      <div className="p-1">
        {columns.length > 0 ? (
          <div className="text-ink-muted flex items-center gap-1 px-1 pb-1 text-[9px] font-semibold uppercase">
            <span className="size-5 shrink-0" />
            <span className="min-w-0 flex-1">Name</span>
            <span className="w-20 shrink-0">Type</span>
            {columns.map((column) => (
              <ColumnHeaderCell key={column.id} nodeId={id} column={column} />
            ))}
          </div>
        ) : null}
        {data.attributes.map((attribute) => (
          <AttributeRow
            key={attribute.id}
            nodeId={id}
            attribute={attribute}
            columns={columns}
          />
        ))}
        <div className="flex items-center gap-1">
          <button
            onClick={() => interaction.addAttribute(id)}
            className="nodrag text-ink-muted hover:bg-elevated-high rounded-control flex min-h-7 flex-1 items-center gap-1.5 px-2 text-[10px]"
          >
            <Plus aria-hidden="true" size={11} /> Add attribute
          </button>
          <button
            onClick={() => interaction.addEntityColumn(id)}
            aria-label="Add column"
            title="Add column"
            className="nodrag text-ink-muted hover:bg-elevated-high hover:text-ink-primary rounded-control grid size-7 shrink-0 place-items-center"
          >
            <Plus aria-hidden="true" size={11} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AttributeRow({
  nodeId,
  attribute,
  columns,
}: Readonly<{
  nodeId: string;
  attribute: {
    id: string;
    name: string;
    dataType: string;
    isPrimaryKey: boolean;
    customValues?: Record<string, string>;
  };
  columns: readonly EntityColumn[];
}>) {
  const interaction = useErdInteraction();
  const editingCell = interaction.editingCell;
  const isEditingName =
    editingCell?.nodeId === nodeId &&
    editingCell.attributeId === attribute.id &&
    editingCell.field === "name";
  const isEditingType =
    editingCell?.nodeId === nodeId &&
    editingCell.attributeId === attribute.id &&
    editingCell.field === "dataType";

  return (
    <div className="group hover:bg-elevated-high rounded-control flex min-h-7 items-center gap-1 px-1 text-[11px]">
      <button
        onClick={() => interaction.togglePrimaryKey(nodeId, attribute.id)}
        aria-label={
          attribute.isPrimaryKey ? "Unset primary key" : "Set primary key"
        }
        aria-pressed={attribute.isPrimaryKey}
        className="nodrag grid size-5 shrink-0 place-items-center"
      >
        <KeyRound
          aria-hidden="true"
          size={11}
          className={
            attribute.isPrimaryKey ? "text-warning" : "text-ink-disabled"
          }
        />
      </button>

      {isEditingName ? (
        <input
          autoFocus
          defaultValue={attribute.name}
          placeholder="name"
          className="nodrag border-action bg-elevated text-ink-primary min-w-0 flex-1 border-b px-0.5 outline-none"
          onBlur={(event) =>
            interaction.updateAttributeText(
              nodeId,
              attribute.id,
              "name",
              event.currentTarget.value,
            )
          }
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") interaction.cancelEditing();
          }}
        />
      ) : (
        <button
          onDoubleClick={() =>
            interaction.startEditingCell({
              nodeId,
              attributeId: attribute.id,
              field: "name",
            })
          }
          className="text-ink-secondary min-w-0 flex-1 truncate text-left"
        >
          {attribute.name || <span className="text-ink-disabled">name</span>}
        </button>
      )}

      {isEditingType ? (
        <input
          autoFocus
          list="erd-sql-types"
          defaultValue={attribute.dataType}
          placeholder="type"
          className="nodrag border-action bg-elevated text-action-soft w-20 shrink-0 border-b px-0.5 font-mono text-[10px] outline-none"
          onBlur={(event) =>
            interaction.updateAttributeText(
              nodeId,
              attribute.id,
              "dataType",
              event.currentTarget.value,
            )
          }
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") interaction.cancelEditing();
          }}
        />
      ) : (
        <button
          onDoubleClick={() =>
            interaction.startEditingCell({
              nodeId,
              attributeId: attribute.id,
              field: "dataType",
            })
          }
          className="text-action-soft w-20 shrink-0 truncate text-left font-mono text-[10px]"
        >
          {attribute.dataType || (
            <span className="text-ink-disabled">type</span>
          )}
        </button>
      )}

      {columns.map((column) => (
        <CustomValueCell
          key={column.id}
          nodeId={nodeId}
          attributeId={attribute.id}
          columnId={column.id}
          value={attribute.customValues?.[column.id] ?? ""}
        />
      ))}

      <button
        onClick={() => interaction.removeAttribute(nodeId, attribute.id)}
        aria-label={`Remove ${attribute.name || "attribute"}`}
        className="nodrag text-ink-muted hover:text-danger hidden size-5 shrink-0 place-items-center group-hover:grid"
      >
        <Trash2 aria-hidden="true" size={10} />
      </button>
    </div>
  );
}

function CustomValueCell({
  nodeId,
  attributeId,
  columnId,
  value,
}: Readonly<{
  nodeId: string;
  attributeId: string;
  columnId: string;
  value: string;
}>) {
  const interaction = useErdInteraction();
  const editingCell = interaction.editingCell;
  const isEditing =
    editingCell?.nodeId === nodeId &&
    editingCell.attributeId === attributeId &&
    editingCell.field === "custom" &&
    editingCell.columnId === columnId;

  if (isEditing)
    return (
      <input
        autoFocus
        defaultValue={value}
        className="nodrag border-action bg-elevated text-ink-secondary w-14 shrink-0 border-b px-0.5 outline-none"
        onBlur={(event) =>
          interaction.updateAttributeCustomValue(
            nodeId,
            attributeId,
            columnId,
            event.currentTarget.value,
          )
        }
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === "Enter") event.currentTarget.blur();
          if (event.key === "Escape") interaction.cancelEditing();
        }}
      />
    );

  return (
    <button
      onDoubleClick={() =>
        interaction.startEditingCell({
          nodeId,
          attributeId,
          field: "custom",
          columnId,
        })
      }
      className="text-ink-secondary w-14 shrink-0 truncate text-left"
    >
      {value || <span className="text-ink-disabled">—</span>}
    </button>
  );
}

function ColumnHeaderCell({
  nodeId,
  column,
}: Readonly<{ nodeId: string; column: EntityColumn }>) {
  const interaction = useErdInteraction();
  // Columns are diagram-wide, so every entity renders a header cell for
  // this same column — gating on nodeId too (not just columnId) means only
  // the entity the user actually double-clicked shows the live input.
  // Without it, every entity would mount an autoFocus input for the same
  // column at once, and the last one to mount would steal focus from the
  // others, firing their blur handlers and clearing the edit immediately.
  const isEditing =
    interaction.editingColumnLabel?.nodeId === nodeId &&
    interaction.editingColumnLabel?.columnId === column.id;

  return (
    <div className="group/col flex w-14 shrink-0 items-center gap-0.5">
      {isEditing ? (
        <input
          autoFocus
          defaultValue={column.label}
          placeholder="label"
          className="nodrag border-action bg-elevated text-ink-primary min-w-0 flex-1 border-b px-0.5 text-[9px] font-semibold normal-case outline-none"
          onBlur={(event) =>
            interaction.commitEntityColumnLabel(
              column.id,
              event.currentTarget.value,
            )
          }
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") interaction.cancelEditing();
          }}
        />
      ) : (
        <button
          onDoubleClick={() =>
            interaction.startEditingColumnLabel(nodeId, column.id)
          }
          className="min-w-0 flex-1 truncate text-left"
        >
          {column.label || (
            <span className="text-ink-disabled normal-case">label</span>
          )}
        </button>
      )}
      <button
        onClick={() => interaction.removeEntityColumn(column.id)}
        aria-label={`Remove ${column.label || "column"} column`}
        className="nodrag text-ink-muted hover:text-danger hidden size-3.5 shrink-0 place-items-center group-hover/col:grid"
      >
        <Trash2 aria-hidden="true" size={9} />
      </button>
    </div>
  );
}

export const erdSqlTypeOptions = [
  "INT",
  "VARCHAR(255)",
  "TEXT",
  "BOOLEAN",
  "DATE",
  "DATETIME",
  "FLOAT",
  "DECIMAL",
] as const;
