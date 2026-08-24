import type { Node } from "@xyflow/react";
import { describe, expect, it } from "vitest";

import {
  closestSegment,
  clipLineToRect,
  firstDistinctPoint,
  polylinePath,
  rectFor,
} from "./edge-geometry";

function entityNode(
  attributeCount: number,
  measured?: { width: number; height: number },
): Node {
  return {
    id: "n1",
    type: "entity",
    position: { x: 0, y: 0 },
    data: {
      attributes: Array.from({ length: attributeCount }, (_, i) => ({
        id: String(i),
      })),
    },
    measured,
  } as Node;
}

describe("rectFor", () => {
  it("scales the unmeasured-entity fallback height with its attribute count", () => {
    const small = rectFor(entityNode(2));
    const large = rectFor(entityNode(8));
    // A flat fallback (the old behavior) would give these the same height;
    // an 8-row table must be taller than a 2-row one before either has
    // been measured by React Flow, or edges/handles anchor to the wrong
    // spot until a later re-render happens to correct it.
    expect(large.halfHeight).toBeGreaterThan(small.halfHeight);
  });

  it("prefers React Flow's real measured size once available", () => {
    const rect = rectFor(entityNode(8, { width: 300, height: 500 }));
    expect(rect.halfWidth).toBe(150);
    expect(rect.halfHeight).toBe(250);
  });

  it("falls back to a sane size for a shape with no attributes array", () => {
    const rect = rectFor({
      id: "n2",
      type: "shape",
      position: { x: 0, y: 0 },
      data: {},
    } as Node);
    expect(rect.halfWidth).toBe(72);
    expect(rect.halfHeight).toBe(40);
  });
});

describe("clipLineToRect", () => {
  it("clips to the right edge when the target is directly to the right", () => {
    const point = clipLineToRect(
      { cx: 0, cy: 0 },
      { cx: 100, cy: 0 },
      { halfWidth: 10, halfHeight: 5 },
    );
    expect(point).toEqual({ x: 10, y: 0 });
  });

  it("clips to the bottom edge when the target is directly below", () => {
    const point = clipLineToRect(
      { cx: 0, cy: 0 },
      { cx: 0, cy: 100 },
      { halfWidth: 10, halfHeight: 5 },
    );
    expect(point).toEqual({ x: 0, y: 5 });
  });

  it("returns the center when both points coincide (degenerate case)", () => {
    const point = clipLineToRect(
      { cx: 3, cy: 4 },
      { cx: 3, cy: 4 },
      { halfWidth: 10, halfHeight: 5 },
    );
    expect(point).toEqual({ x: 3, y: 4 });
  });
});

describe("closestSegment", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 100 },
  ];

  it("finds the first segment for a point near its midpoint", () => {
    expect(closestSegment(points, { x: 50, y: 1 }).segmentIndex).toBe(0);
  });

  it("finds the second segment for a point near its midpoint", () => {
    expect(closestSegment(points, { x: 99, y: 50 }).segmentIndex).toBe(1);
  });

  it("reports zero distance for a point exactly on a segment", () => {
    expect(closestSegment(points, { x: 50, y: 0 }).distance).toBe(0);
  });
});

describe("polylinePath", () => {
  it("builds an SVG path string that moves to the first point and lines through the rest", () => {
    expect(
      polylinePath([
        { x: 0, y: 0 },
        { x: 10, y: 5 },
        { x: 20, y: 0 },
      ]),
    ).toBe("M 0,0 L 10,5 L 20,0");
  });

  it("degrades to a single move for one point", () => {
    expect(polylinePath([{ x: 1, y: 2 }])).toBe("M 1,2");
  });
});

describe("firstDistinctPoint", () => {
  it("skips repeated endpoint pins when finding the glyph direction", () => {
    const origin = { x: 224, y: 100 };
    expect(
      firstDistinctPoint(origin, [
        origin,
        { x: 224, y: 100 },
        { x: 270, y: 100 },
      ]),
    ).toEqual({ x: 270, y: 100 });
  });

  it("returns undefined when a route contains only duplicate points", () => {
    const origin = { x: 10, y: 20 };
    expect(firstDistinctPoint(origin, [origin, origin])).toBeUndefined();
  });
});
