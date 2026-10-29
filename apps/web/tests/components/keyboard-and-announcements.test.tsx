import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import * as React from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { useUiStore } from "@/store/ui-store";
import { useTopologyStore } from "@/store/topology-store";
import { BaseNodeCard } from "@/components/topology/BaseNodeCard";
import { TopologyCanvas } from "@/components/topology/TopologyCanvas";
import { Server } from "lucide-react";
import type { Node, Edge, HealthEventPayload } from "@/types/contracts.gen";

describe("Live Announcements Throttling & Coalescing (§3.5)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useUiStore.getState().clearAnnouncements();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("dispatches first health event immediately if elapsed time >= 5000ms", () => {
    const payload1: HealthEventPayload = {
      entity_id: "svc:auth",
      from: "healthy",
      to: "degraded",
      reasons: ["high latency p99 > 250ms"],
    };

    useUiStore.getState().queueHealthEvent(payload1);

    expect(useUiStore.getState().latestAnnouncement).toBe(
      "svc:auth became degraded due to high latency p99 > 250ms.",
    );
    expect(useUiStore.getState().announcements).toHaveLength(1);
  });

  it("coalesces rapid burst of events into a single announcement after 5000ms window", () => {
    const payload1: HealthEventPayload = {
      entity_id: "svc:auth",
      from: "healthy",
      to: "degraded",
      reasons: ["p99 latency"],
    };
    const payload2: HealthEventPayload = {
      entity_id: "db:users",
      from: "healthy",
      to: "critical",
      reasons: ["connection pool exhausted"],
    };
    const payload3: HealthEventPayload = {
      entity_id: "q:events",
      from: "degraded",
      to: "healthy",
      reasons: [],
    };

    // First event: immediate
    useUiStore.getState().queueHealthEvent(payload1);
    expect(useUiStore.getState().latestAnnouncement).toBe(
      "svc:auth became degraded due to p99 latency.",
    );

    // Subsequent events within 5000ms: buffered
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    useUiStore.getState().queueHealthEvent(payload2);

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    useUiStore.getState().queueHealthEvent(payload3);

    // Latest announcement should not have changed yet
    expect(useUiStore.getState().latestAnnouncement).toBe(
      "svc:auth became degraded due to p99 latency.",
    );

    // Advance to 5000ms mark
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Both buffered events should coalesce with "Also:"
    expect(useUiStore.getState().latestAnnouncement).toBe(
      "db:users became critical due to connection pool exhausted. Also: q:events became healthy.",
    );
    expect(useUiStore.getState().announcements).toHaveLength(2);
  });
});

describe("BaseNodeCard ARIA Contract (§3.5)", () => {
  beforeEach(() => {
    useUiStore.getState().clearSelection();
    useTopologyStore.setState({
      nodes: new Map(),
      edges: new Map(),
      nodeHistory: new Map(),
    });
  });

  it("formats aria-label according to exact accessibility contract including upstream/downstream counts", () => {
    const mockEdges: [string, Edge][] = [
      [
        "e1",
        {
          id: "e1",
          source: "svc:upstream-1",
          target: "svc:target-node",
          protocol: "http",
          health: "healthy",
          metrics: {
            rps: 100,
            error_rate: 0,
            bytes_per_sec: 1024,
            connection_count: 5,
            p99_ms: 10,
            quality: "measured",
          },
        },
      ],
      [
        "e2",
        {
          id: "e2",
          source: "svc:upstream-2",
          target: "svc:target-node",
          protocol: "http",
          health: "healthy",
          metrics: {
            rps: 150,
            error_rate: 0,
            bytes_per_sec: 2048,
            connection_count: 5,
            p99_ms: 12,
            quality: "measured",
          },
        },
      ],
      [
        "e3",
        {
          id: "e3",
          source: "svc:target-node",
          target: "db:downstream-1",
          protocol: "tcp",
          health: "healthy",
          metrics: {
            rps: 250,
            error_rate: 0,
            bytes_per_sec: 4096,
            connection_count: 2,
            p99_ms: 5,
            quality: "measured",
          },
        },
      ],
    ];

    useTopologyStore.setState({
      edges: new Map(mockEdges),
    });

    render(
      <ReactFlowProvider>
        <BaseNodeCard
          id="svc:target-node"
          label="Order Processing Service"
          kind="service"
          health="degraded"
          metrics={{
            rps: 250,
            p50_ms: 15,
            p99_ms: 85.4,
            error_rate: 0.02,
            saturation: 0.65,
            cpu_percent: 45,
            open_connections: 12,
            rss_bytes: 128 * 1024 * 1024,
            quality: "measured",
          }}
          icon={Server}
        />
      </ReactFlowProvider>,
    );

    const card = screen.getByRole("button", {
      name: /^service Order Processing Service Degraded RPS 250 p99 85(\.\d)? ms Err 2\.0%$/,
    });

    expect(card).toHaveAccessibleDescription("health degraded, 2 upstream, 1 downstream");
  });
});

describe("Directional Keyboard Traversal with Connected Neighbour Priority (§3.5)", () => {
  const nodeA: Node = {
    id: "svc:a",
    label: "Service A",
    kind: "service",
    health: "healthy",
    metrics: {
      rps: 100,
      p50_ms: 5,
      p99_ms: 10,
      error_rate: 0,
      saturation: 0.1,
      cpu_percent: 10,
      open_connections: 2,
      rss_bytes: 1024,
      quality: "measured",
    },
  };

  const nodeB: Node = {
    id: "svc:b",
    label: "Service B (Connected Right)",
    kind: "service",
    health: "healthy",
    metrics: {
      rps: 100,
      p50_ms: 5,
      p99_ms: 10,
      error_rate: 0,
      saturation: 0.1,
      cpu_percent: 10,
      open_connections: 2,
      rss_bytes: 1024,
      quality: "measured",
    },
  };

  const nodeC: Node = {
    id: "svc:c",
    label: "Service C (Unconnected Closer Right)",
    kind: "service",
    health: "healthy",
    metrics: {
      rps: 100,
      p50_ms: 5,
      p99_ms: 10,
      error_rate: 0,
      saturation: 0.1,
      cpu_percent: 10,
      open_connections: 2,
      rss_bytes: 1024,
      quality: "measured",
    },
  };

  const edgeAB: Edge = {
    id: "e-ab",
    source: "svc:a",
    target: "svc:b",
    protocol: "http",
    health: "healthy",
    metrics: {
      rps: 100,
      error_rate: 0,
      bytes_per_sec: 1024,
      connection_count: 1,
      p99_ms: 5,
      quality: "measured",
    },
  };

  beforeEach(() => {
    useTopologyStore.setState({
      nodes: new Map([
        [nodeA.id, nodeA],
        [nodeB.id, nodeB],
        [nodeC.id, nodeC],
      ]),
      edges: new Map([[edgeAB.id, edgeAB]]),
      positions: new Map([
        ["svc:a", { x: 0, y: 0 }],
        ["svc:c", { x: 50, y: 0 }], // Closer right, but unconnected
        ["svc:b", { x: 100, y: 0 }], // Farther right, but connected via edgeAB
      ]),
    });
    useUiStore.setState({
      selectedNodeId: "svc:a",
      viewMode: "canvas",
    });
  });

  it("prioritizes connected neighbour over closer spatial candidate on ArrowRight", () => {
    render(<TopologyCanvas />);

    // Press ArrowRight
    fireEvent.keyDown(window, { key: "ArrowRight" });

    // Node B (connected) should be selected despite Node C being spatially closer
    expect(useUiStore.getState().selectedNodeId).toBe("svc:b");
  });
});
