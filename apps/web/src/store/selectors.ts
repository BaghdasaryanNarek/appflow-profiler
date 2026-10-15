/**
 * Memoized Zustand selectors and React hooks with shallow equality (§3.7).
 */

import * as React from "react";
import { useShallow } from "zustand/react/shallow";
import type { Edge, NeighbourRef, Node } from "@/types/contracts.gen";
import { useTopologyStore, type TopologyStoreState } from "./topology-store";
import { useUiStore, type UiStoreState } from "./ui-store";

export interface FilteredTopology {
  nodes: Node[];
  edges: Edge[];
  nodeMap: Map<string, Node>;
  edgeMap: Map<string, Edge>;
}

export interface KpiSummaryData {
  nodeCount: number;
  edgeCount: number;
  totalRps: number;
  globalP99Ms: number;
  globalErrorRate: number;
  criticalCount: number;
  degradedCount: number;
  healthyCount: number;
  mode: "live" | "demo";
  activeScenario: string | null;
  generatedAt: string;
}

export interface SelectedEntityData {
  selectedNode: Node | null;
  selectedEdge: Edge | null;
  neighbours: {
    up: NeighbourRef[];
    down: NeighbourRef[];
  };
  nodeHistory: {
    rps: number[];
    p99_ms: number[];
    error_rate: number[];
    saturation: number[];
  } | null;
  edgeHistory: {
    rps: number[];
    p99_ms: number[];
    error_rate: number[];
  } | null;
}

/**
 * Pure selector computing filtered topology matching active UI filters.
 */
export function selectFilteredTopology(
  topology: TopologyStoreState,
  ui: UiStoreState,
): FilteredTopology {
  const filteredNodes: Node[] = [];
  const nodeMap = new Map<string, Node>();
  const query = ui.searchQuery.trim().toLowerCase();
  const kindFilterActive = ui.kinds.length > 0;
  const kindsSet = kindFilterActive ? new Set(ui.kinds) : null;

  for (const node of topology.nodes.values()) {
    if (kindsSet && !kindsSet.has(node.kind)) {
      continue;
    }
    if (ui.minRps > 0 && node.metrics.rps < ui.minRps) {
      continue;
    }
    if (ui.groupId && node.group_id !== ui.groupId) {
      continue;
    }
    if (
      query &&
      !node.label.toLowerCase().includes(query) &&
      !node.id.toLowerCase().includes(query)
    ) {
      continue;
    }
    filteredNodes.push(node);
    nodeMap.set(node.id, node);
  }

  const filteredEdges: Edge[] = [];
  const edgeMap = new Map<string, Edge>();

  for (const edge of topology.edges.values()) {
    if (ui.minRps > 0 && edge.metrics.rps < ui.minRps) {
      continue;
    }
    // Edges are only included if both endpoints are visible in filtered nodes
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      filteredEdges.push(edge);
      edgeMap.set(edge.id, edge);
    }
  }

  return {
    nodes: filteredNodes,
    edges: filteredEdges,
    nodeMap,
    edgeMap,
  };
}

/**
 * Pure selector computing KPI metrics across the active topology.
 */
export function selectKpiSummary(topology: TopologyStoreState): KpiSummaryData {
  let totalRps = 0;
  let totalLatencyProduct = 0;
  let totalErrors = 0;
  let criticalCount = 0;
  let degradedCount = 0;
  let healthyCount = 0;

  for (const node of topology.nodes.values()) {
    totalRps += node.metrics.rps;
    totalLatencyProduct += node.metrics.p99_ms * node.metrics.rps;
    totalErrors += node.metrics.error_rate * node.metrics.rps;

    switch (node.health) {
      case "critical":
        criticalCount++;
        break;
      case "degraded":
        degradedCount++;
        break;
      case "healthy":
        healthyCount++;
        break;
    }
  }

  const globalP99Ms = totalRps > 0 ? totalLatencyProduct / totalRps : 0;
  const globalErrorRate = totalRps > 0 ? totalErrors / totalRps : 0;
  const mode = topology.meta?.mode ?? "demo";

  return {
    nodeCount: topology.nodes.size,
    edgeCount: topology.edges.size,
    totalRps,
    globalP99Ms,
    globalErrorRate,
    criticalCount,
    degradedCount,
    healthyCount,
    mode,
    activeScenario: topology.activeScenario?.id ?? null,
    generatedAt: topology.lastUpdatedAt ?? "",
  };
}

/**
 * Pure selector computing details and neighbour relationships for the selected node/edge.
 */
export function selectSelectedEntity(
  topology: TopologyStoreState,
  ui: UiStoreState,
): SelectedEntityData {
  const selectedNode = ui.selectedNodeId ? (topology.nodes.get(ui.selectedNodeId) ?? null) : null;
  const selectedEdge = ui.selectedEdgeId ? (topology.edges.get(ui.selectedEdgeId) ?? null) : null;

  const up: NeighbourRef[] = [];
  const down: NeighbourRef[] = [];

  if (selectedNode) {
    const incidentEdges = topology.adjacency.get(selectedNode.id);
    if (incidentEdges) {
      for (const edgeId of incidentEdges) {
        const edge = topology.edges.get(edgeId);
        if (!edge) {
          continue;
        }

        if (edge.target === selectedNode.id) {
          const upstreamNode = topology.nodes.get(edge.source);
          if (upstreamNode) {
            up.push({
              node_id: upstreamNode.id,
              edge_id: edge.id,
              label: upstreamNode.label,
              kind: upstreamNode.kind,
              health: edge.health,
              protocol: edge.protocol,
              rps: edge.metrics.rps,
            });
          }
        }

        if (edge.source === selectedNode.id) {
          const downstreamNode = topology.nodes.get(edge.target);
          if (downstreamNode) {
            down.push({
              node_id: downstreamNode.id,
              edge_id: edge.id,
              label: downstreamNode.label,
              kind: downstreamNode.kind,
              health: edge.health,
              protocol: edge.protocol,
              rps: edge.metrics.rps,
            });
          }
        }
      }
    }
  }

  let nodeHistory: SelectedEntityData["nodeHistory"] = null;
  if (selectedNode) {
    const historyBuffers = topology.nodeHistory.get(selectedNode.id);
    if (historyBuffers) {
      nodeHistory = {
        rps: historyBuffers.rps.toArray(),
        p99_ms: historyBuffers.p99_ms.toArray(),
        error_rate: historyBuffers.error_rate.toArray(),
        saturation: historyBuffers.saturation.toArray(),
      };
    }
  }

  let edgeHistory: SelectedEntityData["edgeHistory"] = null;
  if (selectedEdge) {
    const historyBuffers = topology.edgeHistory.get(selectedEdge.id);
    if (historyBuffers) {
      edgeHistory = {
        rps: historyBuffers.rps.toArray(),
        p99_ms: historyBuffers.p99_ms.toArray(),
        error_rate: historyBuffers.error_rate.toArray(),
      };
    }
  }

  return {
    selectedNode,
    selectedEdge,
    neighbours: { up, down },
    nodeHistory,
    edgeHistory,
  };
}

/**
 * Hook subscribing to filtered topology state, memoized by filters and topology version (§3.7).
 */
export function useFilteredTopology(): FilteredTopology {
  const nodesMap = useTopologyStore((s) => s.nodes);
  const edgesMap = useTopologyStore((s) => s.edges);

  const kinds = useUiStore((s) => s.kinds);
  const minRps = useUiStore((s) => s.minRps);
  const groupId = useUiStore((s) => s.groupId);
  const searchQuery = useUiStore((s) => s.searchQuery);

  return React.useMemo(() => {
    return selectFilteredTopology(
      { nodes: nodesMap, edges: edgesMap } as unknown as TopologyStoreState,
      { kinds, minRps, groupId, searchQuery } as UiStoreState,
    );
  }, [nodesMap, edgesMap, kinds, minRps, groupId, searchQuery]);
}

/**
 * Hook subscribing to fleet KPI summary calculations.
 */
export function useKpiSummary(): KpiSummaryData {
  return useTopologyStore(useShallow(selectKpiSummary));
}

/**
 * Hook subscribing to selected entity details, neighbours, and sparkline series.
 */
export function useSelectedEntity(): SelectedEntityData {
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);
  const topology = useTopologyStore((s) => s);

  return React.useMemo(() => {
    return selectSelectedEntity(topology, {
      selectedNodeId,
      selectedEdgeId,
    } as UiStoreState);
  }, [topology, selectedNodeId, selectedEdgeId]);
}
