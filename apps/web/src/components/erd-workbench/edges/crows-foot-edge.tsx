"use client";

import { BaseEdge, useReactFlow, type EdgeProps } from "@xyflow/react";
import type { PointerEvent as ReactPointerEvent } from "react";

import { useErdInteraction } from "../erd-interaction-context";
import type { EdgePoint, ErdEdge, ErdNode } from "../types";
import { glyphFor } from "./cardinality-markers";
import {
  angleDeg,
  closestSegment,
  computeEdgeEndpoints,
  firstDistinctPoint,
  pointOnBoundary,
  polylinePath,
  rectFor,
} from "./edge-geometry";

export function CrowsFootEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  selected,
}: EdgeProps<ErdEdge>) {
  const interaction = useErdInteraction();
  const reactFlow = useReactFlow<ErdNode, ErdEdge>();
  const sourceNode = reactFlow.getNode(source);
  const targetNode = reactFlow.getNode(target);
  // React Flow always resolves an edge's endpoint to a node's *first*
  // handle when no handle id is specified, which would make every
  // connection route through the same fixed side of a box. Recomputing the
  // nearest-boundary point from the actual node rectangles instead gives
  // the "connects from whichever side is closest" behavior a diagram tool
  // is expected to have; sourceX/Y/targetX/Y are kept only as a fallback
  // for the brief render before both nodes have been measured.
  const bendPoints = data?.bendPoints ?? [];
  const endpoints =
    sourceNode && targetNode
      ? computeEdgeEndpoints(sourceNode, targetNode, bendPoints)
      : null;
  const sourcePoint = endpoints?.sourcePoint ?? { x: sourceX, y: sourceY };
  // An explicit anchor (this end was connected by clicking a specific spot
  // on the shape's body, not just "somewhere near the other end") wins
  // over the dynamic nearest-boundary guess — otherwise several
  // connections into the same shape all collapse back onto the same
  // handful of points regardless of where each was actually drawn to.
  const targetPoint =
    data?.targetAnchor && targetNode
      ? pointOnBoundary(rectFor(targetNode), data.targetAnchor)
      : (endpoints?.targetPoint ?? { x: targetX, y: targetY });
  const points = [sourcePoint, ...bendPoints, targetPoint];
  const path = polylinePath(points);
  const sourceCardinality = data?.sourceCardinality ?? "none";
  const targetCardinality = data?.targetCardinality ?? "none";
  const canEditBends = selected && interaction.activeTool === "select";

  function toFlowPosition(event: { clientX: number; clientY: number }) {
    return reactFlow.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
  }

  // Dragging an existing bend point moves it; dragging the line itself
  // (away from an existing point) inserts a new one at the nearest segment
  // and immediately continues the drag from there — the standard "grab a
  // line to bend it" gesture in diagramming tools.
  function beginDragBendPoint(index: number) {
    return (event: ReactPointerEvent) => {
      event.stopPropagation();
      const move = (moveEvent: PointerEvent) => {
        const position = toFlowPosition(moveEvent);
        const next = bendPoints.map((p, i) => (i === index ? position : p));
        interaction.setEdgeBendPoints(id, next);
      };
      const stop = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop);
    };
  }

  function beginDragOnPath(event: ReactPointerEvent) {
    if (!canEditBends) return;
    event.stopPropagation();
    const startScreen = { x: event.clientX, y: event.clientY };
    // Only insert a bend point once the pointer actually moves — otherwise
    // re-clicking an already-selected edge would drop a spurious point at
    // the click location every time.
    let inserted: { segmentIndex: number; points: EdgePoint[] } | null = null;
    const move = (moveEvent: PointerEvent) => {
      const position = toFlowPosition(moveEvent);
      if (!inserted) {
        const movedPixels = Math.hypot(
          moveEvent.clientX - startScreen.x,
          moveEvent.clientY - startScreen.y,
        );
        if (movedPixels < 4) return;
        const { segmentIndex } = closestSegment(points, position);
        inserted = {
          segmentIndex,
          points: [
            ...bendPoints.slice(0, segmentIndex),
            position,
            ...bendPoints.slice(segmentIndex),
          ],
        };
      } else {
        inserted.points = inserted.points.map((p, i) =>
          i === inserted!.segmentIndex ? position : p,
        );
      }
      interaction.setEdgeBendPoints(id, inserted.points);
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function removeBendPoint(index: number) {
    interaction.setEdgeBendPoints(
      id,
      bendPoints.filter((_, i) => i !== index),
    );
  }

  // Both angles point from "this end's" anchor toward the other end — i.e.
  // into the line — since glyphFor() always extends toward +x.
  const sourceDirectionPoint =
    firstDistinctPoint(sourcePoint, points.slice(1)) ?? targetPoint;
  const targetDirectionPoint =
    firstDistinctPoint(targetPoint, points.slice(0, -1).reverse()) ??
    sourcePoint;
  const sourceAngle = angleDeg(sourcePoint, sourceDirectionPoint);
  const targetAngle = angleDeg(targetPoint, targetDirectionPoint);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        interactionWidth={canEditBends ? 0 : 20}
        style={{
          stroke: selected
            ? "var(--color-action, #5e6bff)"
            : "var(--color-ink-muted, #9a9da3)",
          strokeWidth: selected ? 2 : 1.5,
        }}
      />
      {/* Rendered as plain SVG content here rather than via SVG
          <marker>/marker-start/marker-end — a marker-based version was
          correct by every inspectable measure (right namespace, right
          attributes, right computed styles) but never actually painted.
          The real cause turned out to be unrelated to markers at all: any
          content offset toward the entity (not into the visible line) was
          being drawn under the entity's own node div, which sits in a
          higher DOM/paint layer than the edge SVG. */}
      <g
        transform={`translate(${sourcePoint.x},${sourcePoint.y}) rotate(${sourceAngle})`}
        style={{
          stroke: "var(--color-ink-muted, #9a9da3)",
          strokeWidth: 2,
          fill: "none",
        }}
      >
        {glyphFor(sourceCardinality)}
      </g>
      <g
        transform={`translate(${targetPoint.x},${targetPoint.y}) rotate(${targetAngle})`}
        style={{
          stroke: "var(--color-ink-muted, #9a9da3)",
          strokeWidth: 2,
          fill: "none",
        }}
      >
        {glyphFor(targetCardinality)}
      </g>
      {/* A wider, invisible, pointer-handled path layered on top — BaseEdge's
          own built-in interaction path doesn't expose custom handlers, and
          the visible 1.5-2px line is too thin to reliably grab. Disabled
          (interactionWidth: 0 above, no handler here) while not editable so
          it never steals the plain click that selects the edge. */}
      {canEditBends ? (
        <path
          d={path}
          fill="none"
          stroke="transparent"
          strokeWidth={16}
          className="cursor-grab"
          onPointerDown={beginDragOnPath}
        />
      ) : null}

      {canEditBends
        ? bendPoints.map((point: EdgePoint, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r={5}
              className="cursor-grab"
              style={{
                fill: "var(--color-surface, #101112)",
                stroke: "var(--color-action, #5e6bff)",
                strokeWidth: 2,
              }}
              onPointerDown={beginDragBendPoint(index)}
              onDoubleClick={(event) => {
                event.stopPropagation();
                removeBendPoint(index);
              }}
            />
          ))
        : null}
    </>
  );
}
