import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import { ReactFlowProvider } from "@xyflow/react";
import { ServiceNode } from "@/components/topology/ServiceNode";
import { DatastoreNode } from "@/components/topology/DatastoreNode";
import { DatabaseNode } from "@/components/topology/DatabaseNode";
import { QueueNode } from "@/components/topology/QueueNode";
import { ExternalNode } from "@/components/topology/ExternalNode";
import { GroupNode } from "@/components/topology/GroupNode";
import { CanvasControls } from "@/components/topology/CanvasControls";
import { CanvasToolbar } from "@/components/topology/CanvasToolbar";
import { Legend } from "@/components/topology/Legend";
import { TopologyTableView } from "@/components/topology/TopologyTableView";
import { TopologyCanvas } from "@/components/topology/TopologyCanvas";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";
import type { Node as AppFlowNode, Edge as AppFlowEdge, NodeMetrics } from "@/types/contracts.gen";
import type { FlowNodeData } from "@/components/topology/types";

function createMockMetrics(overrides?: Partial<NodeMetrics>): NodeMetrics {
  return {
    rps: 125,
    p50_ms: 4.2,
    p99_ms: 18.5,
    error_rate: 0.005,
    saturation: 0.42,
    cpu_percent: 32.5,
    open_connections: 48,
    rss_bytes: 256 * 1024 * 1024,
    quality: "measured",
    ...overrides,
  };
}

function createMockNode(
  id: string,
  label: string,
  kind: AppFlowNode["kind"],
  health: AppFlowNode["health"] = "healthy",
): FlowNodeData {
  return {
    id,
    label,
    kind,
    health,
    metrics: createMockMetrics(),
  };
}

const mockNodes: AppFlowNode[] = [
  {
    id: "svc:frontend",
    label: "Frontend Web",
    kind: "service",
    health: "healthy",
    metrics: createMockMetrics({ rps: 450 }),
  },
  {
    id: "svc:api",
    label: "API Gateway",
    kind: "service",
    health: "degraded",
    metrics: createMockMetrics({ rps: 380, error_rate: 0.04 }),
  },
  {
    id: "db:main",
    label: "PostgreSQL Primary",
    kind: "datastore",
    health: "critical",
    metrics: createMockMetrics({ rps: 180, saturation: 0.95 }),
  },
];

const mockEdges: AppFlowEdge[] = [
  {
    id: "e1",
    source: "svc:frontend",
    target: "svc:api",
    protocol: "http",
    health: "healthy",
    metrics: {
      rps: 450,
      error_rate: 0,
      bytes_per_sec: 102400,
      connection_count: 10,
      p99_ms: 8,
      quality: "measured",
    },
  },
  {
    id: "e2",
    source: "svc:api",
    target: "db:main",
    protocol: "tcp",
    health: "degraded",
    metrics: {
      rps: 180,
      error_rate: 0.04,
      bytes_per_sec: 51200,
      connection_count: 5,
      p99_ms: 85,
      quality: "measured",
    },
  },
];

describe("Topology Custom Nodes", () => {
  beforeEach(() => {
    useUiStore.setState({ selectedNodeId: null });
  });

  it("renders ServiceNode with metrics and zero a11y violations", async () => {
    const nodeData = createMockNode("svc:order", "Order Service", "service", "healthy");
    const { container } = render(
      <ReactFlowProvider>
        <ServiceNode
          id="svc:order"
          data={nodeData}
          selected={false}
          type="service"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          selectable={true}
          deletable={false}
          draggable={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("Order Service")).toBeInTheDocument();
    expect(screen.getByText("125")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders DatastoreNode with degraded health status", async () => {
    const nodeData = createMockNode("ds:redis", "Redis Cache", "datastore", "degraded");
    const { container } = render(
      <ReactFlowProvider>
        <DatastoreNode
          id="ds:redis"
          data={nodeData}
          selected={true}
          type="datastore"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          selectable={true}
          deletable={false}
          draggable={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("Redis Cache")).toBeInTheDocument();
    expect(screen.getByText("Degraded")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders DatabaseNode and QueueNode cleanly", () => {
    const dbData = createMockNode("db:mongo", "MongoDB Cluster", "datastore", "healthy");
    const queueData = createMockNode("q:kafka", "Kafka Ingestion", "queue", "critical");

    render(
      <ReactFlowProvider>
        <DatabaseNode
          id="db:mongo"
          data={dbData}
          selected={false}
          type="datastore"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          selectable={true}
          deletable={false}
          draggable={false}
        />
        <QueueNode
          id="q:kafka"
          data={queueData}
          selected={false}
          type="queue"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          selectable={true}
          deletable={false}
          draggable={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("MongoDB Cluster")).toBeInTheDocument();
    expect(screen.getByText("Kafka Ingestion")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("renders ExternalNode with domain label", () => {
    const extData = createMockNode("ext:stripe", "Stripe API", "external", "healthy");
    render(
      <ReactFlowProvider>
        <ExternalNode
          id="ext:stripe"
          data={extData}
          selected={false}
          type="external"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          selectable={true}
          deletable={false}
          draggable={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("Stripe API")).toBeInTheDocument();
  });

  it("renders GroupNode with member count and handles expand/collapse toggle", async () => {
    const groupData: FlowNodeData = {
      ...createMockNode("grp:payments", "Payments Group", "service"),
      memberCount: 4,
      isCollapsed: true,
    };

    const { container } = render(
      <ReactFlowProvider>
        <GroupNode
          id="grp:payments"
          data={groupData}
          selected={false}
          type="group"
          zIndex={1}
          isConnectable={true}
          positionAbsoluteX={0}
          positionAbsoluteY={0}
          dragging={false}
          selectable={true}
          deletable={false}
          draggable={false}
        />
      </ReactFlowProvider>,
    );

    expect(screen.getByText("Payments Group")).toBeInTheDocument();
    expect(screen.getByText("4 nodes")).toBeInTheDocument();

    const toggleBtn = screen.getByRole("button", { name: "Expand service group" });
    fireEvent.click(toggleBtn);

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("Canvas Floating Controls & Legend", () => {
  it("renders CanvasControls toolbar and handles zoom / fit interactions", async () => {
    const onRelayout = vi.fn();
    const { container } = render(
      <ReactFlowProvider>
        <CanvasControls onRelayout={onRelayout} />
      </ReactFlowProvider>,
    );

    expect(screen.getByRole("toolbar", { name: "Canvas Navigation Controls" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom In" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Zoom Out" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fit to View" })).toBeInTheDocument();

    const relayoutBtn = screen.getByRole("button", { name: "Recompute Hierarchical Layout" });
    fireEvent.click(relayoutBtn);
    expect(onRelayout).toHaveBeenCalledTimes(1);

    const lockBtn = screen.getByRole("button", { name: "Lock Canvas Layout" });
    fireEvent.click(lockBtn);
    expect(screen.getByRole("button", { name: "Unlock Canvas Layout" })).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders Legend and toggles expand/collapse", async () => {
    const { container } = render(<Legend />);
    expect(screen.getByText("Legend")).toBeInTheDocument();
    expect(screen.getByText("Service")).toBeInTheDocument();
    expect(screen.getByText("Healthy")).toBeInTheDocument();

    const collapseBtn = screen.getByRole("button", { name: "Collapse legend" });
    fireEvent.click(collapseBtn);
    expect(screen.queryByText("Service")).not.toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("renders CanvasToolbar with search and filter controls", async () => {
    const { container } = render(<CanvasToolbar />);
    expect(screen.getByPlaceholderText(/Filter nodes…/i)).toBeInTheDocument();
    expect(screen.getByTitle("Toggle Services")).toBeInTheDocument();
    expect(screen.getByTitle("Toggle Datastores")).toBeInTheDocument();
    expect(screen.getByTitle("Toggle Queues")).toBeInTheDocument();
    expect(screen.getByTitle("Toggle External Services")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

describe("TopologyTableView (Dual Presentation)", () => {
  beforeEach(() => {
    useTopologyStore.setState({
      nodes: new Map(mockNodes.map((n) => [n.id, n])),
      edges: new Map(mockEdges.map((e) => [e.id, e])),
    });
    useUiStore.setState({ selectedNodeId: null });
  });

  it("renders accessible semantic table presentation with node rows", async () => {
    const { container } = render(<TopologyTableView />);
    expect(
      screen.getByRole("region", { name: "Semantic Topology Table Presentation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Frontend Web")).toBeInTheDocument();
    expect(screen.getByText("API Gateway")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL Primary")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("selects node on table row click and Enter key press", () => {
    render(<TopologyTableView />);
    const row = screen.getByRole("button", { name: /Frontend Web/i });
    fireEvent.click(row);
    expect(useUiStore.getState().selectedNodeId).toBe("svc:frontend");

    const secondRow = screen.getByRole("button", { name: /API Gateway/i });
    fireEvent.keyDown(secondRow, { key: "Enter" });
    expect(useUiStore.getState().selectedNodeId).toBe("svc:api");
  });
});

describe("TopologyCanvas Component", () => {
  beforeEach(() => {
    useTopologyStore.setState({
      nodes: new Map(mockNodes.map((n) => [n.id, n])),
      edges: new Map(mockEdges.map((e) => [e.id, e])),
      positions: new Map([
        ["svc:frontend", { x: 40, y: 40 }],
        ["svc:api", { x: 320, y: 40 }],
        ["db:main", { x: 600, y: 40 }],
      ]),
    });
    useUiStore.setState({
      selectedNodeId: null,
      viewMode: "canvas",
    });
  });

  it("renders interactive topology canvas with zero a11y violations", async () => {
    const { container } = render(<TopologyCanvas />);
    expect(screen.getByRole("region", { name: "Interactive Topology Map" })).toBeInTheDocument();
    expect(screen.getByText("Frontend Web")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("switches to table presentation when viewMode is table", () => {
    useUiStore.setState({ viewMode: "table" });
    render(<TopologyCanvas />);
    expect(
      screen.getByRole("region", { name: "Semantic Topology Table Presentation" }),
    ).toBeInTheDocument();
  });
});
