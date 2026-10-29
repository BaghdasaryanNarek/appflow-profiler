import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { Position, ReactFlow, ReactFlowProvider, type Edge, type Node } from "@xyflow/react";
import { Server } from "lucide-react";
import { BaseNodeCard } from "@/components/topology/BaseNodeCard";
import { CanvasToolbar } from "@/components/topology/CanvasToolbar";
import { GroupNode } from "@/components/topology/GroupNode";
import { TrafficEdge } from "@/components/topology/TrafficEdge";
import { EvidenceChip } from "@/components/insights";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";
import type { FlowEdgeData, FlowNodeData } from "@/components/topology/types";
import type { NodeMetrics } from "@/types/contracts.gen";
import { formatLatencyMs, formatNumber } from "@/lib/format";
import {
  expectNameContainsVisibleText,
  getAccessibleName,
  getVisibleText,
} from "../helpers/label-in-name";

// WCAG 2.5.3 Label in Name: an element's accessible name must contain its visible text,
// starting with it when the name adds context (axe-core `label-content-name-mismatch`).

const metrics: NodeMetrics = {
  rps: 1234,
  p50_ms: 4.2,
  p99_ms: 45,
  error_rate: 0,
  saturation: 0.3,
  cpu_percent: 12,
  open_connections: 8,
  rss_bytes: 64 * 1024 * 1024,
  quality: "measured",
};

function groupProps(isCollapsed: boolean) {
  const data: FlowNodeData = {
    id: "grp:payments",
    label: "Payments Group",
    kind: "service",
    health: "healthy",
    metrics,
    memberCount: 4,
    isCollapsed,
  };
  return {
    id: "grp:payments",
    data,
    selected: false,
    type: "group" as const,
    zIndex: 1,
    isConnectable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
    dragging: false,
    selectable: true,
    deletable: false,
    draggable: false,
  };
}

describe("Label in Name (WCAG 2.5.3)", () => {
  beforeEach(() => {
    useUiStore.setState({ lodCollapsed: "auto", selectedNodeId: null });
    useTopologyStore.setState({ nodes: new Map() });
  });

  describe("CanvasToolbar LOD toggle", () => {
    it("starts its name with the visible LOD state in both modes", () => {
      render(<CanvasToolbar />);

      const detail = screen.getByRole("button", { name: /^LOD: Detail\b/i });
      expectNameContainsVisibleText(detail);
      expect(getAccessibleName(detail)).toMatch(/toggle level of detail grouping/i);

      fireEvent.click(detail);

      const grouped = screen.getByRole("button", { name: /^LOD: Grouped\b/i });
      expectNameContainsVisibleText(grouped);
      expect(getAccessibleName(grouped)).not.toMatch(/LOD: Detail/i);
    });
  });

  describe("GroupNode expand/collapse button", () => {
    it.each([
      [true, /^4 nodes, expand service group$/i],
      [false, /^4 nodes, collapse service group$/i],
    ])("starts its name with the member count (collapsed=%s)", (isCollapsed, expected) => {
      render(
        <ReactFlowProvider>
          <GroupNode {...groupProps(isCollapsed)} />
        </ReactFlowProvider>,
      );

      const toggle = screen.getByRole("button", { name: expected });
      expectNameContainsVisibleText(toggle);
      expectNameContainsVisibleText(
        screen.getByRole("button", { name: /Select Service Group Payments Group/i }),
      );
    });
  });

  describe("TrafficEdge RPS pill", () => {
    it("starts the pill's name with the rendered rps text and keeps the edge description", () => {
      const nodeBase = {
        type: "default",
        width: 100,
        height: 40,
        handles: [
          { type: "target" as const, position: Position.Left, x: 0, y: 20 },
          { type: "source" as const, position: Position.Right, x: 100, y: 20 },
        ],
      };
      const nodes: Node[] = [
        { ...nodeBase, id: "svc:a", position: { x: 0, y: 0 }, data: { label: "a" } },
        { ...nodeBase, id: "svc:b", position: { x: 300, y: 0 }, data: { label: "b" } },
      ];
      const edgeData: FlowEdgeData = {
        id: "edge:svc:a->svc:b:http",
        source: "svc:a",
        target: "svc:b",
        protocol: "http",
        health: "healthy",
        metrics: {
          rps: 1234,
          error_rate: 0,
          bytes_per_sec: 2048,
          connection_count: 3,
          p99_ms: 8,
          quality: "measured",
        },
      };
      const edges: Edge<FlowEdgeData, "traffic">[] = [
        { id: edgeData.id, source: "svc:a", target: "svc:b", type: "traffic", data: edgeData },
      ];

      const { container } = render(
        <div style={{ width: 800, height: 400 }}>
          <ReactFlow nodes={nodes} edges={edges} edgeTypes={{ traffic: TrafficEdge }} />
        </div>,
      );

      const pill = container.querySelector<HTMLButtonElement>("button[data-edge-id]");
      expect(pill).not.toBeNull();
      if (!pill) return;
      expectNameContainsVisibleText(pill);
      expect(getAccessibleName(pill).startsWith(getVisibleText(pill))).toBe(true);
      expect(getAccessibleName(pill)).toMatch(/Edge edge:svc:a->svc:b:http, protocol http/);

      const hitTarget = container.querySelector<SVGPathElement>("path[data-edge-id]");
      expect(hitTarget?.getAttribute("aria-label")).toMatch(/^Edge edge:svc:a->svc:b:http/);
    });
  });

  describe("BaseNodeCard", () => {
    function renderCard() {
      useTopologyStore.setState({
        nodes: new Map(),
        adjacency: new Map(),
        edges: new Map(
          (
            [
              ["svc:gateway", "svc:orders-svc"],
              ["svc:orders-svc", "db:orders"],
              ["svc:orders-svc", "q:events"],
            ] as const
          ).map(([source, target]) => {
            const id = `edge:${source}->${target}:http`;
            return [
              id,
              {
                id,
                source,
                target,
                protocol: "http" as const,
                health: "healthy" as const,
                metrics: {
                  rps: 10,
                  error_rate: 0,
                  bytes_per_sec: 1,
                  connection_count: 1,
                  p99_ms: 1,
                  quality: "measured" as const,
                },
              },
            ];
          }),
        ),
      });
      render(
        <ReactFlowProvider>
          <BaseNodeCard
            id="svc:orders-svc"
            label="orders-svc"
            sublabel="pid 10400"
            kind="Service"
            health="degraded"
            metrics={metrics}
            icon={Server}
          />
        </ReactFlowProvider>,
      );
      return screen.getByTestId("node-svc:orders-svc");
    }

    it("takes its name from the visible content, prefixed by the kind", () => {
      const card = renderCard();
      expectNameContainsVisibleText(card);

      const name = getAccessibleName(card);
      expect(name).toMatch(/^Service orders-svc pid 10400 Degraded RPS /);
      const words = [
        "orders-svc",
        "pid 10400",
        "Degraded",
        `RPS ${formatNumber(metrics.rps)}`,
        `p99 ${formatLatencyMs(metrics.p99_ms)}`,
        "Sat 30%",
      ];
      const positions = words.map((word) => name.indexOf(word));
      expect(positions.every((p) => p >= 0)).toBe(true);
      expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    });

    it("exposes health and adjacency as the accessible description", () => {
      const card = renderCard();
      expect(card).toHaveAccessibleDescription("health degraded, 1 upstream, 2 downstream");
    });

    it("does not hide visible health or metric text from assistive technology", () => {
      renderCard();
      for (const text of ["Degraded", "RPS", "p99", "Sat"]) {
        expect(screen.getByText(text).closest('[aria-hidden="true"]')).toBeNull();
      }
    });
  });

  describe("EvidenceChip", () => {
    it("starts its name with the visible kind and label of a live node", () => {
      useTopologyStore.setState({
        nodes: new Map([
          [
            "svc:orders-svc",
            {
              id: "svc:orders-svc",
              label: "orders-svc",
              kind: "service",
              health: "degraded",
              metrics,
            },
          ],
        ]),
      });
      render(<EvidenceChip nodeId="svc:orders-svc" />);

      const chip = screen.getByRole("button", { name: /^service orders-svc\b/i });
      expectNameContainsVisibleText(chip);
      expect(getAccessibleName(chip)).toMatch(/health degraded/);
    });

    it("starts its name with the label when no live node is known", () => {
      render(<EvidenceChip nodeId="svc:ghost" label="ghost-svc" health="critical" />);

      const chip = screen.getByRole("button", { name: /^ghost-svc\b/ });
      expectNameContainsVisibleText(chip);
      expect(getAccessibleName(chip)).toMatch(/health critical/);
    });
  });
});
