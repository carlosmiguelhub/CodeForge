import type { WorkspaceSchemaResponse } from "@sqweb/contracts";

import { randomId } from "@/lib/random-id";

import {
  ENTITY_FALLBACK_WIDTH,
  estimateEntityHeightForAttributeCount,
} from "./edges/edge-geometry";
import type {
  Cardinality,
  EdgePoint,
  EntityNodeType,
  ErdEdge,
  PersistedErdDiagram,
} from "./types";

type SchemaTable = WorkspaceSchemaResponse["tables"][number];

const LAYER_GAP = 140; // horizontal channel between parent/child columns
const STACK_GAP = 80; // vertical gap between entities sharing a column
// The narrowest internal gap (between two entities sharing a column) a
// skip-layer connection is willing to thread through, rather than detouring
// around the outside — comfortably under STACK_GAP so a normal stack gap
// qualifies.
const MIN_CORRIDOR_WIDTH = 40;
// How far above/below the outermost entity in a column a skip-layer
// connection detours when no internal gap is usable (a lone entity filling
// the row, say) — a fallback, not the common case.
const CORRIDOR_OUTER_MARGIN = 50;
const SKIP_LAYER_STAGGER = 16;
// When several connections share the same gap between two columns, each gets
// its own vertical-jog position within that gap so their jogs don't run
// on top of each other.
const GAP_ROUTING_STAGGER = 12;

// Every table's *longest path* to a table it references, e.g. departments
// (references nothing) is row 0; instructors/students (reference
// departments) are row 1; courses (references both departments AND
// instructors) is row 2 — one past whichever of its parents is furthest
// out. Ties are broken by first-seen order. A cycle (rare — a pair of FKs
// pointing at each other) can't be assigned a strictly-increasing row, so
// `visiting` breaks it by treating the table being re-entered as if it had
// no unresolved parents left, rather than recursing forever.
function computeRows(
  tableNames: readonly string[],
  referencedTablesByName: ReadonlyMap<string, readonly string[]>,
): Map<string, number> {
  const rowOf = new Map<string, number>();
  const visiting = new Set<string>();

  function resolve(name: string): number {
    const cached = rowOf.get(name);
    if (cached !== undefined) return cached;
    if (visiting.has(name)) return 0; // cycle — don't recurse forever
    visiting.add(name);
    let maxParentRow = -1;
    for (const parent of referencedTablesByName.get(name) ?? []) {
      if (parent === name) continue; // self-reference
      if (!referencedTablesByName.has(parent)) continue; // outside this schema
      maxParentRow = Math.max(maxParentRow, resolve(parent));
    }
    visiting.delete(name);
    const row = maxParentRow + 1;
    rowOf.set(name, row);
    return row;
  }

  for (const name of tableNames) resolve(name);
  return rowOf;
}

interface Span {
  readonly start: number;
  readonly end: number;
}

interface TableLayout {
  positions: Map<string, { x: number; y: number }>;
  heightByName: Map<string, number>;
  layerOf: Map<string, number>;
  // Every entity's horizontal span within each row, sorted left to right —
  // used to find a gap a skip-row connection can thread through instead of
  // detouring around the outside of the whole diagram.
  layerSpans: Span[][];
}

// Relationship-aware auto-layout for a freshly reverse-engineered diagram.
// Parent tables sit in the left column, with each table one column to the
// right of everything it references. A plain
// index-order grid (the original approach) had no idea which tables were
// related, so an unrelated table could easily land directly between two
// tables that reference each other. Within a row, a few barycenter passes
// (pull each table toward the average position of everything it's
// connected to, wherever that neighbor ended up) settle related tables
// near each other instead of in their arbitrary schema order.
function layoutTables(tables: readonly SchemaTable[]): TableLayout {
  const tableNames = tables.map((table) => table.name);
  const referencedTablesByName = new Map<string, readonly string[]>(
    tables.map((table) => [
      table.name,
      [
        ...new Set(
          table.columns
            .map((column) => column.references?.table)
            .filter((name): name is string => Boolean(name)),
        ),
      ],
    ]),
  );
  const rowOf = computeRows(tableNames, referencedTablesByName);

  const rows: string[][] = [];
  for (const name of tableNames) {
    const row = rowOf.get(name) ?? 0;
    (rows[row] ??= []).push(name);
  }

  // Undirected: a table's position should be pulled toward every table
  // it's related to, not just the ones it references.
  const neighborsByName = new Map<string, Set<string>>();
  function link(a: string, b: string) {
    if (!neighborsByName.has(a)) neighborsByName.set(a, new Set());
    if (!neighborsByName.has(b)) neighborsByName.set(b, new Set());
    neighborsByName.get(a)!.add(b);
    neighborsByName.get(b)!.add(a);
  }
  for (const [name, referenced] of referencedTablesByName) {
    for (const parent of referenced) if (parent !== name) link(name, parent);
  }

  const orderIndex = new Map<string, number>();
  function refreshOrderIndex() {
    orderIndex.clear();
    for (const row of rows)
      row.forEach((name, index) => orderIndex.set(name, index));
  }
  refreshOrderIndex();

  const BARYCENTER_PASSES = 4;
  for (let pass = 0; pass < BARYCENTER_PASSES; pass++) {
    for (const row of rows) {
      if (row.length <= 1) continue;
      const scored = row.map((name) => {
        const neighbors = neighborsByName.get(name);
        const known = [...(neighbors ?? [])].filter((other) =>
          orderIndex.has(other),
        );
        const score = known.length
          ? known.reduce((sum, other) => sum + orderIndex.get(other)!, 0) /
            known.length
          : (orderIndex.get(name) ?? 0);
        return { name, score };
      });
      scored.sort((a, b) => a.score - b.score);
      scored.forEach((entry, index) => (row[index] = entry.name));
    }
    refreshOrderIndex();
  }

  const positions = new Map<string, { x: number; y: number }>();
  const heightByName = new Map(
    tables.map((table) => [
      table.name,
      estimateEntityHeightForAttributeCount(table.columns.length),
    ]),
  );
  const layerSpans: Span[][] = [];
  const tallestLayer = Math.max(
    0,
    ...rows.map(
      (layer) =>
        layer.reduce((sum, name) => sum + (heightByName.get(name) ?? 0), 0) +
        Math.max(0, layer.length - 1) * STACK_GAP,
    ),
  );

  // Layers become left-to-right columns. Within each column, tables sit near
  // the vertical centre of their already-positioned parents. This produces a
  // wide textbook layout and reserves the right/left sides for notation.
  rows.forEach((layerTables, layerIndex) => {
    const layerHeight =
      layerTables.reduce(
        (sum, name) => sum + (heightByName.get(name) ?? 0),
        0,
      ) +
      Math.max(0, layerTables.length - 1) * STACK_GAP;
    const centredStart = (tallestLayer - layerHeight) / 2;
    let fallbackY = centredStart;
    const desiredTop = layerTables.map((name) => {
      const height = heightByName.get(name) ?? 0;
      const positionedParents = (referencedTablesByName.get(name) ?? [])
        .map((parent) => ({ name: parent, position: positions.get(parent) }))
        .filter(
          (
            entry,
          ): entry is {
            name: string;
            position: { x: number; y: number };
          } => Boolean(entry.position),
        );
      if (positionedParents.length === 0) {
        const top = fallbackY;
        fallbackY += height + STACK_GAP;
        return top;
      }
      const parentCenter =
        positionedParents.reduce(
          (sum, parent) =>
            sum + parent.position.y + (heightByName.get(parent.name) ?? 0) / 2,
          0,
        ) / positionedParents.length;
      return parentCenter - height / 2;
    });
    const placedTop: number[] = [];
    desiredTop.forEach((desired, index) => {
      const previousName = layerTables[index - 1];
      placedTop[index] = Math.max(
        desired,
        index === 0
          ? -Infinity
          : placedTop[index - 1]! +
              (heightByName.get(previousName!) ?? 0) +
              STACK_GAP,
      );
    });
    // The collision pass only pushes downward. Re-centre the completed
    // column on its desired positions while preserving every established gap.
    const shift =
      desiredTop.reduce((sum, value) => sum + value, 0) / desiredTop.length -
      placedTop.reduce((sum, value) => sum + value, 0) / placedTop.length;
    const spans: Span[] = [];
    layerTables.forEach((name, index) => {
      const y = placedTop[index]! + shift;
      const height = heightByName.get(name) ?? 0;
      positions.set(name, {
        x: layerIndex * (ENTITY_FALLBACK_WIDTH + LAYER_GAP),
        y,
      });
      spans.push({ start: y, end: y + height });
    });
    layerSpans[layerIndex] = spans;
  });

  const minimumY = Math.min(0, ...[...positions.values()].map(({ y }) => y));
  if (minimumY < 0) {
    const offsetY = -minimumY;
    for (const [name, position] of positions) {
      positions.set(name, { ...position, y: position.y + offsetY });
    }
    layerSpans.forEach((spans, layerIndex) => {
      layerSpans[layerIndex] = spans.map((span) => ({
        start: span.start + offsetY,
        end: span.end + offsetY,
      }));
    });
  }

  return { positions, heightByName, layerOf: rowOf, layerSpans };
}

// A point evenly spaced across a box's own width, so several connections
// leaving (or entering) the same side of the same box each get their own
// distinct spot instead of all converging on its exact center — the same
// idea as a real ER diagram spreading its "1" labels across a table's
// border rather than stacking them on top of each other. Degrades to the
// exact center when there's only one.
function distributeAcrossHeight(
  topY: number,
  height: number,
  index: number,
  total: number,
): number {
  const fraction = (index + 1) / (total + 1);
  return topY + height * fraction;
}

interface RawEdge {
  readonly sourceTable: string;
  readonly targetTable: string;
  readonly sourceCardinality: Cardinality;
  readonly targetCardinality: Cardinality;
}

// Overlapping/touching spans collapsed into their outer bounds, so a gap
// search never mistakes two spans with no real space between them (or that
// literally overlap, across different intermediate columns) for a usable gap.
function mergeSpans(spans: readonly Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last && span.start <= last.end) {
      merged[merged.length - 1] = {
        start: last.start,
        end: Math.max(last.end, span.end),
      };
    } else {
      merged.push(span);
    }
  }
  return merged;
}

// Where a skip-layer connection can safely run horizontally through every
// column it passes over: a vertical gap between two entities in those columns,
// or, failing that, just above/below the outermost entity across all of
// them. An internal gap always wins when one exists — even if it isn't the
// single closest candidate to the direct line between the
// two ends), it's a short local detour rather than a jog out past the
// whole diagram, which is what going around the outside means. Ties
// between multiple internal gaps (or between the two outer fallbacks) are
// broken by closeness to `preferredX`.
function findCorridorCoordinate(
  occupiedSpans: readonly Span[],
  preferred: number,
): number {
  const merged = mergeSpans(occupiedSpans);
  if (merged.length === 0) return preferred;
  const internalGaps: number[] = [];
  for (let i = 0; i < merged.length - 1; i++) {
    const gapWidth = merged[i + 1]!.start - merged[i]!.end;
    if (gapWidth >= MIN_CORRIDOR_WIDTH) {
      internalGaps.push((merged[i]!.end + merged[i + 1]!.start) / 2);
    }
  }
  const candidates =
    internalGaps.length > 0
      ? internalGaps
      : [
          merged[0]!.start - CORRIDOR_OUTER_MARGIN,
          merged.at(-1)!.end + CORRIDOR_OUTER_MARGIN,
        ];
  return candidates.reduce((best, candidate) =>
    Math.abs(candidate - preferred) < Math.abs(best - preferred)
      ? candidate
      : best,
  );
}

// Every bend point set below pins its first entry to the source's exact
// exit point and its last to the target's exact entry point — CrowsFootEdge
// clips toward the first/last bend point from each node's center, and a
// point that lies exactly on that node's own right/left edge (not offset
// even slightly) clips to itself exactly with no drift toward the center.
// Everything in
// between is a plain right-angle bend.
function routeEdge(
  exitY: number,
  sourceRightX: number,
  entryY: number,
  targetLeftX: number,
  sourceLayer: number,
  targetLayer: number,
  skippedLayerSpans: readonly Span[],
  gapEdgeIndex: (gapKey: string) => number,
  skipEdgeIndex: () => number,
): EdgePoint[] {
  if (targetLayer - sourceLayer === 1) {
    if (exitY === entryY) {
      return [
        { x: sourceRightX, y: exitY },
        { x: targetLeftX, y: entryY },
      ];
    }
    const gapKey = `${sourceLayer}`;
    const laneIndex = gapEdgeIndex(gapKey);
    const staggerDirection = laneIndex % 2 === 0 ? 1 : -1;
    const staggerDistance = Math.ceil(laneIndex / 2) * GAP_ROUTING_STAGGER;
    const routingX =
      (sourceRightX + targetLeftX) / 2 + staggerDirection * staggerDistance;
    return [
      { x: sourceRightX, y: exitY },
      { x: routingX, y: exitY },
      { x: routingX, y: entryY },
      { x: targetLeftX, y: entryY },
    ];
  }

  const preferredY = (exitY + entryY) / 2;
  const corridorY =
    findCorridorCoordinate(skippedLayerSpans, preferredY) +
    skipEdgeIndex() * SKIP_LAYER_STAGGER;
  const sourceLaneX = sourceRightX + LAYER_GAP / 3;
  const targetLaneX = targetLeftX - LAYER_GAP / 3;
  return [
    { x: sourceRightX, y: exitY },
    { x: sourceLaneX, y: exitY },
    { x: sourceLaneX, y: corridorY },
    { x: targetLaneX, y: corridorY },
    { x: targetLaneX, y: entryY },
    { x: targetLeftX, y: entryY },
  ];
}

export function schemaToErdContent(
  schema: WorkspaceSchemaResponse,
): PersistedErdDiagram {
  const tables = schema.tables.filter((table) => table.type === "table");
  const nodeIdByTable = new Map(
    tables.map((table) => [table.name, randomId()]),
  );
  const { positions, heightByName, layerOf, layerSpans } = layoutTables(tables);

  const nodes: EntityNodeType[] = tables.map((table) => ({
    id: nodeIdByTable.get(table.name)!,
    type: "entity",
    position: positions.get(table.name) ?? { x: 0, y: 0 },
    data: {
      kind: "entity",
      name: table.name,
      attributes: table.columns.map((column) => ({
        id: randomId(),
        name: column.name,
        dataType: column.dataType,
        isPrimaryKey: column.key === "PRI",
        customValues: {},
      })),
    },
  }));

  const rawEdges: RawEdge[] = [];
  for (const table of tables) {
    for (const column of table.columns) {
      if (!column.references) continue;
      if (!nodeIdByTable.has(column.references.table)) continue;
      // The mark drawn at each end answers "for one row on the OTHER end,
      // how many rows on THIS end relate to it":
      //  - Near the parent (source): how many parents does one child row
      //    have? Always at most one (that's what a FK is) — mandatory
      //    ("one") when the FK column is NOT NULL, optional
      //    ("zero-or-one") when it's nullable, since a NULL FK means this
      //    child row has no parent at all.
      //  - Near the child (target): how many children does one parent row
      //    have? A plain FK never caps this — even a NOT NULL FK only
      //    guarantees each *child* has a parent, not that each *parent*
      //    has a child — so it's "zero-or-many", unless the FK column is
      //    itself UNIQUE/PRIMARY, which caps it at one ("zero-or-one").
      const isChildFkUnique = column.key === "UNI" || column.key === "PRI";
      rawEdges.push({
        sourceTable: column.references.table,
        targetTable: table.name,
        sourceCardinality: column.nullable ? "zero-or-one" : "one",
        targetCardinality: isChildFkUnique ? "zero-or-one" : "zero-or-many",
      });
    }
  }

  const exitTotals = new Map<string, number>();
  const entryTotals = new Map<string, number>();
  for (const edge of rawEdges) {
    exitTotals.set(
      edge.sourceTable,
      (exitTotals.get(edge.sourceTable) ?? 0) + 1,
    );
    entryTotals.set(
      edge.targetTable,
      (entryTotals.get(edge.targetTable) ?? 0) + 1,
    );
  }
  // Assign ports by the visual position of the table at the other end, not
  // by database/schema iteration order. If the upper destination gets
  // the upper port (and likewise on entry), connections do not swap
  // order and cross immediately outside an entity.
  const centerY = (tableName: string) =>
    (positions.get(tableName)?.y ?? 0) + (heightByName.get(tableName) ?? 0) / 2;
  const exitIndex = new Map<RawEdge, number>();
  const entryIndex = new Map<RawEdge, number>();
  for (const sourceTable of exitTotals.keys()) {
    rawEdges
      .filter((edge) => edge.sourceTable === sourceTable)
      .sort(
        (a, b) =>
          centerY(a.targetTable) - centerY(b.targetTable) ||
          (layerOf.get(a.targetTable) ?? 0) - (layerOf.get(b.targetTable) ?? 0),
      )
      .forEach((edge, index) => exitIndex.set(edge, index));
  }
  for (const targetTable of entryTotals.keys()) {
    rawEdges
      .filter((edge) => edge.targetTable === targetTable)
      .sort(
        (a, b) =>
          centerY(a.sourceTable) - centerY(b.sourceTable) ||
          (layerOf.get(a.sourceTable) ?? 0) - (layerOf.get(b.sourceTable) ?? 0),
      )
      .forEach((edge, index) => entryIndex.set(edge, index));
  }
  function nextIndex(used: Map<string, number>, key: string): number {
    const index = used.get(key) ?? 0;
    used.set(key, index + 1);
    return index;
  }
  const gapEdgeUsed = new Map<string, number>();
  let skipEdgeCount = 0;

  const edges: ErdEdge[] = rawEdges.map((raw) => {
    const sourceLayer = layerOf.get(raw.sourceTable) ?? 0;
    const targetLayer = layerOf.get(raw.targetTable) ?? 0;
    const sourcePosition = positions.get(raw.sourceTable) ?? { x: 0, y: 0 };
    const targetPosition = positions.get(raw.targetTable) ?? { x: 0, y: 0 };
    const exitY = distributeAcrossHeight(
      sourcePosition.y,
      heightByName.get(raw.sourceTable) ?? 0,
      exitIndex.get(raw) ?? 0,
      exitTotals.get(raw.sourceTable) ?? 1,
    );
    const entryY = distributeAcrossHeight(
      targetPosition.y,
      heightByName.get(raw.targetTable) ?? 0,
      entryIndex.get(raw) ?? 0,
      entryTotals.get(raw.targetTable) ?? 1,
    );
    const skippedLayerSpans = layerSpans
      .slice(sourceLayer + 1, targetLayer)
      .flat();
    const bendPoints = routeEdge(
      exitY,
      sourcePosition.x + ENTITY_FALLBACK_WIDTH,
      entryY,
      targetPosition.x,
      sourceLayer,
      targetLayer,
      skippedLayerSpans,
      (gapKey) => nextIndex(gapEdgeUsed, gapKey),
      () => skipEdgeCount++,
    );
    return {
      id: randomId(),
      type: "crowsFoot",
      source: nodeIdByTable.get(raw.sourceTable)!,
      target: nodeIdByTable.get(raw.targetTable)!,
      data: {
        sourceCardinality: raw.sourceCardinality,
        targetCardinality: raw.targetCardinality,
        bendPoints,
      },
    };
  });

  return {
    nodes,
    edges,
    viewport: { x: 0, y: 0, zoom: 1 },
    entityColumns: [],
  };
}
