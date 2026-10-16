import { describe, expect, it, vi, beforeEach } from "vitest";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";
import { RealtimeClient } from "@/lib/realtime/RealtimeClient";
import { LayoutWorkerBridge } from "@/lib/layout/worker-bridge";
import type { DeltaPayload, Edge, HealthStatus, Node, TopologyGraph } from "@/types/contracts.gen";

function createTestNode(id: string, rps: number = 120, health: HealthStatus = "healthy"): Node {
  return {
    id,
    kind: id.startsWith("proc:") ? "process" : "service",
    label: `Entity ${id}`,
    group_id: id.startsWith("proc:") ? "svc:worker-pool" : null,
    health,
    health_reasons: [],
    metrics: {
      rps,
      p50_ms: 8.5,
      p99_ms: 42.0,
      error_rate: 0.001,
      saturation: 0.35,
      cpu_percent: 22.4,
      rss_bytes: 134_217_728,
      open_connections: 18,
      quality: "simulated",
    },
  };
}

function createTestEdge(id: string, source: string, target: string, rps: number = 95): Edge {
  return {
    id,
    source,
    target,
    protocol: "http",
    health: "healthy",
    metrics: {
      rps,
      bytes_per_sec: rps * 1024,
      p99_ms: 19.5,
      error_rate: 0.001,
      connection_count: 12,
      retry_rate: 0.002,
      quality: "simulated",
      state_breakdown: { ESTABLISHED: 12 },
    },
  };
}

class MockSoakWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState: number = MockSoakWebSocket.CONNECTING;
  url: string;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
  }

  send(_data: string): void {
    // No-op in soak test
  }

  close(): void {
    this.readyState = MockSoakWebSocket.CLOSED;
    this.onclose?.();
  }

  openSocket(): void {
    this.readyState = MockSoakWebSocket.OPEN;
    this.onopen?.();
  }
}

describe("Phase 16: Frontend Memory Soak, Churn & Performance Budgets (§3.6, §3.7)", () => {
  beforeEach(() => {
    useTopologyStore.getState().reset();
    useUiStore.getState().clearSelection();
  });

  it("sustains 1,800 delta ticks (30 simulated minutes at 1 Hz) with 50-node ephemeral churn and zero leaked entries", () => {
    const baselineNodeCount = 60;
    const baselineNodes: Node[] = [];
    const baselineEdges: Edge[] = [];
    const initialPositions: Record<string, { x: number; y: number }> = {};

    for (let i = 0; i < baselineNodeCount; i += 1) {
      const id = `svc:core-${String(i)}`;
      baselineNodes.push(createTestNode(id, 100 + i));
      initialPositions[id] = { x: (i % 10) * 180, y: Math.floor(i / 10) * 120 };
      if (i > 0) {
        const prevId = `svc:core-${String(i - 1)}`;
        baselineEdges.push(createTestEdge(`edge:${prevId}->${id}:http`, prevId, id, 80));
      }
    }

    const initialGraph: TopologyGraph = {
      nodes: baselineNodes,
      edges: baselineEdges,
      timestamp: "2026-10-16T12:00:00Z",
    };

    const store = useTopologyStore.getState();
    store.applySnapshot(initialGraph, 1);
    store.setNodePositions(initialPositions);

    expect(useTopologyStore.getState().nodes.size).toBe(baselineNodeCount);
    expect(useTopologyStore.getState().edges.size).toBe(baselineNodeCount - 1);

    const totalTicks = 1800;
    const ephemeralBatchSize = 50;
    let activeEphemeralIds: string[] = [];

    for (let tick = 1; tick <= totalTicks; tick += 1) {
      const seq = tick + 1;
      const baseSeq = tick;

      const templateMetrics = baselineNodes[0]?.metrics;
      if (!templateMetrics) {
        throw new Error("Missing baseline node metrics");
      }

      const updatedNodes = [
        {
          id: `svc:core-${String(tick % baselineNodeCount)}`,
          metrics: {
            ...templateMetrics,
            rps: 150 + (tick % 75),
            p99_ms: 25 + (tick % 40),
          },
        },
      ];

      let addedNodes: Node[] | undefined;
      let addedEdges: Edge[] | undefined;
      let removedNodeIds: string[] | undefined;

      // Every 60 ticks, spawn 50 ephemeral process nodes and 50 incident edges
      if (tick % 60 === 10) {
        addedNodes = [];
        addedEdges = [];
        activeEphemeralIds = [];
        const ephemeralPositions: Record<string, { x: number; y: number }> = {};

        for (let k = 0; k < ephemeralBatchSize; k += 1) {
          const ephId = `proc:${String(10000 + tick * 100 + k)}:1700000000`;
          const targetCoreId = `svc:core-${String(k % baselineNodeCount)}`;
          activeEphemeralIds.push(ephId);
          addedNodes.push(createTestNode(ephId, 15));
          addedEdges.push(
            createTestEdge(`edge:${ephId}->${targetCoreId}:tcp`, ephId, targetCoreId, 15),
          );
          ephemeralPositions[ephId] = { x: k * 40, y: 900 };
        }

        useTopologyStore.getState().setNodePositions(ephemeralPositions);
        // Select one of the ephemeral nodes to verify selection cascade cleanup on removal
        useUiStore.getState().selectNode(activeEphemeralIds[0] ?? null);
      }

      // 30 ticks later, remove all 50 ephemeral nodes (cascade-removing their 50 incident edges)
      if (tick % 60 === 40 && activeEphemeralIds.length > 0) {
        removedNodeIds = [...activeEphemeralIds];
        activeEphemeralIds = [];
      }

      const delta: DeltaPayload = {
        base_seq: baseSeq,
        updated_nodes: updatedNodes,
        ...(addedNodes !== undefined ? { added_nodes: addedNodes } : {}),
        ...(addedEdges !== undefined ? { added_edges: addedEdges } : {}),
        ...(removedNodeIds !== undefined ? { removed_node_ids: removedNodeIds } : {}),
      };

      useTopologyStore.getState().applyDelta(delta, seq);
    }

    const finalState = useTopologyStore.getState();

    // 1. All normalized Maps return strictly to baseline size (zero orphaned entries)
    expect(finalState.nodes.size).toBe(baselineNodeCount);
    expect(finalState.edges.size).toBe(baselineNodeCount - 1);
    expect(finalState.adjacency.size).toBe(baselineNodeCount);
    expect(finalState.nodeHistory.size).toBe(baselineNodeCount);
    expect(finalState.edgeHistory.size).toBe(baselineNodeCount - 1);
    expect(finalState.positions.size).toBe(baselineNodeCount);
    expect(finalState.seq).toBe(totalTicks + 1);

    // 2. Stale selection to removed ephemeral node was automatically cleared
    expect(useUiStore.getState().selectedNodeId).toBeNull();
    expect(useUiStore.getState().detailSheetOpen).toBe(false);

    // 3. Every RingBuffer stays strictly capped at capacity = 120
    for (const hist of finalState.nodeHistory.values()) {
      expect(hist.rps.capacity).toBe(120);
      expect(hist.rps.length).toBeLessThanOrEqual(120);
      expect(hist.p99_ms.length).toBeLessThanOrEqual(120);
      expect(hist.error_rate.length).toBeLessThanOrEqual(120);
      expect(hist.saturation.length).toBeLessThanOrEqual(120);
    }
    // Node 0 was updated at least 30 times + initial snapshot, capped at 120
    const firstNodeHist = finalState.nodeHistory.get("svc:core-0");
    expect(firstNodeHist?.rps.capacity).toBe(120);
  });

  it("preserves reference identity of unchanged nodes, adjacency, and positions on metric-only deltas", () => {
    const n1 = createTestNode("svc:alpha", 100);
    const n2 = createTestNode("svc:beta", 200);
    const e1 = createTestEdge("edge:svc:alpha->svc:beta:http", "svc:alpha", "svc:beta");

    useTopologyStore.getState().applySnapshot({ nodes: [n1, n2], edges: [e1] }, 1);
    useTopologyStore.getState().setNodePositions({
      "svc:alpha": { x: 0, y: 0 },
      "svc:beta": { x: 200, y: 0 },
    });

    const beforeState = useTopologyStore.getState();
    const beforeBetaNode = beforeState.nodes.get("svc:beta");
    const beforeAdjacencyRef = beforeState.adjacency;
    const beforePositionsRef = beforeState.positions;

    // Metric-only delta updating only svc:alpha
    useTopologyStore.getState().applyDelta(
      {
        base_seq: 1,
        updated_nodes: [
          {
            id: "svc:alpha",
            metrics: { ...n1.metrics, rps: 145 },
          },
        ],
      },
      2,
    );

    const afterState = useTopologyStore.getState();
    expect(afterState.nodes.get("svc:beta")).toBe(beforeBetaNode);
    expect(afterState.adjacency).toBe(beforeAdjacencyRef);
    expect(afterState.positions).toBe(beforePositionsRef);
  });

  it("maintains sub-frame delta application latency (< 4ms average per delta across 100 nodes)", () => {
    const nodeCount = 100;
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    for (let i = 0; i < nodeCount; i += 1) {
      const id = `svc:perf-${String(i)}`;
      nodes.push(createTestNode(id, 250));
      if (i > 0) {
        edges.push(
          createTestEdge(
            `edge:svc:perf-${String(i - 1)}->${id}:grpc`,
            `svc:perf-${String(i - 1)}`,
            id,
          ),
        );
      }
    }

    useTopologyStore.getState().applySnapshot({ nodes, edges }, 1);

    const iterations = 100;
    const startMs = performance.now();

    for (let step = 1; step <= iterations; step += 1) {
      const updatedNodes = [];
      for (let k = 0; k < 20; k += 1) {
        const targetIdx = (step + k) % nodeCount;
        const baseNode = nodes[targetIdx];
        if (!baseNode) {
          throw new Error(`Missing test node at index ${String(targetIdx)}`);
        }
        updatedNodes.push({
          id: `svc:perf-${String(targetIdx)}`,
          metrics: {
            ...baseNode.metrics,
            rps: 250 + step,
            p99_ms: 15 + (k % 10),
          },
        });
      }

      useTopologyStore.getState().applyDelta(
        {
          base_seq: step,
          updated_nodes: updatedNodes,
        },
        step + 1,
      );
    }

    const elapsedMs = performance.now() - startMs;
    const avgMsPerDelta = elapsedMs / iterations;

    expect(avgMsPerDelta).toBeLessThan(4.0);
  });

  it("releases all WebSocket handlers, visibility listeners, and Worker references across 50 lifecycle cycles", () => {
    const sockets: MockSoakWebSocket[] = [];
    const addEventSpy = vi.spyOn(document, "addEventListener");
    const removeEventSpy = vi.spyOn(document, "removeEventListener");

    const client = new RealtimeClient({
      url: "ws://localhost:8000/ws/v1/topology",
      webSocketFactory: (url) => {
        const ws = new MockSoakWebSocket(url);
        sockets.push(ws);
        return ws as unknown as WebSocket;
      },
      rafScheduler: (cb) => {
        cb();
        return 1;
      },
      rafCanceller: () => undefined,
    });

    for (let cycle = 0; cycle < 50; cycle += 1) {
      client.connect();
      const latestSocket = sockets[sockets.length - 1];
      latestSocket?.openSocket();
      client.disconnect();
    }

    // Every created WebSocket must have all 4 event handlers nulled out after disconnect
    expect(sockets).toHaveLength(50);
    for (const sock of sockets) {
      expect(sock.onopen).toBeNull();
      expect(sock.onmessage).toBeNull();
      expect(sock.onclose).toBeNull();
      expect(sock.onerror).toBeNull();
    }

    const visibilityAdds = addEventSpy.mock.calls.filter(
      (call) => call[0] === "visibilitychange",
    ).length;
    const visibilityRemoves = removeEventSpy.mock.calls.filter(
      (call) => call[0] === "visibilitychange",
    ).length;
    expect(visibilityAdds).toBe(50);
    expect(visibilityRemoves).toBe(50);

    // Verify LayoutWorkerBridge.terminate() clears state cleanly
    const bridge = new LayoutWorkerBridge();
    bridge.terminate();
    expect(() => {
      bridge.terminate();
    }).not.toThrow();

    addEventSpy.mockRestore();
    removeEventSpy.mockRestore();
  });
});
