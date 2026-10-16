/**
 * Normalized topology store utilizing Map and Set for high-performance updates.
 * Adheres to strict structural sharing and atomic cascade removal (§3.7).
 */

import { create } from "zustand";
import type {
  DeltaPayload,
  Edge,
  MetaResponse,
  Node,
  ScenarioInfo,
  TopologyGraph,
} from "@/types/contracts.gen";
import { RingBuffer } from "./ring-buffer";
import { useUiStore } from "./ui-store";

export interface NodeHistoryBuffers {
  rps: RingBuffer;
  p99_ms: RingBuffer;
  error_rate: RingBuffer;
  saturation: RingBuffer;
}

export interface EdgeHistoryBuffers {
  rps: RingBuffer;
  p99_ms: RingBuffer;
  error_rate: RingBuffer;
}

export interface TopologyStoreState {
  nodes: Map<string, Node>;
  edges: Map<string, Edge>;
  adjacency: Map<string, Set<string>>;
  nodeHistory: Map<string, NodeHistoryBuffers>;
  edgeHistory: Map<string, EdgeHistoryBuffers>;
  positions: Map<string, { x: number; y: number }>;
  seq: number | null;
  meta: MetaResponse | null;
  activeScenario: ScenarioInfo | null;
  tickAgeMs: number | null;
  lastUpdatedAt: string | null;
  version: number;

  setMeta: (meta: MetaResponse) => void;
  setScenario: (scenario: ScenarioInfo | null) => void;
  setTickAge: (tickAgeMs: number) => void;
  setNodePositions: (
    positions:
      ReadonlyMap<string, { x: number; y: number }> | Record<string, { x: number; y: number }>,
  ) => void;
  applySnapshot: (graph: TopologyGraph, seq: number) => void;
  applyDelta: (delta: DeltaPayload, seq: number) => void;
  applyDeltas: (deltas: Array<{ delta: DeltaPayload; seq: number }>) => void;
  reset: () => void;
}

function createNodeHistory(): NodeHistoryBuffers {
  return {
    rps: new RingBuffer(120),
    p99_ms: new RingBuffer(120),
    error_rate: new RingBuffer(120),
    saturation: new RingBuffer(120),
  };
}

function createEdgeHistory(): EdgeHistoryBuffers {
  return {
    rps: new RingBuffer(120),
    p99_ms: new RingBuffer(120),
    error_rate: new RingBuffer(120),
  };
}

function recordNodeMetrics(history: NodeHistoryBuffers, node: Node): void {
  history.rps.push(node.metrics.rps);
  history.p99_ms.push(node.metrics.p99_ms);
  history.error_rate.push(node.metrics.error_rate);
  history.saturation.push(node.metrics.saturation);
}

function recordEdgeMetrics(history: EdgeHistoryBuffers, edge: Edge): void {
  history.rps.push(edge.metrics.rps);
  history.p99_ms.push(edge.metrics.p99_ms);
  history.error_rate.push(edge.metrics.error_rate);
}

function isPositionMap(
  val: ReadonlyMap<string, { x: number; y: number }> | Record<string, { x: number; y: number }>,
): val is ReadonlyMap<string, { x: number; y: number }> {
  return "entries" in val && typeof val.entries === "function";
}

export const useTopologyStore = create<TopologyStoreState>((set) => ({
  nodes: new Map(),
  edges: new Map(),
  adjacency: new Map(),
  nodeHistory: new Map(),
  edgeHistory: new Map(),
  positions: new Map(),
  seq: null,
  meta: null,
  activeScenario: null,
  tickAgeMs: null,
  lastUpdatedAt: null,
  version: 0,

  setMeta: (meta) => {
    set({ meta });
  },
  setScenario: (activeScenario) => {
    set({ activeScenario });
  },
  setTickAge: (tickAgeMs) => {
    set({ tickAgeMs });
  },

  setNodePositions: (positions) => {
    set((state) => {
      const nextPositions = new Map(state.positions);
      if (isPositionMap(positions)) {
        for (const [k, v] of positions.entries()) {
          nextPositions.set(k, v);
        }
      } else {
        for (const k of Object.keys(positions)) {
          const v = positions[k];
          if (v !== undefined) {
            nextPositions.set(k, v);
          }
        }
      }
      return { positions: nextPositions, version: state.version + 1 };
    });
  },

  applySnapshot: (graph, seq) => {
    set((state) => {
      const nextNodes = new Map<string, Node>();
      const nextEdges = new Map<string, Edge>();
      const nextAdjacency = new Map<string, Set<string>>();
      const nextNodeHistory = new Map(state.nodeHistory);
      const nextEdgeHistory = new Map(state.edgeHistory);
      const nextPositions = new Map(state.positions);

      // Populate nodes
      const graphNodes = graph.nodes ?? [];
      for (const node of graphNodes) {
        nextNodes.set(node.id, node);
        nextAdjacency.set(node.id, new Set<string>());

        let hist = nextNodeHistory.get(node.id);
        if (!hist) {
          hist = createNodeHistory();
          nextNodeHistory.set(node.id, hist);
        }
        recordNodeMetrics(hist, node);
      }

      // Prune dead node history and positions
      for (const id of nextNodeHistory.keys()) {
        if (!nextNodes.has(id)) {
          nextNodeHistory.delete(id);
        }
      }
      for (const id of nextPositions.keys()) {
        if (!nextNodes.has(id)) {
          nextPositions.delete(id);
        }
      }

      // Populate edges
      const graphEdges = graph.edges ?? [];
      for (const edge of graphEdges) {
        nextEdges.set(edge.id, edge);

        let srcAdj = nextAdjacency.get(edge.source);
        if (!srcAdj) {
          srcAdj = new Set<string>();
          nextAdjacency.set(edge.source, srcAdj);
        }
        srcAdj.add(edge.id);

        let dstAdj = nextAdjacency.get(edge.target);
        if (!dstAdj) {
          dstAdj = new Set<string>();
          nextAdjacency.set(edge.target, dstAdj);
        }
        dstAdj.add(edge.id);

        let hist = nextEdgeHistory.get(edge.id);
        if (!hist) {
          hist = createEdgeHistory();
          nextEdgeHistory.set(edge.id, hist);
        }
        recordEdgeMetrics(hist, edge);
      }

      // Prune dead edge history
      for (const id of nextEdgeHistory.keys()) {
        if (!nextEdges.has(id)) {
          nextEdgeHistory.delete(id);
        }
      }

      const uiState = useUiStore.getState();
      if (
        (uiState.selectedNodeId !== null && !nextNodes.has(uiState.selectedNodeId)) ||
        (uiState.selectedEdgeId !== null && !nextEdges.has(uiState.selectedEdgeId))
      ) {
        uiState.clearSelection();
      }

      return {
        nodes: nextNodes,
        edges: nextEdges,
        adjacency: nextAdjacency,
        nodeHistory: nextNodeHistory,
        edgeHistory: nextEdgeHistory,
        positions: nextPositions,
        seq,
        lastUpdatedAt: graph.timestamp ?? new Date().toISOString(),
        version: state.version + 1,
      };
    });
  },

  applyDelta: (delta, seq) => {
    useTopologyStore.getState().applyDeltas([{ delta, seq }]);
  },

  applyDeltas: (deltas) => {
    if (deltas.length === 0) {
      return;
    }

    const hasStructuralChanges = deltas.some(
      ({ delta }) =>
        (delta.removed_node_ids?.length ?? 0) > 0 ||
        (delta.removed_edge_ids?.length ?? 0) > 0 ||
        (delta.added_nodes?.length ?? 0) > 0 ||
        (delta.added_edges?.length ?? 0) > 0,
    );

    set((state) => {
      const nextNodes = new Map(state.nodes);
      const nextEdges = new Map(state.edges);
      let nextAdjacency = state.adjacency;
      let nextPositions = state.positions;
      if (hasStructuralChanges) {
        nextAdjacency = new Map<string, Set<string>>();
        for (const [k, v] of state.adjacency) {
          nextAdjacency.set(k, new Set(v));
        }
        nextPositions = new Map(state.positions);
      }
      const nextNodeHistory = new Map(state.nodeHistory);
      const nextEdgeHistory = new Map(state.edgeHistory);

      let lastSeq = state.seq;

      for (const { delta, seq } of deltas) {
        lastSeq = seq;

        // 1. Cascade removal: gather all edges explicitly removed or incident to removed nodes
        const removedNodeIds = new Set(delta.removed_node_ids ?? []);
        const edgesToRemove = new Set(delta.removed_edge_ids ?? []);

        for (const nodeId of removedNodeIds) {
          const incidentEdges = nextAdjacency.get(nodeId);
          if (incidentEdges) {
            for (const edgeId of incidentEdges) {
              edgesToRemove.add(edgeId);
            }
          }
        }

        for (const edgeId of edgesToRemove) {
          const edge = nextEdges.get(edgeId);
          if (edge) {
            nextAdjacency.get(edge.source)?.delete(edgeId);
            nextAdjacency.get(edge.target)?.delete(edgeId);
            nextEdges.delete(edgeId);
            nextEdgeHistory.delete(edgeId);
          }
        }

        for (const nodeId of removedNodeIds) {
          nextNodes.delete(nodeId);
          nextAdjacency.delete(nodeId);
          nextNodeHistory.delete(nodeId);
          nextPositions.delete(nodeId);
        }

        if (removedNodeIds.size > 0 || edgesToRemove.size > 0) {
          const uiState = useUiStore.getState();
          if (
            (uiState.selectedNodeId !== null && removedNodeIds.has(uiState.selectedNodeId)) ||
            (uiState.selectedEdgeId !== null && edgesToRemove.has(uiState.selectedEdgeId))
          ) {
            uiState.clearSelection();
          }
        }

        // 2. Added nodes
        if (delta.added_nodes && delta.added_nodes.length > 0) {
          for (const node of delta.added_nodes) {
            nextNodes.set(node.id, node);
            if (!nextAdjacency.has(node.id)) {
              nextAdjacency.set(node.id, new Set<string>());
            }
            let hist = nextNodeHistory.get(node.id);
            if (!hist) {
              hist = createNodeHistory();
              nextNodeHistory.set(node.id, hist);
            }
            recordNodeMetrics(hist, node);
          }
        }

        // 3. Updated nodes (structural sharing)
        if (delta.updated_nodes && delta.updated_nodes.length > 0) {
          for (const patch of delta.updated_nodes) {
            const prevNode = nextNodes.get(patch.id);
            if (prevNode) {
              const healthReasons =
                patch.health_reasons !== undefined && patch.health_reasons !== null
                  ? patch.health_reasons
                  : prevNode.health_reasons;

              const updatedNode: Node = {
                ...prevNode,
                health:
                  patch.health !== undefined && patch.health !== null
                    ? patch.health
                    : prevNode.health,
                metrics:
                  patch.metrics !== undefined && patch.metrics !== null
                    ? patch.metrics
                    : prevNode.metrics,
                ...(healthReasons !== undefined ? { health_reasons: healthReasons } : {}),
              };
              nextNodes.set(patch.id, updatedNode);

              let hist = nextNodeHistory.get(patch.id);
              if (!hist) {
                hist = createNodeHistory();
                nextNodeHistory.set(patch.id, hist);
              }
              recordNodeMetrics(hist, updatedNode);
            }
          }
        }

        // 4. Added edges
        if (delta.added_edges && delta.added_edges.length > 0) {
          for (const edge of delta.added_edges) {
            nextEdges.set(edge.id, edge);

            let srcAdj = nextAdjacency.get(edge.source);
            if (!srcAdj) {
              srcAdj = new Set<string>();
              nextAdjacency.set(edge.source, srcAdj);
            }
            srcAdj.add(edge.id);

            let dstAdj = nextAdjacency.get(edge.target);
            if (!dstAdj) {
              dstAdj = new Set<string>();
              nextAdjacency.set(edge.target, dstAdj);
            }
            dstAdj.add(edge.id);

            let hist = nextEdgeHistory.get(edge.id);
            if (!hist) {
              hist = createEdgeHistory();
              nextEdgeHistory.set(edge.id, hist);
            }
            recordEdgeMetrics(hist, edge);
          }
        }

        // 5. Updated edges (structural sharing)
        if (delta.updated_edges && delta.updated_edges.length > 0) {
          for (const patch of delta.updated_edges) {
            const prevEdge = nextEdges.get(patch.id);
            if (prevEdge) {
              const updatedEdge: Edge = {
                ...prevEdge,
                health:
                  patch.health !== undefined && patch.health !== null
                    ? patch.health
                    : prevEdge.health,
                metrics:
                  patch.metrics !== undefined && patch.metrics !== null
                    ? patch.metrics
                    : prevEdge.metrics,
              };
              nextEdges.set(patch.id, updatedEdge);

              let hist = nextEdgeHistory.get(patch.id);
              if (!hist) {
                hist = createEdgeHistory();
                nextEdgeHistory.set(patch.id, hist);
              }
              recordEdgeMetrics(hist, updatedEdge);
            }
          }
        }
      }

      return {
        nodes: nextNodes,
        edges: nextEdges,
        adjacency: nextAdjacency,
        nodeHistory: nextNodeHistory,
        edgeHistory: nextEdgeHistory,
        positions: nextPositions,
        seq: lastSeq,
        version: state.version + 1,
      };
    });
  },

  reset: () => {
    set({
      nodes: new Map(),
      edges: new Map(),
      adjacency: new Map(),
      nodeHistory: new Map(),
      edgeHistory: new Map(),
      positions: new Map(),
      seq: null,
      meta: null,
      activeScenario: null,
      tickAgeMs: null,
      lastUpdatedAt: null,
      version: 0,
    });
  },
}));
