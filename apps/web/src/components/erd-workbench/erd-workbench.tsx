"use client";

import "@xyflow/react/dist/style.css";
import "./react-flow-theme.css";
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  Controls,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  ViewportPortal,
  type Viewport,
} from "@xyflow/react";
import {
  ArrowLeft,
  CircleHelp,
  Expand,
  FileDown,
  Maximize2,
  Pencil,
  Shapes,
  X,
} from "lucide-react";
import { erdDiagramSchema } from "@sqweb/contracts";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { useAuth } from "@/components/auth/auth-provider";
import { Spinner } from "@/components/ui/spinner";

import { GuideModal } from "../workbench/guide-modal";
import {
  addAttributeRow,
  createEdgeBetween,
  createEntityColumn,
  createNodeAtPosition,
  GRID_SIZE,
  removeAttributeRow,
  removeEdge as removeEdgeOp,
  removeEntityColumn as removeEntityColumnOp,
  removeNode as removeNodeOp,
  renameEntityColumn,
  renameNode,
  setEdgeBendPoints as setEdgeBendPointsOp,
  toggleCardinality,
  togglePrimaryKey as togglePrimaryKeyOp,
  updateAttributeCustomValue as updateAttributeCustomValueOp,
  updateAttributeRow,
  type ShapeToolId,
} from "./diagram-ops";
import { CardinalityToolbar } from "./edges/cardinality-toolbar";
import { exportDiagramToPdf } from "./erd-pdf-export";
import {
  handleAnchorPoint,
  isSourceLeftOfTarget,
  nearestBoundaryAnchor,
  rectFor,
} from "./edges/edge-geometry";
import { edgeTypes } from "./edges/edge-types";
import { PendingConnectionPreview } from "./edges/pending-connection-preview";
import {
  erdGuideSamples,
  erdGuideSections,
  parseDiagramSample,
} from "./erd-guide-content";
import {
  ErdInteractionContext,
  type EditingCell,
  type EditingColumnLabel,
  type ErdInteractionValue,
} from "./erd-interaction-context";
import { erdSqlTypeOptions } from "./nodes/entity-node";
import { nodeTypes } from "./nodes/node-types";
import {
  actionTools,
  isShapeTool,
  navigationTools,
  shapeTools,
  type ToolDefinition,
  type ToolId,
} from "./tools";
import type {
  EdgeAnchor,
  EdgePoint,
  EntityColumn,
  EntityNodeType,
  ErdEdge,
  ErdNode,
} from "./types";

const CONNECTION_HANDLE_POSITIONS = [
  Position.Top,
  Position.Right,
  Position.Bottom,
  Position.Left,
];

function ToolButton({
  tool,
  active,
  onSelect,
}: Readonly<{
  tool: ToolDefinition;
  active: boolean;
  onSelect: (id: ToolId) => void;
}>) {
  const Icon = tool.icon;
  return (
    <button
      onClick={() => onSelect(tool.id)}
      aria-pressed={active}
      className={`${
        active
          ? "text-ink-primary bg-elevated"
          : "text-ink-muted hover:bg-elevated-high"
      } rounded-control flex min-h-9 w-full items-center gap-3 px-2 text-xs`}
    >
      <Icon aria-hidden="true" size={15} />
      {tool.label}
    </button>
  );
}

function ToolPalette({
  activeTool,
  onSelect,
}: Readonly<{ activeTool: ToolId; onSelect: (id: ToolId) => void }>) {
  return (
    <div className="space-y-0.5 p-2">
      {navigationTools.map((tool) => (
        <ToolButton
          key={tool.id}
          tool={tool}
          active={activeTool === tool.id}
          onSelect={onSelect}
        />
      ))}
      <hr className="border-divider my-2" />
      {shapeTools.map((tool) => (
        <ToolButton
          key={tool.id}
          tool={tool}
          active={activeTool === tool.id}
          onSelect={onSelect}
        />
      ))}
      <hr className="border-divider my-2" />
      {actionTools.map((tool) => (
        <ToolButton
          key={tool.id}
          tool={tool}
          active={activeTool === tool.id}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function ErdWorkbenchInner({ diagramId }: Readonly<{ diagramId: string }>) {
  const { authorizedFetch, account } = useAuth();
  const pathname = usePathname();
  const galleryHref = pathname.slice(0, pathname.lastIndexOf("/")) || "/";
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState<ErdNode>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<ErdEdge>([]);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });
  const [entityColumns, setEntityColumns] = useState<EntityColumn[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [diagramName, setDiagramName] = useState("");
  const [diagramCreatedAt, setDiagramCreatedAt] = useState("");
  const [diagramUpdatedAt, setDiagramUpdatedAt] = useState("");
  const [renamingName, setRenamingName] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">(
    "saved",
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ToolId>("select");
  const [pendingConnectionSourceId, setPendingConnectionSourceId] = useState<
    string | null
  >(null);
  const [pendingConnectionSourcePosition, setPendingConnectionSourcePosition] =
    useState<Position | null>(null);
  const [pendingConnectionWaypoints, setPendingConnectionWaypoints] = useState<
    EdgePoint[]
  >([]);
  const [pendingConnectionCursor, setPendingConnectionCursor] =
    useState<EdgePoint | null>(null);
  const [pendingConnectionAlignedTarget, setPendingConnectionAlignedTarget] =
    useState<{ nodeId: string; position: Position } | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [editingColumnLabel, setEditingColumnLabel] =
    useState<EditingColumnLabel | null>(null);
  const [toolsWidth, setToolsWidth] = useState(200);
  const [fullScreen, setFullScreen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const reactFlow = useReactFlow<ErdNode, ErdEdge>();

  const selectedEdge = edges.find((e) => e.selected) ?? null;
  const selectedEdgeSourceNode = selectedEdge
    ? reactFlow.getNode(selectedEdge.source)
    : null;
  const selectedEdgeTargetNode = selectedEdge
    ? reactFlow.getNode(selectedEdge.target)
    : null;
  const selectedEdgeSourceIsLeft =
    selectedEdgeSourceNode && selectedEdgeTargetNode
      ? isSourceLeftOfTarget(selectedEdgeSourceNode, selectedEdgeTargetNode)
      : true;

  const saveStatusLabel =
    loadState === "loading"
      ? "Loading diagram…"
      : loadState === "error"
        ? "Couldn't load this diagram"
        : saveStatus === "saving"
          ? "Saving…"
          : saveStatus === "error"
            ? "Couldn't save"
            : "Saved";

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoadState("loading");
      setNodes([]);
      setEdges([]);
      setViewport({ x: 0, y: 0, zoom: 1 });
      setEntityColumns([]);
      void (async () => {
        try {
          const response = await authorizedFetch(
            `/v1/erd-diagrams/${diagramId}`,
          );
          if (!response.ok) throw new Error("The diagram could not be loaded.");
          const diagram = erdDiagramSchema.parse(await response.json());
          if (cancelled) return;
          setNodes(diagram.content.nodes as unknown as ErdNode[]);
          setEdges(diagram.content.edges as unknown as ErdEdge[]);
          setViewport(diagram.content.viewport);
          setEntityColumns(
            diagram.content.entityColumns as unknown as EntityColumn[],
          );
          setDiagramName(diagram.name);
          setDiagramCreatedAt(diagram.createdAt);
          setDiagramUpdatedAt(diagram.updatedAt);
          setLoadState("ready");
        } catch {
          if (!cancelled) setLoadState("error");
        }
      })();
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [diagramId, authorizedFetch, setNodes, setEdges]);

  // Debounced autosave, same 300ms-after-last-change shape the previous
  // localStorage version used, just against the platform API instead.
  useEffect(() => {
    if (loadState !== "ready") return;
    const statusTimer = window.setTimeout(() => setSaveStatus("saving"), 0);
    const saveTimer = window.setTimeout(() => {
      void (async () => {
        try {
          const response = await authorizedFetch(
            `/v1/erd-diagrams/${diagramId}/content`,
            {
              method: "PUT",
              body: JSON.stringify({
                content: { nodes, edges, viewport, entityColumns },
              }),
            },
          );
          if (response.ok) {
            const saved = erdDiagramSchema.parse(await response.json());
            setDiagramUpdatedAt(saved.updatedAt);
            setSaveStatus("saved");
          } else {
            setSaveStatus("error");
          }
        } catch {
          setSaveStatus("error");
        }
      })();
    }, 300);
    return () => {
      window.clearTimeout(statusTimer);
      window.clearTimeout(saveTimer);
    };
  }, [
    diagramId,
    authorizedFetch,
    loadState,
    nodes,
    edges,
    viewport,
    entityColumns,
  ]);

  async function renameDiagram(name: string) {
    const trimmed = name.trim();
    setRenamingName(null);
    if (!trimmed || trimmed === diagramName) return;
    const previousName = diagramName;
    setDiagramName(trimmed);
    try {
      const response = await authorizedFetch(`/v1/erd-diagrams/${diagramId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      if (!response.ok) throw new Error("The rename was not accepted.");
    } catch {
      setDiagramName(previousName);
    }
  }

  const cancelEditing = useCallback(() => {
    setEditingNodeId(null);
    setEditingCell(null);
    setEditingColumnLabel(null);
    setPendingConnectionSourceId(null);
    setPendingConnectionSourcePosition(null);
    setPendingConnectionWaypoints([]);
    setPendingConnectionCursor(null);
    setPendingConnectionAlignedTarget(null);
  }, []);

  // Universal "back out of whatever I started" affordance — clears a
  // pending connection or an in-progress rename/attribute edit.
  useEffect(() => {
    function handleKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") cancelEditing();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [cancelEditing]);

  function selectTool(tool: ToolId) {
    setActiveTool(tool);
    setPendingConnectionSourceId(null);
    setPendingConnectionSourcePosition(null);
    setPendingConnectionWaypoints([]);
    setPendingConnectionCursor(null);
    setPendingConnectionAlignedTarget(null);
    setMobileToolsOpen(false);
  }

  // Every other shape's own dot positions, recomputed only when the nodes
  // or the armed source change (not on every mouse move) — the actual
  // per-move scan against this list is cheap enough to redo every time.
  const connectionCandidateAnchors = useMemo(() => {
    if (!pendingConnectionSourceId) return [];
    const candidates: {
      nodeId: string;
      position: Position;
      x: number;
      y: number;
    }[] = [];
    for (const node of nodes) {
      if (node.id === pendingConnectionSourceId) continue;
      const rect = rectFor(node);
      for (const position of CONNECTION_HANDLE_POSITIONS) {
        const anchor = handleAnchorPoint(rect, position);
        candidates.push({ nodeId: node.id, position, ...anchor });
      }
    }
    return candidates;
  }, [nodes, pendingConnectionSourceId]);

  const finishConnection = useCallback(
    (targetNodeId: string, targetAnchor?: EdgeAnchor) => {
      if (
        !pendingConnectionSourceId ||
        pendingConnectionSourceId === targetNodeId
      )
        return;
      const edge = createEdgeBetween(
        pendingConnectionSourceId,
        targetNodeId,
        pendingConnectionWaypoints,
        targetAnchor,
      );
      if (edge) setEdges((current) => [...current, edge]);
      setPendingConnectionSourceId(null);
      setPendingConnectionSourcePosition(null);
      setPendingConnectionWaypoints([]);
      setPendingConnectionCursor(null);
      setPendingConnectionAlignedTarget(null);
    },
    [pendingConnectionSourceId, pendingConnectionWaypoints, setEdges],
  );

  const onPaneClick = useCallback(
    (event: ReactMouseEvent) => {
      if (isShapeTool(activeTool)) {
        const position = reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        const node = createNodeAtPosition(activeTool as ShapeToolId, position);
        setNodes((current) => [
          ...current.map((n) => ({ ...n, selected: false })),
          { ...node, selected: true },
        ]);
        setActiveTool("select");
        return;
      }
      if (!pendingConnectionSourceId) return;
      // The preview line is magnet-snapped onto another shape's own dot
      // (see onCanvasMouseMove) — clicking anywhere finishes the
      // connection to that dot's shape, same as clicking the shape
      // itself, since the guide already showed exactly where this would
      // land.
      if (pendingConnectionAlignedTarget) {
        finishConnection(pendingConnectionAlignedTarget.nodeId, {
          position: pendingConnectionAlignedTarget.position,
          fraction: 0.5,
        });
        return;
      }
      // Otherwise a connection is armed (started from the Connect tool or
      // a node's own connection dot) — clicking empty canvas drops a
      // waypoint and keeps it armed, rather than canceling, so the line
      // can be routed around other shapes as a run of straight segments
      // on the way to the target instead of one diagonal line cutting
      // across them. Reuses whatever pendingConnectionCursor already
      // holds (kept current by onCanvasMouseMove, snapped to axis)
      // instead of recomputing from the click — the dropped waypoint
      // then lands exactly where the preview line was already showing.
      if (pendingConnectionCursor) {
        setPendingConnectionWaypoints((current) => [
          ...current,
          pendingConnectionCursor,
        ]);
      }
    },
    [
      activeTool,
      reactFlow,
      setNodes,
      pendingConnectionSourceId,
      pendingConnectionCursor,
      pendingConnectionAlignedTarget,
      finishConnection,
    ],
  );

  const onNodeClick = useCallback(
    (event: ReactMouseEvent, node: ErdNode) => {
      if (activeTool === "connect" || pendingConnectionSourceId) {
        if (!pendingConnectionSourceId) {
          // No specific dot involved — the preview falls back to its
          // nearest-boundary guess since there's nothing to anchor to.
          setPendingConnectionSourceId(node.id);
          setPendingConnectionSourcePosition(null);
          return;
        }
        // Clicked the target's body rather than one of its dots (those
        // stop propagation and never reach here) — lands exactly where
        // clicked instead of the same fixed center every time, so several
        // connections into this shape can spread across its whole body.
        const clickPoint = reactFlow.screenToFlowPosition({
          x: event.clientX,
          y: event.clientY,
        });
        finishConnection(
          node.id,
          nearestBoundaryAnchor(rectFor(node), clickPoint),
        );
        return;
      }
      if (activeTool === "delete") {
        const result = removeNodeOp(nodes, edges, node.id);
        setNodes(result.nodes);
        setEdges(result.edges);
      }
    },
    [
      activeTool,
      pendingConnectionSourceId,
      finishConnection,
      reactFlow,
      nodes,
      edges,
      setNodes,
      setEdges,
    ],
  );

  const onEdgeClick = useCallback(
    (_event: ReactMouseEvent, edge: ErdEdge) => {
      if (activeTool === "delete")
        setEdges((current) => removeEdgeOp(current, edge.id));
    },
    [activeTool, setEdges],
  );

  // Live cursor position (flow coordinates) for the dashed preview line
  // while a connection is armed — only tracked while one actually is, so
  // this doesn't cost a re-render on every mouse move the rest of the time.
  // Snapped to whichever axis it's closer to, relative to the last fixed
  // point (the last waypoint, or the armed dot itself) — a hand-drawn
  // mouse path is never perfectly straight, so without this a connector
  // meant to run straight down comes out very slightly diagonal the whole
  // way, which reads as visibly crooked over any real distance. On top of
  // that axis-lock, a magnetic snap: once the locked line comes near an
  // actual dot on another shape, it locks onto that dot exactly and flags
  // it as the aligned target (see PendingConnectionPreview and
  // ConnectionHandle's highlight) — the "guide" the line is accurate on
  // the first try because it visibly snaps onto the real target before
  // you even click.
  const onCanvasMouseMove = useCallback(
    (event: ReactMouseEvent) => {
      if (!pendingConnectionSourceId) return;
      const raw = reactFlow.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });
      const lastWaypoint = pendingConnectionWaypoints.at(-1);
      let reference: EdgePoint | null = lastWaypoint ?? null;
      if (!reference) {
        const sourceNode = reactFlow.getNode(pendingConnectionSourceId);
        if (sourceNode) {
          const rect = rectFor(sourceNode);
          reference = pendingConnectionSourcePosition
            ? handleAnchorPoint(rect, pendingConnectionSourcePosition)
            : { x: rect.cx, y: rect.cy };
        }
      }
      if (!reference) {
        setPendingConnectionCursor(raw);
        setPendingConnectionAlignedTarget(null);
        return;
      }
      const dx = raw.x - reference.x;
      const dy = raw.y - reference.y;
      const horizontal = Math.abs(dx) > Math.abs(dy);

      const alignTolerance = 10 / viewport.zoom;
      const captureRadius = 28 / viewport.zoom;
      let best: (typeof connectionCandidateAnchors)[number] | null = null;
      let bestDistance = Infinity;
      for (const candidate of connectionCandidateAnchors) {
        const onLine = horizontal
          ? Math.abs(candidate.y - reference.y) <= alignTolerance
          : Math.abs(candidate.x - reference.x) <= alignTolerance;
        if (!onLine) continue;
        const distanceAlongLine = horizontal
          ? Math.abs(candidate.x - raw.x)
          : Math.abs(candidate.y - raw.y);
        if (
          distanceAlongLine <= captureRadius &&
          distanceAlongLine < bestDistance
        ) {
          best = candidate;
          bestDistance = distanceAlongLine;
        }
      }

      if (best) {
        setPendingConnectionCursor({ x: best.x, y: best.y });
        setPendingConnectionAlignedTarget({
          nodeId: best.nodeId,
          position: best.position,
        });
        return;
      }
      setPendingConnectionAlignedTarget(null);
      setPendingConnectionCursor(
        horizontal
          ? { x: raw.x, y: reference.y }
          : { x: reference.x, y: raw.y },
      );
    },
    [
      pendingConnectionSourceId,
      pendingConnectionSourcePosition,
      pendingConnectionWaypoints,
      connectionCandidateAnchors,
      viewport.zoom,
      reactFlow,
    ],
  );

  const updateEntity = useCallback(
    (nodeId: string, update: (entity: EntityNodeType) => EntityNodeType) => {
      setNodes((current) =>
        current.map((n) =>
          n.id === nodeId && n.type === "entity" ? update(n) : n,
        ),
      );
    },
    [setNodes],
  );

  const interaction: ErdInteractionValue = useMemo(
    () => ({
      activeTool,
      pendingConnectionSourceId,
      pendingConnectionSourcePosition,
      pendingConnectionAlignedTarget,
      editingNodeId,
      editingCell,
      editingColumnLabel,
      entityColumns,
      startRenamingNode(id) {
        setEditingCell(null);
        setEditingColumnLabel(null);
        setEditingNodeId(id);
      },
      commitNodeName(id, name) {
        // Escape already cleared editingNodeId before this blur-triggered
        // commit runs — guard makes that a no-op instead of a late commit.
        if (editingNodeId !== id) return;
        const trimmed = name.trim();
        if (trimmed) {
          setNodes((current) =>
            current.map((n) => (n.id === id ? renameNode(n, trimmed) : n)),
          );
        }
        setEditingNodeId(null);
      },
      cancelEditing,
      startEditingCell(cell) {
        setEditingNodeId(null);
        setEditingColumnLabel(null);
        setEditingCell(cell);
      },
      addAttribute(nodeId) {
        const entity = nodes.find(
          (n): n is EntityNodeType =>
            n.id === nodeId && n.data.kind === "entity",
        );
        if (!entity) return;
        const updated = addAttributeRow(entity);
        setNodes((current) =>
          current.map((n) => (n.id === nodeId ? updated : n)),
        );
        const newAttribute = updated.data.attributes.at(-1);
        if (!newAttribute) return;
        setEditingCell({ nodeId, attributeId: newAttribute.id, field: "name" });
      },
      removeAttribute(nodeId, attributeId) {
        updateEntity(nodeId, (entity) =>
          removeAttributeRow(entity, attributeId),
        );
      },
      updateAttributeText(nodeId, attributeId, field, value) {
        if (
          !editingCell ||
          editingCell.nodeId !== nodeId ||
          editingCell.attributeId !== attributeId ||
          editingCell.field !== field
        )
          return;
        updateEntity(nodeId, (entity) =>
          updateAttributeRow(entity, attributeId, { [field]: value }),
        );
        setEditingCell(null);
      },
      updateAttributeCustomValue(nodeId, attributeId, columnId, value) {
        if (
          !editingCell ||
          editingCell.nodeId !== nodeId ||
          editingCell.attributeId !== attributeId ||
          editingCell.field !== "custom" ||
          editingCell.columnId !== columnId
        )
          return;
        updateEntity(nodeId, (entity) =>
          updateAttributeCustomValueOp(entity, attributeId, columnId, value),
        );
        setEditingCell(null);
      },
      togglePrimaryKey(nodeId, attributeId) {
        updateEntity(nodeId, (entity) =>
          togglePrimaryKeyOp(entity, attributeId),
        );
      },
      addEntityColumn(nodeId) {
        // Reads the closed-over `entityColumns` directly rather than a
        // setState updater function — an updater is invoked twice under
        // StrictMode as a purity check, and this one needs to fire
        // setEditingColumnLabel exactly once as a side effect.
        const next = createEntityColumn(entityColumns);
        const newColumn = next.at(-1);
        setEntityColumns(next);
        if (newColumn) {
          setEditingNodeId(null);
          setEditingCell(null);
          setEditingColumnLabel({ nodeId, columnId: newColumn.id });
        }
      },
      startEditingColumnLabel(nodeId, columnId) {
        setEditingNodeId(null);
        setEditingCell(null);
        setEditingColumnLabel({ nodeId, columnId });
      },
      commitEntityColumnLabel(columnId, label) {
        if (editingColumnLabel?.columnId !== columnId) return;
        setEntityColumns((current) =>
          renameEntityColumn(current, columnId, label.trim()),
        );
        setEditingColumnLabel(null);
      },
      removeEntityColumn(columnId) {
        setEntityColumns((current) => removeEntityColumnOp(current, columnId));
      },
      setEdgeCardinality(edgeId, end, value) {
        setEdges((current) =>
          current.map((e) =>
            e.id === edgeId ? toggleCardinality(e, end, value) : e,
          ),
        );
      },
      setEdgeBendPoints(edgeId, bendPoints) {
        setEdges((current) =>
          current.map((e) =>
            e.id === edgeId ? setEdgeBendPointsOp(e, bendPoints) : e,
          ),
        );
      },
      startPendingConnection(nodeId, position) {
        setPendingConnectionWaypoints([]);
        setPendingConnectionCursor(null);
        setPendingConnectionAlignedTarget(null);
        setPendingConnectionSourcePosition(position ?? null);
        setPendingConnectionSourceId(nodeId);
      },
      finishPendingConnection(nodeId, position) {
        finishConnection(
          nodeId,
          position ? { position, fraction: 0.5 } : undefined,
        );
      },
    }),
    [
      activeTool,
      pendingConnectionSourceId,
      pendingConnectionSourcePosition,
      pendingConnectionAlignedTarget,
      finishConnection,
      editingNodeId,
      editingCell,
      editingColumnLabel,
      entityColumns,
      nodes,
      setNodes,
      setEdges,
      setEntityColumns,
      cancelEditing,
      updateEntity,
    ],
  );

  // Lives outside the tool list's own overflow-auto scroll area (as a
  // sibling footer, not a descendant of it) — a dropdown opened from inside
  // a scrolling container gets clipped to that container's bounds even
  // though it's position:absolute, so nesting it in the scrollable list
  // would cut the notation menu off instead of letting it float over the
  // canvas like it does everywhere else.
  const notationPanel = selectedEdge ? (
    <div className="border-divider shrink-0 border-t p-2">
      <p className="text-ink-muted mb-2 px-1 text-[10px] font-semibold uppercase">
        Notation
      </p>
      <CardinalityToolbar
        leftCardinality={
          selectedEdgeSourceIsLeft
            ? (selectedEdge.data?.sourceCardinality ?? "none")
            : (selectedEdge.data?.targetCardinality ?? "none")
        }
        rightCardinality={
          selectedEdgeSourceIsLeft
            ? (selectedEdge.data?.targetCardinality ?? "none")
            : (selectedEdge.data?.sourceCardinality ?? "none")
        }
        onChangeLeft={(value) =>
          interaction.setEdgeCardinality(
            selectedEdge.id,
            selectedEdgeSourceIsLeft ? "source" : "target",
            value,
          )
        }
        onChangeRight={(value) =>
          interaction.setEdgeCardinality(
            selectedEdge.id,
            selectedEdgeSourceIsLeft ? "target" : "source",
            value,
          )
        }
      />
    </div>
  ) : null;

  async function exportPdf() {
    if (!canvasContainerRef.current || nodes.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      await exportDiagramToPdf({
        container: canvasContainerRef.current,
        reactFlow,
        name: diagramName || "Untitled diagram",
        createdAt: diagramCreatedAt,
        updatedAt: diagramUpdatedAt,
        authorName: account?.displayName ?? "Unknown",
      });
    } catch {
      setExportError("The PDF could not be generated.");
    } finally {
      setExporting(false);
    }
  }

  function insertSample(code: string) {
    const offset = { x: 40 + nodes.length * 10, y: 40 + nodes.length * 10 };
    const sample = parseDiagramSample(code, offset);
    if (!sample) return;
    setNodes((current) => [...current, ...sample.nodes]);
    setEdges((current) => [...current, ...sample.edges]);
    setGuideOpen(false);
  }

  function beginToolsResize(event: PointerEvent<HTMLDivElement>) {
    const startX = event.clientX;
    const startWidth = toolsWidth;
    const move = (moveEvent: globalThis.PointerEvent) =>
      setToolsWidth(
        Math.min(320, Math.max(160, startWidth + moveEvent.clientX - startX)),
      );
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  function resizeToolsByKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      setToolsWidth((value) =>
        Math.min(
          320,
          Math.max(160, value + (event.key === "ArrowRight" ? 16 : -16)),
        ),
      );
    }
  }

  return (
    <ErdInteractionContext.Provider value={interaction}>
      <section
        className={`${fullScreen ? "bg-canvas fixed inset-0 z-50 p-3" : ""} border-structural bg-deep rounded-panel overflow-hidden border`}
        aria-label="ERD Workbench"
      >
        <datalist id="erd-sql-types">
          {erdSqlTypeOptions.map((option) => (
            <option key={option} value={option} />
          ))}
        </datalist>

        <div className="border-divider bg-surface flex min-h-12 flex-wrap items-center gap-x-1 gap-y-2 border-b px-2 py-1.5">
          <Link
            href={galleryHref}
            aria-label="Back to diagrams"
            className="text-ink-muted hover:text-ink-primary rounded-control grid size-9 shrink-0 place-items-center"
          >
            <ArrowLeft aria-hidden="true" size={15} />
          </Link>
          <button
            onClick={() => setMobileToolsOpen(true)}
            className="border-structural text-ink-secondary rounded-control flex min-h-9 items-center gap-2 border px-3 text-xs lg:hidden"
          >
            <Shapes aria-hidden="true" size={14} /> Tools
          </button>
          <button
            onClick={() => setGuideOpen(true)}
            className="text-action-soft rounded-control flex min-h-9 items-center gap-2 px-3 text-xs"
          >
            <CircleHelp aria-hidden="true" size={14} /> Guide
          </button>
          {renamingName !== null ? (
            <input
              autoFocus
              value={renamingName}
              onChange={(event) => setRenamingName(event.target.value)}
              onBlur={() => void renameDiagram(renamingName)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void renameDiagram(renamingName);
                if (event.key === "Escape") setRenamingName(null);
              }}
              className="border-structural bg-elevated text-ink-primary rounded-control h-9 max-w-48 border px-2 text-sm"
            />
          ) : (
            <button
              onClick={() => setRenamingName(diagramName)}
              disabled={loadState !== "ready"}
              className="text-ink-primary hover:bg-elevated-high rounded-control flex h-9 max-w-48 items-center gap-1.5 truncate px-2 text-sm font-medium disabled:opacity-50"
            >
              <span className="truncate">{diagramName || "Loading…"}</span>
              {loadState === "ready" ? (
                <Pencil aria-hidden="true" size={12} className="shrink-0" />
              ) : null}
            </button>
          )}
          <span className="text-ink-muted ml-auto hidden items-center gap-1.5 text-[11px] sm:flex">
            {activeTool === "connect" ? (
              pendingConnectionSourceId ? (
                "Click a target shape to connect"
              ) : (
                "Click a source shape to connect"
              )
            ) : (
              <>
                {loadState === "loading" || saveStatus === "saving" ? (
                  <Spinner size={11} />
                ) : null}
                {exportError ?? saveStatusLabel}
              </>
            )}
          </span>
          <button
            onClick={() => void exportPdf()}
            disabled={exporting || loadState !== "ready" || nodes.length === 0}
            aria-label="Export PDF"
            className="text-ink-muted rounded-control ml-auto flex min-h-9 items-center gap-2 px-3 text-xs disabled:opacity-50 sm:ml-0"
          >
            {exporting ? (
              <Spinner />
            ) : (
              <FileDown aria-hidden="true" size={14} />
            )}
            {exporting ? "Exporting…" : "Export PDF"}
          </button>
          <button
            onClick={() => setFullScreen((value) => !value)}
            aria-label={fullScreen ? "Exit full screen" : "Open full screen"}
            className="text-ink-muted rounded-control ml-auto grid size-9 shrink-0 place-items-center sm:ml-0"
          >
            {fullScreen ? (
              <Expand aria-hidden="true" size={15} />
            ) : (
              <Maximize2 aria-hidden="true" size={15} />
            )}
          </button>
        </div>

        <div
          className="flex"
          style={{
            height: fullScreen
              ? "calc(100dvh - 72px)"
              : "max(420px, calc(100dvh - 132px))",
          }}
        >
          <aside
            className="border-divider bg-sidebar hidden shrink-0 overflow-auto border-r lg:block"
            style={{ width: toolsWidth }}
            aria-label="ERD tools"
          >
            <ToolPalette activeTool={activeTool} onSelect={selectTool} />
            {notationPanel}
          </aside>
          <div
            role="separator"
            aria-label="Resize tools panel"
            aria-orientation="vertical"
            aria-valuemin={160}
            aria-valuemax={320}
            aria-valuenow={toolsWidth}
            tabIndex={0}
            onPointerDown={beginToolsResize}
            onKeyDown={resizeToolsByKeyboard}
            className="bg-divider hover:bg-action hidden w-1 cursor-col-resize lg:block"
          />

          <div
            ref={canvasContainerRef}
            className="min-w-0 flex-1"
            onMouseMove={onCanvasMouseMove}
          >
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              onPaneClick={onPaneClick}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              defaultViewport={viewport}
              onMoveEnd={(_, nextViewport) => setViewport(nextViewport)}
              elementsSelectable
              // Dragging and clicking share a pointer gesture — if a click
              // has even a pixel of movement, React Flow treats it as a
              // drag and onNodeClick never fires. Only "select" mode needs
              // dragging, so every other tool gets an unambiguous click.
              nodesDraggable={activeTool === "select"}
              // Connections are drawn by clicking a node's connection-dot
              // (armed, no button held), not by React Flow's own built-in
              // handle-drag — see ConnectionHandle. connectionMode stays
              // "loose" regardless, since it's a cheap, harmless default
              // that also covers every handle being declared type="source"
              // (an ER relationship has no inherent incoming/outgoing side
              // the way a flowchart arrow would).
              connectionMode={ConnectionMode.Loose}
              proOptions={{ hideAttribution: true }}
              snapToGrid
              snapGrid={[GRID_SIZE, GRID_SIZE]}
            >
              <Background
                variant={BackgroundVariant.Dots}
                gap={GRID_SIZE}
                size={1.5}
              />
              <Controls showInteractive={false} />
              {pendingConnectionSourceId ? (
                <ViewportPortal>
                  <PendingConnectionPreview
                    sourceNode={reactFlow.getNode(pendingConnectionSourceId)}
                    sourcePosition={pendingConnectionSourcePosition}
                    waypoints={pendingConnectionWaypoints}
                    cursor={pendingConnectionCursor}
                    aligned={pendingConnectionAlignedTarget !== null}
                  />
                </ViewportPortal>
              ) : null}
            </ReactFlow>
          </div>
        </div>
      </section>

      {guideOpen ? (
        <GuideModal
          title="ERD Workspace guide"
          description="What you can do here, and a couple of starter diagrams."
          sections={erdGuideSections}
          samples={erdGuideSamples}
          samplesTitle="Starter diagrams"
          onInsertSample={insertSample}
          onClose={() => setGuideOpen(false)}
        />
      ) : null}

      {mobileToolsOpen ? (
        <div
          className="bg-canvas/80 fixed inset-0 z-[55] flex lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="ERD tools"
        >
          <aside className="border-structural bg-sidebar h-full w-[min(88vw,20rem)] overflow-auto border-r p-2">
            <div className="border-divider flex min-h-12 items-center justify-between border-b px-2">
              <span className="text-ink-primary text-sm font-semibold">
                Tools
              </span>
              <button
                onClick={() => setMobileToolsOpen(false)}
                aria-label="Close tools"
                className="text-ink-muted grid size-10 place-items-center"
              >
                <X aria-hidden="true" size={16} />
              </button>
            </div>
            <ToolPalette activeTool={activeTool} onSelect={selectTool} />
            {notationPanel}
          </aside>
          <button
            aria-label="Close tools"
            className="h-full flex-1"
            onClick={() => setMobileToolsOpen(false)}
          />
        </div>
      ) : null}
    </ErdInteractionContext.Provider>
  );
}

export function ErdWorkbench({ diagramId }: Readonly<{ diagramId: string }>) {
  return (
    <ReactFlowProvider>
      <ErdWorkbenchInner diagramId={diagramId} />
    </ReactFlowProvider>
  );
}
