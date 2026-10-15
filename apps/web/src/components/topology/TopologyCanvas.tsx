"use client";

import * as React from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  MiniMap,
  useReactFlow,
  type Node as FlowNode,
  type Edge as FlowEdge,
  type NodeChange,
} from "@xyflow/react";
import { useFilteredTopology } from "@/store/selectors";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";
import { LayoutWorkerBridge, computeStructuralFingerprint } from "@/lib/layout";
import { ServiceNode } from "./ServiceNode";
import { DatastoreNode } from "./DatastoreNode";
import { DatabaseNode } from "./DatabaseNode";
import { QueueNode } from "./QueueNode";
import { ExternalNode } from "./ExternalNode";
import { GroupNode } from "./GroupNode";
import { TrafficEdge } from "./TrafficEdge";
import { CanvasToolbar } from "./CanvasToolbar";
import { CanvasControls } from "./CanvasControls";
import { Legend } from "./Legend";
import { TopologyTableView } from "./TopologyTableView";
import { NodeDetailSheet } from "@/components/details/NodeDetailSheet";
import { VisuallyHidden } from "@/components/a11y/VisuallyHidden";
import type { Node as AppFlowNode, HealthStatus } from "@/types/contracts.gen";
import type { FlowNodeData, FlowEdgeData, GroupNodeData } from "./types";

const nodeTypes = {
  service: ServiceNode,
  datastore: DatastoreNode,
  database: DatabaseNode,
  queue: QueueNode,
  external: ExternalNode,
  group: GroupNode,
};

const edgeTypes = {
  traffic: TrafficEdge,
  default: TrafficEdge,
};

const LOD_THRESHOLD = 600;

function TopologyCanvasInner() {
  const { nodes: rawNodes, edges: rawEdges } = useFilteredTopology();
  const positions = useTopologyStore((s) => s.positions);
  const setNodePositions = useTopologyStore((s) => s.setNodePositions);

  const viewMode = useUiStore((s) => s.viewMode);
  const lodCollapsed = useUiStore((s) => s.lodCollapsed);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const selectNode = useUiStore((s) => s.selectNode);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const clearSelection = useUiStore((s) => s.clearSelection);
  const canvasActionTrigger = useUiStore((s) => s.canvasActionTrigger);
  const layoutLocked = useUiStore((s) => s.layoutLocked);

  const { fitView, zoomIn, zoomOut } = useReactFlow();
  const workerBridgeRef = React.useRef<LayoutWorkerBridge | null>(null);

  if (!workerBridgeRef.current) {
    workerBridgeRef.current = new LayoutWorkerBridge();
  }

  // Cleanup worker bridge on unmount per §3.7.6
  React.useEffect(() => {
    return () => {
      workerBridgeRef.current?.terminate();
      workerBridgeRef.current = null;
    };
  }, []);

  // Level of Detail (LOD) aggregation per §3.7.7
  const shouldCollapseLod =
    lodCollapsed === true || (lodCollapsed === "auto" && rawNodes.length > LOD_THRESHOLD);

  const { displayNodes, displayEdges } = React.useMemo(() => {
    if (!shouldCollapseLod) {
      return { displayNodes: rawNodes, displayEdges: rawEdges };
    }

    // Collapse proc: nodes into their parent svc: or group nodes
    const grouped = new Map<string, AppFlowNode[]>();
    const standalones: AppFlowNode[] = [];

    for (const node of rawNodes) {
      if (node.id.startsWith("proc:") && node.group_id) {
        const list = grouped.get(node.group_id) ?? [];
        list.push(node);
        grouped.set(node.group_id, list);
      } else {
        standalones.push(node);
      }
    }

    const aggregatedNodes: (AppFlowNode | GroupNodeData)[] = [...standalones];

    for (const [groupId, members] of grouped.entries()) {
      let totalRps = 0;
      let worstHealth: HealthStatus = "healthy";

      for (const m of members) {
        totalRps += m.metrics.rps;
        if (m.health === "critical") {
          worstHealth = "critical";
        } else if (m.health === "degraded" && worstHealth !== "critical") {
          worstHealth = "degraded";
        }
      }

      const groupNode: GroupNodeData = {
        id: `grp:${groupId}`,
        label: groupId,
        kind: "service",
        health: worstHealth,
        metrics: {
          rps: totalRps,
          p50_ms: 5,
          p99_ms: 10,
          error_rate: 0,
          saturation: 0.5,
          cpu_percent: 0,
          open_connections: 0,
          rss_bytes: 0,
          quality: "estimated",
        },
        group_id: groupId,
        memberCount: members.length,
        isCollapsed: true,
      };

      aggregatedNodes.push(groupNode);
    }

    return { displayNodes: aggregatedNodes, displayEdges: rawEdges };
  }, [rawNodes, rawEdges, shouldCollapseLod]);

  const lastFingerprintRef = React.useRef<string>("");

  // Compute layout when structural fingerprint changes (nodes/edges added or removed, or LOD toggle)
  React.useEffect(() => {
    if (layoutLocked || displayNodes.length === 0) {
      return;
    }

    const fingerprint = computeStructuralFingerprint(
      displayNodes.map((n) => n.id),
      displayEdges,
      shouldCollapseLod,
    );

    if (fingerprint === lastFingerprintRef.current) {
      return;
    }
    lastFingerprintRef.current = fingerprint;

    const bridge = workerBridgeRef.current;
    if (!bridge) {
      return;
    }

    const layoutNodes = displayNodes.map((n) => ({
      id: n.id,
      kind: n.kind,
      parentId: n.group_id ?? undefined,
    }));

    const layoutEdges = displayEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
    }));

    void bridge
      .computeLayout(layoutNodes, layoutEdges, { direction: "RIGHT" }, fingerprint)
      .then((newPos) => {
        setNodePositions(newPos);
      });
  }, [displayNodes, displayEdges, shouldCollapseLod, layoutLocked, setNodePositions]);

  // Handle external canvas actions triggered from UI store / command palette
  const lastActionTimestampRef = React.useRef<number>(0);
  React.useEffect(() => {
    if (!canvasActionTrigger || canvasActionTrigger.timestamp <= lastActionTimestampRef.current) {
      return;
    }
    lastActionTimestampRef.current = canvasActionTrigger.timestamp;

    switch (canvasActionTrigger.type) {
      case "fit-view":
        void fitView({ padding: 0.2, duration: 400 });
        break;
      case "zoom-in":
        void zoomIn({ duration: 250 });
        break;
      case "zoom-out":
        void zoomOut({ duration: 250 });
        break;
      case "relayout": {
        const bridge = workerBridgeRef.current;
        if (bridge) {
          const layoutNodes = displayNodes.map((n) => ({
            id: n.id,
            kind: n.kind,
            parentId: n.group_id ?? undefined,
          }));
          const layoutEdges = displayEdges.map((e) => ({
            id: e.id,
            source: e.source,
            target: e.target,
          }));
          void bridge
            .computeLayout(layoutNodes, layoutEdges, { direction: "RIGHT" })
            .then((newPos) => {
              setNodePositions(newPos);
              void fitView({ padding: 0.2, duration: 400 });
            });
        }
        break;
      }
    }
  }, [canvasActionTrigger, fitView, zoomIn, zoomOut, displayNodes, displayEdges, setNodePositions]);

  // Transform AppFlow entities to React Flow nodes
  const flowNodes = React.useMemo<FlowNode<FlowNodeData>[]>(() => {
    return displayNodes.map((node, idx) => {
      const pos = positions.get(node.id) ?? {
        x: (idx % 6) * 280 + 40,
        y: Math.floor(idx / 6) * 140 + 40,
      };

      const kind = node.kind.toLowerCase();
      const nodeType = kind in nodeTypes ? kind : "service";

      return {
        id: node.id,
        type: nodeType,
        position: pos,
        data: node as unknown as FlowNodeData,
        selected: selectedNodeId === node.id,
        focusable: true,
      };
    });
  }, [displayNodes, positions, selectedNodeId]);

  // Transform AppFlow entities to React Flow edges
  const flowEdges = React.useMemo<FlowEdge<FlowEdgeData>[]>(() => {
    return displayEdges.map((edge) => {
      return {
        id: edge.id,
        source: edge.source,
        target: edge.target,
        type: "traffic",
        data: edge as unknown as FlowEdgeData,
        focusable: true,
      };
    });
  }, [displayEdges]);

  // Keyboard navigation model (§3.5)
  const handleKeyDown = React.useCallback(
    (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT") {
        return;
      }

      if (e.key === "0") {
        e.preventDefault();
        void fitView({ padding: 0.2, duration: 400 });
        return;
      }

      if (e.key === "+" || e.key === "=") {
        e.preventDefault();
        void zoomIn({ duration: 250 });
        return;
      }

      if (e.key === "-") {
        e.preventDefault();
        void zoomOut({ duration: 250 });
        return;
      }

      if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setViewMode(viewMode === "canvas" ? "table" : "canvas");
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        clearSelection();
        return;
      }

      // Active node detection from focused DOM element or store selection (§3.5)
      const focusedNodeEl = document.activeElement?.closest("[data-node-id]") as HTMLElement | null;
      const activeNodeId = focusedNodeEl?.getAttribute("data-node-id") ?? selectedNodeId;

      if (e.key === "Enter" && activeNodeId) {
        e.preventDefault();
        selectNode(activeNodeId);
        return;
      }

      // Tab / Shift+Tab cycling nodes in stable order (severity -> label)
      if (e.key === "Tab" && flowNodes.length > 0) {
        const activeEl = document.activeElement;
        const isInCanvas =
          Boolean(activeEl?.closest('[role="application"]')) ||
          Boolean(activeEl?.closest("[data-node-id]"));

        if (isInCanvas) {
          e.preventDefault();
          const severityRank = (h: HealthStatus) =>
            h === "critical" ? 0 : h === "degraded" ? 1 : h === "healthy" ? 2 : 3;

          const sorted = [...flowNodes].sort((a, b) => {
            const rankDiff = severityRank(a.data.health) - severityRank(b.data.health);
            if (rankDiff !== 0) return rankDiff;
            return a.data.label.localeCompare(b.data.label);
          });

          const currentIndex = sorted.findIndex((n) => n.id === activeNodeId);
          let nextIndex = 0;
          if (currentIndex !== -1) {
            nextIndex = e.shiftKey
              ? (currentIndex - 1 + sorted.length) % sorted.length
              : (currentIndex + 1) % sorted.length;
          }

          const targetNode = sorted[nextIndex];
          if (targetNode) {
            selectNode(targetNode.id);
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`[data-node-id="${targetNode.id}"]`)?.focus();
            });
          }
          return;
        }
      }

      // Directional keyboard neighbour traversal (§3.5)
      if (
        (e.key === "ArrowUp" ||
          e.key === "ArrowDown" ||
          e.key === "ArrowLeft" ||
          e.key === "ArrowRight") &&
        flowNodes.length > 0
      ) {
        e.preventDefault();

        // If no active node yet, focus/select the first node
        if (!activeNodeId) {
          const first = flowNodes[0];
          if (first) {
            selectNode(first.id);
            requestAnimationFrame(() => {
              document.querySelector<HTMLElement>(`[data-node-id="${first.id}"]`)?.focus();
            });
          }
          return;
        }

        const currentNode = flowNodes.find((n) => n.id === activeNodeId);
        if (!currentNode) return;

        const currentPos = currentNode.position;

        // Connected neighbours (upstream or downstream connected edges)
        const connectedNodeIds = new Set<string>();
        for (const edge of displayEdges) {
          if (edge.source === activeNodeId) {
            connectedNodeIds.add(edge.target);
          }
          if (edge.target === activeNodeId) {
            connectedNodeIds.add(edge.source);
          }
        }

        let bestConnectedCandidate: FlowNode<FlowNodeData> | null = null;
        let bestConnectedDist = Number.POSITIVE_INFINITY;

        let bestSpatialCandidate: FlowNode<FlowNodeData> | null = null;
        let bestSpatialDist = Number.POSITIVE_INFINITY;

        for (const candidate of flowNodes) {
          if (candidate.id === currentNode.id) continue;
          const dx = candidate.position.x - currentPos.x;
          const dy = candidate.position.y - currentPos.y;

          let isDirectionValid = false;
          if (e.key === "ArrowRight" && dx > 10) isDirectionValid = true;
          if (e.key === "ArrowLeft" && dx < -10) isDirectionValid = true;
          if (e.key === "ArrowDown" && dy > 10) isDirectionValid = true;
          if (e.key === "ArrowUp" && dy < -10) isDirectionValid = true;

          if (isDirectionValid) {
            const distance = Math.hypot(dx, dy);
            if (distance < bestSpatialDist) {
              bestSpatialDist = distance;
              bestSpatialCandidate = candidate;
            }
            if (connectedNodeIds.has(candidate.id) && distance < bestConnectedDist) {
              bestConnectedDist = distance;
              bestConnectedCandidate = candidate;
            }
          }
        }

        // Priority 1: Connected neighbour in requested direction; Priority 2: Nearest spatial candidate
        const chosenCandidate = bestConnectedCandidate ?? bestSpatialCandidate;
        if (chosenCandidate) {
          selectNode(chosenCandidate.id);
          requestAnimationFrame(() => {
            document.querySelector<HTMLElement>(`[data-node-id="${chosenCandidate.id}"]`)?.focus();
          });
        }
      }
    },
    [
      flowNodes,
      displayEdges,
      selectedNodeId,
      fitView,
      zoomIn,
      zoomOut,
      viewMode,
      setViewMode,
      selectNode,
      clearSelection,
    ],
  );

  React.useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);

  const onNodesChange = React.useCallback(
    (changes: NodeChange<FlowNode<FlowNodeData>>[]) => {
      if (layoutLocked) return;
      for (const change of changes) {
        if (change.type === "position" && change.position) {
          setNodePositions({ [change.id]: change.position });
        }
      }
    },
    [layoutLocked, setNodePositions],
  );

  return (
    <>
      {viewMode === "table" ? (
        <div className="relative flex h-full w-full flex-col p-4">
          <CanvasToolbar className="mb-3 shrink-0" />
          <div className="flex-1 overflow-hidden">
            <TopologyTableView />
          </div>
        </div>
      ) : (
        <div
          role="application"
          aria-roledescription="topology map"
          aria-label="Interactive Topology Map"
          aria-describedby="canvas-keyboard-instructions"
          tabIndex={-1}
          className="relative h-full w-full overflow-hidden bg-[var(--bg)] outline-none"
        >
          <VisuallyHidden id="canvas-keyboard-instructions">
            Interactive topology map. Use Tab or Shift+Tab to cycle through nodes by severity. Use
            Arrow keys to navigate between spatially adjacent nodes. Press Enter to view node
            details. Press Escape to clear selection. Press 0 to fit view. Press + or - to zoom.
            Press T to switch to accessible table presentation. Press / to filter nodes.
          </VisuallyHidden>

          {/* Floating Canvas Toolbar */}
          <div className="pointer-events-none absolute top-4 right-4 left-4 z-10 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CanvasToolbar className="w-full sm:w-auto" />
          </div>

          {/* React Flow Canvas Island */}
          <ReactFlow<FlowNode<FlowNodeData>, FlowEdge<FlowEdgeData>>
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            onNodesChange={onNodesChange}
            onlyRenderVisibleElements={true}
            nodesFocusable={true}
            edgesFocusable={true}
            defaultViewport={{ x: 80, y: 80, zoom: 0.9 }}
            minZoom={0.2}
            maxZoom={2.5}
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="var(--border-strong)" gap={24} size={1.2} />
            <MiniMap
              nodeStrokeWidth={3}
              zoomable
              pannable
              className="!right-4 !bottom-4 !m-0 overflow-hidden rounded-lg !border !border-[var(--border)] !bg-[var(--surface-solid)]"
            />
          </ReactFlow>

          {/* Floating Canvas Controls & Legend */}
          <div className="pointer-events-none absolute bottom-4 left-4 z-10 flex flex-col gap-2">
            <Legend />
            <CanvasControls
              onRelayout={() => {
                const bridge = workerBridgeRef.current;
                if (bridge) {
                  const layoutNodes = displayNodes.map((n) => ({
                    id: n.id,
                    kind: n.kind,
                    parentId: n.group_id ?? undefined,
                  }));
                  const layoutEdges = displayEdges.map((e) => ({
                    id: e.id,
                    source: e.source,
                    target: e.target,
                  }));
                  void bridge
                    .computeLayout(layoutNodes, layoutEdges, { direction: "RIGHT" })
                    .then((newPos) => {
                      setNodePositions(newPos);
                      void fitView({ padding: 0.2, duration: 400 });
                    });
                }
              }}
            />
          </div>
        </div>
      )}

      {/* Progressive Disclosure Detail Sheet (§3.3) */}
      <NodeDetailSheet />
    </>
  );
}

export function TopologyCanvas() {
  return (
    <ReactFlowProvider>
      <TopologyCanvasInner />
    </ReactFlowProvider>
  );
}
