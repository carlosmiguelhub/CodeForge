import { Position, type Node } from "@xyflow/react";

// Matches EntityNode's `BASE_WIDTH` (entity-node.tsx) for a freshly
// generated diagram, which never has custom columns. Exported so
// schema-to-erd.ts's auto-layout can compute exact entity rects for
// routing without duplicating this literal.
export const ENTITY_FALLBACK_WIDTH = 224;

// Default sizes used before a node has been measured by React Flow (first
// render) or as a fallback for shapes with an unusual size — kept in sync
// with the Tailwind sizes each node component actually renders at.
const fallbackSize: Readonly<
  Record<string, { width: number; height?: number }>
> = {
  entity: { width: ENTITY_FALLBACK_WIDTH },
  shape: { width: 144, height: 80 },
  text: { width: 120, height: 48 },
};

// EntityNode's height is intrinsic (one row per attribute, no fixed
// height), so a single flat fallback badly undersizes anything but a
// near-empty table — an 8-attribute entity renders ~290px tall, not the
// ~96px a 2-attribute one does. A diagram generated in bulk (e.g. "Generate
// ERD" from a whole SQL schema) mounts several differently-sized entities
// at once, and until React Flow's ResizeObserver measures each one
// (node.measured), edges and connection-handle dots anchor to this
// estimate instead — so a flat constant made every entity but the smallest
// visibly snap to a different position (edges "breaking", handle dots
// landing mid-table) the moment real measurements arrived, which in
// practice was often only once something else forced a re-render (e.g.
// switching tools). Mirrors EntityNode's actual Tailwind classes: the
// header (border-b + py-1.5 + text-xs line), the p-1 wrapper, one min-h-7
// (28px) per attribute row, and the min-h-7 "Add attribute" row.
const ENTITY_HEADER_HEIGHT = 29;
const ENTITY_ROW_HEIGHT = 28;
const ENTITY_CONTAINER_PADDING = 8;

// Exported so the auto-layout in schema-to-erd.ts can space entities apart
// using this same estimate — the two need to agree, or a densely-attributed
// table placed by the layout could still end up overlapping its neighbor
// even though this fallback thinks it fits.
export function estimateEntityHeightForAttributeCount(
  attributeCount: number,
): number {
  // +1 for the always-present "Add attribute" row.
  return (
    ENTITY_HEADER_HEIGHT +
    ENTITY_CONTAINER_PADDING +
    (attributeCount + 1) * ENTITY_ROW_HEIGHT
  );
}

function estimateEntityHeight(node: Node): number {
  const data = node.data as { attributes?: unknown[] } | undefined;
  const attributeCount = Array.isArray(data?.attributes)
    ? data.attributes.length
    : 0;
  return estimateEntityHeightForAttributeCount(attributeCount);
}

export function rectFor(node: Node) {
  const fallback = fallbackSize[node.type ?? "shape"];
  const width = node.measured?.width ?? fallback?.width ?? 144;
  const height =
    node.measured?.height ??
    (node.type === "entity"
      ? estimateEntityHeight(node)
      : (fallback?.height ?? 80));
  return {
    cx: node.position.x + width / 2,
    cy: node.position.y + height / 2,
    halfWidth: width / 2,
    halfHeight: height / 2,
  };
}

// The exact fixed point a ConnectionHandle dot renders at — Position.Top/
// Right/Bottom/Left are each centered on their own side. Used only for a
// connection's *armed* preview line, so it visibly starts right at the dot
// the user actually grabbed instead of at wherever clipLineToRect's
// nearest-boundary-toward-the-cursor math happens to land, which drifts
// away from the dot the moment the cursor isn't exactly level with it.
export function handleAnchorPoint(
  rect: { cx: number; cy: number; halfWidth: number; halfHeight: number },
  position: Position,
): { x: number; y: number } {
  switch (position) {
    case Position.Top:
      return { x: rect.cx, y: rect.cy - rect.halfHeight };
    case Position.Right:
      return { x: rect.cx + rect.halfWidth, y: rect.cy };
    case Position.Bottom:
      return { x: rect.cx, y: rect.cy + rect.halfHeight };
    case Position.Left:
      return { x: rect.cx - rect.halfWidth, y: rect.cy };
  }
}

type Rect = { cx: number; cy: number; halfWidth: number; halfHeight: number };

// The generalized version of handleAnchorPoint — any point along a side,
// not just its exact center. fraction runs 0 (that side's top/left corner)
// to 1 (its bottom/right corner), clamped so a stale anchor from before a
// resize can't land outside the current box.
export function pointOnBoundary(
  rect: Rect,
  anchor: { position: Position; fraction: number },
): { x: number; y: number } {
  const f = Math.min(1, Math.max(0, anchor.fraction));
  switch (anchor.position) {
    case Position.Top:
      return {
        x: rect.cx - rect.halfWidth + f * rect.halfWidth * 2,
        y: rect.cy - rect.halfHeight,
      };
    case Position.Bottom:
      return {
        x: rect.cx - rect.halfWidth + f * rect.halfWidth * 2,
        y: rect.cy + rect.halfHeight,
      };
    case Position.Left:
      return {
        x: rect.cx - rect.halfWidth,
        y: rect.cy - rect.halfHeight + f * rect.halfHeight * 2,
      };
    case Position.Right:
      return {
        x: rect.cx + rect.halfWidth,
        y: rect.cy - rect.halfHeight + f * rect.halfHeight * 2,
      };
  }
}

// The inverse: given an arbitrary point (typically a click, possibly
// inside the box rather than exactly on its edge), which side is nearest
// and how far along it — lets a connection land wherever it was actually
// clicked on a shape's body instead of only at one of the 4 fixed centers,
// so several connections into the same shape can spread across it instead
// of all converging on the same handful of points.
export function nearestBoundaryAnchor(
  rect: Rect,
  point: { x: number; y: number },
): { position: Position; fraction: number } {
  const topY = rect.cy - rect.halfHeight;
  const bottomY = rect.cy + rect.halfHeight;
  const leftX = rect.cx - rect.halfWidth;
  const rightX = rect.cx + rect.halfWidth;
  const distances: [Position, number][] = [
    [Position.Top, Math.abs(point.y - topY)],
    [Position.Bottom, Math.abs(point.y - bottomY)],
    [Position.Left, Math.abs(point.x - leftX)],
    [Position.Right, Math.abs(point.x - rightX)],
  ];
  const [nearestSide] = distances.reduce((a, b) => (b[1] < a[1] ? b : a));
  const fraction =
    nearestSide === Position.Top || nearestSide === Position.Bottom
      ? (point.x - leftX) / (rect.halfWidth * 2)
      : (point.y - topY) / (rect.halfHeight * 2);
  return {
    position: nearestSide,
    fraction: Math.min(1, Math.max(0, fraction)),
  };
}

// React Flow's default handle resolution always uses the *first* handle
// when an edge doesn't specify one (see @xyflow/system's getHandle), which
// would make every connection always route through the same fixed side of
// a node regardless of where the other node actually is. Instead, this
// computes where a straight line between the two nodes' centers crosses
// each node's rectangular boundary — the classic "connect from the nearest
// side" behavior a diagram tool is expected to have.
export function clipLineToRect(
  fromCenter: { cx: number; cy: number },
  toward: { cx: number; cy: number },
  rect: { halfWidth: number; halfHeight: number },
) {
  const dx = toward.cx - fromCenter.cx;
  const dy = toward.cy - fromCenter.cy;
  if (dx === 0 && dy === 0) return { x: fromCenter.cx, y: fromCenter.cy };
  const scaleX = dx !== 0 ? rect.halfWidth / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? rect.halfHeight / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);
  return { x: fromCenter.cx + dx * scale, y: fromCenter.cy + dy * scale };
}

// bendPoints, if given, route the line's first/last visible segment toward
// the nearest bend rather than straight at the other node — without this,
// a heavily bent line (e.g. one routed around other shapes while it was
// being drawn) exits each node's boundary aimed at the *other node's
// center*, which can point completely the wrong way once bends pull the
// actual path off in some other direction, producing a crossed/kinked
// line instead of the clean route that was drawn.
export function computeEdgeEndpoints(
  sourceNode: Node,
  targetNode: Node,
  bendPoints: readonly { x: number; y: number }[] = [],
) {
  const source = rectFor(sourceNode);
  const target = rectFor(targetNode);
  const firstBend = bendPoints[0];
  const lastBend = bendPoints.at(-1);
  const towardFromSource = firstBend
    ? { cx: firstBend.x, cy: firstBend.y }
    : target;
  const towardFromTarget = lastBend
    ? { cx: lastBend.x, cy: lastBend.y }
    : source;
  const sourcePoint = clipLineToRect(source, towardFromSource, source);
  const targetPoint = clipLineToRect(target, towardFromTarget, target);
  return { sourcePoint, targetPoint };
}

// Source/target only record which entity was clicked first while drawing a
// connection — that has nothing to do with which one ends up on screen-left.
// Anything that labels itself "Left"/"Right" (as opposed to "Start"/"End")
// needs this instead, or it swaps sides whenever a connection happens to be
// drawn right-to-left.
export function isSourceLeftOfTarget(
  sourceNode: Node,
  targetNode: Node,
): boolean {
  const { sourcePoint, targetPoint } = computeEdgeEndpoints(
    sourceNode,
    targetNode,
  );
  return sourcePoint.x <= targetPoint.x;
}

// A polyline edge (source -> ...bendPoints -> target) needs to know which
// segment a click landed nearest to, so a drag-to-add-a-bend-point gesture
// inserts the new point in the right place instead of always at the end.
// Returns { segmentIndex, distance }: segmentIndex is the index the new
// point should be spliced into the bendPoints array at (0 = right after
// the source, bendPoints.length = right before the target).
export function closestSegment(
  points: readonly { x: number; y: number }[],
  point: { x: number; y: number },
) {
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared,
            ),
          );
    const closestX = a.x + t * dx;
    const closestY = a.y + t * dy;
    const distance = Math.hypot(point.x - closestX, point.y - closestY);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  return { segmentIndex: bestIndex, distance: bestDistance };
}

// Degrees, matching SVG's rotate() convention (clockwise, 0 = +x/rightward).
export function angleDeg(
  from: { x: number; y: number },
  to: { x: number; y: number },
): number {
  return (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI;
}

// Generated orthogonal routes include their exact boundary points as the
// first/last bend so endpoint clipping stays pinned. Once the renderer adds
// its computed endpoint, that creates a duplicate point. Skip those duplicates
// when deciding which way an endpoint glyph should face, or its zero-length
// direction resolves to 0° and can paint the notation underneath the node.
export function firstDistinctPoint(
  origin: { x: number; y: number },
  points: readonly { x: number; y: number }[],
): { x: number; y: number } | undefined {
  return points.find((point) => point.x !== origin.x || point.y !== origin.y);
}

export function polylinePath(
  points: readonly { x: number; y: number }[],
): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.y}`).join(" ");
}
