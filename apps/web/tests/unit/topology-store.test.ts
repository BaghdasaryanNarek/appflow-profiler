import { beforeEach, describe, expect, it } from "vitest";
import type { DeltaPayload, Edge, Node, TopologyGraph } from "@/types/contracts.gen";
import { useTopologyStore } from "@/store/topology-store";

function makeDummyNode(id: string, label: string = id): Node {
  return {
    id,
    label,
    kind: "service",
    health: "healthy",
    metrics: {
      rps: 100,
      p50_ms: 20,
      p99_ms: 50,
      error_rate: 0.001,
      saturation: 0.45,
      cpu_percent: 25,
      rss_bytes: 104857600,
      open_connections: 12,
      quality: "simulated",
    },
    tags: {},
  };
}

function makeDummyEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    protocol: "http",
    health: "healthy",
    metrics: {
      rps: 100,
      bytes_per_sec: 50000,
      p99_ms: 25,
      error_rate: 0.001,
      connection_count: 5,
      retry_rate: 0.0,
      quality: "simulated",
      state_breakdown: {
        ESTABLISHED: 5,
      },
    },
  };
}

describe("useTopologyStore", () => {
  beforeEach(() => {
    useTopologyStore.getState().reset();
  });

  it("applies full snapshot correctly and seeds history ring buffers", () => {
    const store = useTopologyStore.getState();
    const nodeA = makeDummyNode("node-a");
    const nodeB = makeDummyNode("node-b");
    const edgeAB = makeDummyEdge("edge:node-a->node-b:http", "node-a", "node-b");

    const graph: TopologyGraph = {
      nodes: [nodeA, nodeB],
      edges: [edgeAB],
      timestamp: "2026-10-15T00:00:00Z",
    };

    store.applySnapshot(graph, 1);

    const state = useTopologyStore.getState();
    expect(state.seq).toBe(1);
    expect(state.nodes.size).toBe(2);
    expect(state.edges.size).toBe(1);
    expect(state.adjacency.get("node-a")?.has(edgeAB.id)).toBe(true);
    expect(state.adjacency.get("node-b")?.has(edgeAB.id)).toBe(true);

    const histA = state.nodeHistory.get("node-a");
    expect(histA).toBeDefined();
    expect(histA?.rps.latest()).toBe(100);
    expect(histA?.p99_ms.latest()).toBe(50);

    const histEdge = state.edgeHistory.get(edgeAB.id);
    expect(histEdge).toBeDefined();
    expect(histEdge?.rps.latest()).toBe(100);
  });

  it("preserves object reference identity for unchanged entities (structural sharing)", () => {
    const nodeA = makeDummyNode("node-a");
    const nodeB = makeDummyNode("node-b");
    const edgeAB = makeDummyEdge("edge:node-a->node-b:http", "node-a", "node-b");

    useTopologyStore.getState().applySnapshot(
      {
        nodes: [nodeA, nodeB],
        edges: [edgeAB],
      },
      1,
    );

    const stateBefore = useTopologyStore.getState();
    const refNodeA = stateBefore.nodes.get("node-a");
    const refNodeB = stateBefore.nodes.get("node-b");
    const refEdgeAB = stateBefore.edges.get(edgeAB.id);
    const versionBefore = stateBefore.version;

    // Delta updates ONLY node-b metrics
    const delta: DeltaPayload = {
      base_seq: 1,
      added_nodes: [],
      removed_node_ids: [],
      updated_nodes: [
        {
          id: "node-b",
          health: "degraded",
          metrics: {
            ...nodeB.metrics,
            rps: 250,
            p99_ms: 450,
          },
        },
      ],
      added_edges: [],
      removed_edge_ids: [],
      updated_edges: [],
    };

    useTopologyStore.getState().applyDelta(delta, 2);

    const stateAfter = useTopologyStore.getState();
    expect(stateAfter.version).toBeGreaterThan(versionBefore);

    // Unchanged node-a and edgeAB MUST preserve strict referential equality
    expect(stateAfter.nodes.get("node-a")).toBe(refNodeA);
    expect(stateAfter.edges.get(edgeAB.id)).toBe(refEdgeAB);

    // Changed node-b MUST receive a new object reference
    const updatedNodeB = stateAfter.nodes.get("node-b");
    expect(updatedNodeB).not.toBe(refNodeB);
    expect(updatedNodeB?.health).toBe("degraded");
    expect(updatedNodeB?.metrics.rps).toBe(250);

    // Node-b history must contain the new data point
    const histB = stateAfter.nodeHistory.get("node-b");
    expect(histB?.rps.latest()).toBe(250);
    expect(histB?.p99_ms.latest()).toBe(450);
  });

  it("enforces the cascade removal invariant returning all map sizes strictly to baseline", () => {
    // 1. Establish initial baseline
    const nodeA = makeDummyNode("node-a");
    const nodeB = makeDummyNode("node-b");
    const edgeAB = makeDummyEdge("edge:node-a->node-b:http", "node-a", "node-b");

    useTopologyStore.getState().applySnapshot(
      {
        nodes: [nodeA, nodeB],
        edges: [edgeAB],
      },
      1,
    );
    useTopologyStore.getState().setNodePositions({
      "node-a": { x: 100, y: 100 },
      "node-b": { x: 300, y: 100 },
    });

    const baseline = useTopologyStore.getState();
    const baseNodeCount = baseline.nodes.size;
    const baseEdgeCount = baseline.edges.size;
    const baseAdjCount = baseline.adjacency.size;
    const baseNodeHistCount = baseline.nodeHistory.size;
    const baseEdgeHistCount = baseline.edgeHistory.size;
    const basePositionsCount = baseline.positions.size;

    expect(baseNodeCount).toBe(2);
    expect(baseEdgeCount).toBe(1);
    expect(baseAdjCount).toBe(2);
    expect(basePositionsCount).toBe(2);

    // 2. Add node-c and 2 incident edges (a->c and c->b) + node-c position
    const nodeC = makeDummyNode("node-c");
    const edgeAC = makeDummyEdge("edge:node-a->node-c:http", "node-a", "node-c");
    const edgeCB = makeDummyEdge("edge:node-c->node-b:http", "node-c", "node-b");

    const addDelta: DeltaPayload = {
      base_seq: 1,
      added_nodes: [nodeC],
      updated_nodes: [],
      removed_node_ids: [],
      added_edges: [edgeAC, edgeCB],
      updated_edges: [],
      removed_edge_ids: [],
    };

    useTopologyStore.getState().applyDelta(addDelta, 2);
    useTopologyStore.getState().setNodePositions({
      "node-c": { x: 200, y: 250 },
    });

    const intermediate = useTopologyStore.getState();
    expect(intermediate.nodes.size).toBe(baseNodeCount + 1);
    expect(intermediate.edges.size).toBe(baseEdgeCount + 2);
    expect(intermediate.positions.size).toBe(basePositionsCount + 1);
    expect(intermediate.adjacency.get("node-a")?.has(edgeAC.id)).toBe(true);
    expect(intermediate.adjacency.get("node-b")?.has(edgeCB.id)).toBe(true);

    // 3. Atomically remove node-c via delta
    const removeDelta: DeltaPayload = {
      base_seq: 2,
      added_nodes: [],
      updated_nodes: [],
      removed_node_ids: ["node-c"],
      added_edges: [],
      updated_edges: [],
      removed_edge_ids: [],
    };

    useTopologyStore.getState().applyDelta(removeDelta, 3);

    // 4. Assert ALL store map sizes return strictly to their pre-addition baseline
    const finalState = useTopologyStore.getState();
    expect(finalState.nodes.size).toBe(baseNodeCount);
    expect(finalState.edges.size).toBe(baseEdgeCount);
    expect(finalState.adjacency.size).toBe(baseAdjCount);
    expect(finalState.nodeHistory.size).toBe(baseNodeHistCount);
    expect(finalState.edgeHistory.size).toBe(baseEdgeHistCount);
    expect(finalState.positions.size).toBe(basePositionsCount);

    // Assert that incident edges and positions are completely pruned
    expect(finalState.nodes.has("node-c")).toBe(false);
    expect(finalState.edges.has(edgeAC.id)).toBe(false);
    expect(finalState.edges.has(edgeCB.id)).toBe(false);
    expect(finalState.positions.has("node-c")).toBe(false);
    expect(finalState.nodeHistory.has("node-c")).toBe(false);
    expect(finalState.edgeHistory.has(edgeAC.id)).toBe(false);
    expect(finalState.edgeHistory.has(edgeCB.id)).toBe(false);

    // Opposite endpoint adjacency sets must no longer reference the deleted edges
    expect(finalState.adjacency.get("node-a")?.has(edgeAC.id)).toBe(false);
    expect(finalState.adjacency.get("node-b")?.has(edgeCB.id)).toBe(false);
    expect(finalState.adjacency.get("node-a")?.has(edgeAB.id)).toBe(true);
    expect(finalState.adjacency.get("node-b")?.has(edgeAB.id)).toBe(true);
  });
});
