import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { axe } from "vitest-axe";

import { Sparkline } from "@/components/details/Sparkline";
import { StateBar } from "@/components/details/StateBar";
import { SocketTable } from "@/components/details/SocketTable";
import { NodeDetailSheet } from "@/components/details/NodeDetailSheet";

import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";
import * as apiClient from "@/lib/api/client";
import type {
  Edge,
  EdgeDetail,
  HealthStatus,
  Node,
  NodeDetail,
  SocketInfo,
} from "@/types/contracts.gen";

// Mock next/navigation
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock API client fetchers
vi.mock("@/lib/api/client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/client")>("@/lib/api/client");
  return {
    ...actual,
    fetchNodeDetail: vi.fn(),
    fetchEdgeDetail: vi.fn(),
  };
});

function createMockNode(id: string, label: string, health: HealthStatus = "healthy"): Node {
  return {
    id,
    label,
    kind: "service",
    health,
    health_reasons: health === "critical" ? ["p99_ms 450.0 > 250.0 threshold"] : [],
    metrics: {
      rps: 350,
      p50_ms: 5,
      p99_ms: 45,
      error_rate: 0.01,
      saturation: 0.42,
      cpu_percent: 28.5,
      rss_bytes: 524288000,
      open_connections: 24,
      quality: "measured",
    },
    process: {
      pid: 1420,
      ppid: 1,
      name: "node-order-service",
      username: "appflow",
      num_threads: 8,
      cmdline_sanitized: "/usr/bin/node dist/server.js --port 8080",
      create_time: 1760000000,
    },
  };
}

function createMockEdge(id: string, source: string, target: string): Edge {
  return {
    id,
    source,
    target,
    protocol: "http",
    health: "healthy",
    metrics: {
      rps: 210,
      bytes_per_sec: 1048576,
      p99_ms: 12,
      error_rate: 0.005,
      connection_count: 14,
      quality: "measured",
      state_breakdown: {
        ESTABLISHED: 10,
        TIME_WAIT: 4,
      },
    },
  };
}

describe("Sparkline Component", () => {
  it("renders 120-point series with statistics and zero a11y violations", async () => {
    const series120 = Array.from({ length: 120 }, (_, i) => 100 + Math.sin(i / 10) * 30);
    const { container } = render(
      <Sparkline
        data={series120}
        label="Requests / sec"
        unit="rps"
        threshold={150}
        status="healthy"
      />,
    );

    expect(screen.getByText("Requests / sec")).toBeInTheDocument();
    expect(screen.getByRole("img")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("120 samples"),
    );

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("handles empty and single-point series gracefully without NaN or crashing", () => {
    const { rerender } = render(<Sparkline data={[]} label="Empty Series" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      "Empty Series sparkline, no data points available",
    );

    rerender(<Sparkline data={[42]} label="Single Point" />);
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("1 samples"),
    );
  });
});

describe("StateBar Component", () => {
  it("renders TCP connection state breakdown with tabular legend", async () => {
    const states = {
      ESTABLISHED: 80,
      TIME_WAIT: 15,
      CLOSE_WAIT: 5,
    };

    const { container } = render(<StateBar states={states} totalConnections={100} />);

    expect(screen.getByText("TCP Connection States")).toBeInTheDocument();
    expect(screen.getByText("100 total")).toBeInTheDocument();
    expect(screen.getByText("ESTABLISHED")).toBeInTheDocument();
    expect(screen.getByText("CLOSE_WAIT alert:")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders clean fallback state when total connections equal 0", async () => {
    const { container } = render(<StateBar states={{}} totalConnections={0} />);
    expect(screen.getByText("No active TCP connections tracked.")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("SocketTable Component", () => {
  it("renders virtualized table with 500+ sockets maintaining bounded DOM row count", async () => {
    const syntheticSockets: SocketInfo[] = Array.from({ length: 600 }, (_, i) => ({
      protocol: i % 2 === 0 ? "tcp" : "http",
      local_addr: "10.0.0.1",
      local_port: 8000 + i,
      remote_addr: "10.0.0.2",
      remote_port: 30000 + i,
      state: i === 0 ? "CLOSE_WAIT" : i % 3 === 0 ? "TIME_WAIT" : "ESTABLISHED",
      pid: 1000 + (i % 5),
    }));

    const { container } = render(<SocketTable sockets={syntheticSockets} maxHeight={300} />);

    // Table caption and rowcount preserved for accessibility (§3.5)
    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-rowcount", "600");

    // The number of rendered tr rows should be bounded (~20-40 rows including headers & spacers, NOT 600)
    const allRows = container.querySelectorAll("tbody tr");
    expect(allRows.length).toBeLessThan(70);

    // Verify column sorting toggles aria-sort
    const protoTh = screen.getByRole("columnheader", { name: /proto/i });
    expect(protoTh).toHaveAttribute("aria-sort", "none");
    fireEvent.click(screen.getByRole("button", { name: /proto/i }));
    expect(protoTh).toHaveAttribute("aria-sort", "ascending");

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("NodeDetailSheet Component", () => {
  beforeEach(() => {
    useUiStore.setState({
      selectedNodeId: null,
      selectedEdgeId: null,
      detailSheetOpen: false,
    });
    useTopologyStore.setState({
      nodes: new Map(),
      edges: new Map(),
      nodeHistory: new Map(),
      edgeHistory: new Map(),
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("opens on node selection, calls fetchNodeDetail with AbortSignal, and renders 4 tabs", async () => {
    const node = createMockNode("svc:orders", "Orders API", "healthy");
    useTopologyStore.getState().applySnapshot(
      {
        nodes: [node],
        edges: [],
      },
      1,
    );

    const mockDetail: NodeDetail = {
      node,
      sockets: [
        {
          protocol: "tcp",
          local_addr: "127.0.0.1",
          local_port: 8080,
          remote_addr: "127.0.0.1",
          remote_port: 5432,
          state: "ESTABLISHED",
          pid: 1420,
        },
      ],
      neighbours: {
        up: [],
        down: [
          {
            node_id: "ds:postgres",
            edge_id: "e:orders-pg",
            label: "PostgreSQL Database",
            kind: "datastore",
            health: "healthy",
            protocol: "tcp",
            rps: 120,
          },
        ],
      },
      history: {
        rps: [300, 320, 350],
        p99_ms: [40, 42, 45],
        error_rate: [0.01, 0.01, 0.01],
        saturation: [0.4, 0.41, 0.42],
      },
    };

    vi.mocked(apiClient.fetchNodeDetail).mockResolvedValue(mockDetail);

    const { container } = render(<NodeDetailSheet />);

    // Select the node in store
    useUiStore.getState().selectNode("svc:orders");

    await waitFor(() => {
      const calls = vi.mocked(apiClient.fetchNodeDetail).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]?.[0]).toBe("svc:orders");
      expect(calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });

    // Overview tab content
    expect(await screen.findByText("Orders API")).toBeInTheDocument();
    expect(screen.getByText("AI Optimization Advisor")).toBeInTheDocument();

    // Trigger Ask Advisor
    fireEvent.click(screen.getByRole("button", { name: /ask advisor/i }));
    expect(mockPush).toHaveBeenCalledWith("/insights?node=svc%3Aorders");

    // Switch to Process tab
    const processTab = screen.getByRole("tab", { name: /process/i });
    fireEvent.mouseDown(processTab, { button: 0 });
    fireEvent.click(processTab);
    expect(await screen.findByText("node-order-service")).toBeInTheDocument();
    expect(screen.getByText("PID / PPID:")).toBeInTheDocument();

    // Switch to Sockets tab
    const socketsTab = screen.getByRole("tab", { name: /sockets/i });
    fireEvent.mouseDown(socketsTab, { button: 0 });
    fireEvent.click(socketsTab);
    expect(await screen.findByText("TCP Connection States")).toBeInTheDocument();

    // Switch to Neighbours tab and traverse
    const neighboursTab = screen.getByRole("tab", { name: /neighbours/i });
    fireEvent.mouseDown(neighboursTab, { button: 0 });
    fireEvent.click(neighboursTab);
    const neighbourBtn = await screen.findByRole("button", { name: /postgresql database/i });
    expect(neighbourBtn).toBeInTheDocument();

    fireEvent.click(neighbourBtn);
    expect(useUiStore.getState().selectedNodeId).toBe("ds:postgres");

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("opens on edge selection and renders edge details with StateBar", async () => {
    const edge = createMockEdge("e:web-api", "svc:web", "svc:api");
    useTopologyStore.getState().applySnapshot(
      {
        nodes: [],
        edges: [edge],
      },
      1,
    );

    const mockDetail: EdgeDetail = {
      edge,
      history: {
        rps: [200, 205, 210],
        p99_ms: [10, 11, 12],
        error_rate: [0, 0, 0.005],
      },
    };

    vi.mocked(apiClient.fetchEdgeDetail).mockResolvedValue(mockDetail);

    render(<NodeDetailSheet />);

    useUiStore.getState().selectEdge("e:web-api");

    await waitFor(() => {
      const calls = vi.mocked(apiClient.fetchEdgeDetail).mock.calls;
      expect(calls.length).toBeGreaterThan(0);
      expect(calls[0]?.[0]).toBe("e:web-api");
      expect(calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });

    expect(await screen.findByText("Communication Edge")).toBeInTheDocument();
    expect(screen.getByText("svc:web")).toBeInTheDocument();
    expect(screen.getByText("svc:api")).toBeInTheDocument();
  });

  it("cleans up event listeners without leaking after multiple open/close cycles", () => {
    const addListenerSpy = vi.spyOn(window, "addEventListener");
    const removeListenerSpy = vi.spyOn(window, "removeEventListener");

    const { rerender } = render(<NodeDetailSheet />);

    for (let i = 0; i < 50; i++) {
      useUiStore.getState().selectNode("svc:order");
      rerender(<NodeDetailSheet />);
      useUiStore.getState().clearSelection();
      rerender(<NodeDetailSheet />);
    }

    // Verify pointermove / pointerup are not retained on window
    const activePointerMoves = addListenerSpy.mock.calls.filter(
      (c) => (c[0] as unknown as string) === "pointermove",
    );
    const removedPointerMoves = removeListenerSpy.mock.calls.filter(
      (c) => (c[0] as unknown as string) === "pointermove",
    );
    expect(activePointerMoves.length).toBe(removedPointerMoves.length);
  });
});
