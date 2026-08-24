import type { Node, Position } from "@xyflow/react";

import type { EdgePoint } from "../types";
import {
  clipLineToRect,
  handleAnchorPoint,
  polylinePath,
  rectFor,
} from "./edge-geometry";

// The dashed line that follows the cursor while a connection is armed (see
// ConnectionHandle) — rendered inside a <ViewportPortal> so these are plain
// flow coordinates, the same convention CrowsFootEdge uses for its own
// path. Not a real edge (no target yet), so it can't be one of the
// diagram's own ErdEdge entries — React Flow requires both endpoints to be
// real nodes.
export function PendingConnectionPreview({
  sourceNode,
  sourcePosition,
  waypoints,
  cursor,
  aligned,
}: Readonly<{
  sourceNode: Node | null | undefined;
  sourcePosition: Position | null;
  waypoints: readonly EdgePoint[];
  cursor: EdgePoint | null;
  // The far end is currently magnet-snapped onto a real dot on another
  // shape (see pendingConnectionAlignedTarget) — solid instead of dashed,
  // so the line itself confirms "this is exactly where it'll connect"
  // before you click, not just the highlighted dot at the far end.
  aligned: boolean;
}>) {
  if (!sourceNode || !cursor) return null;
  const sourceRect = rectFor(sourceNode);
  // Anchored to the exact dot that was clicked, not recomputed toward the
  // cursor — otherwise the line visibly starts short of (or past) the dot
  // the instant the cursor isn't perfectly level with it. Only falls back
  // to the nearest-boundary guess when there's no specific dot to anchor
  // to (a connection started via the old click-the-node-body Connect tool).
  const startPoint = sourcePosition
    ? handleAnchorPoint(sourceRect, sourcePosition)
    : clipLineToRect(
        sourceRect,
        { cx: (waypoints[0] ?? cursor).x, cy: (waypoints[0] ?? cursor).y },
        sourceRect,
      );
  const points = [startPoint, ...waypoints, cursor];

  return (
    <svg style={{ overflow: "visible", pointerEvents: "none" }}>
      <path
        d={polylinePath(points)}
        fill="none"
        stroke="var(--color-action, #5e6bff)"
        strokeWidth={aligned ? 2 : 1.5}
        strokeDasharray={aligned ? undefined : "4 3"}
      />
      {waypoints.map((point, index) => (
        <circle
          key={index}
          cx={point.x}
          cy={point.y}
          r={3}
          fill="var(--color-action, #5e6bff)"
        />
      ))}
    </svg>
  );
}
