import * as React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import { TopologyTable } from "@/components/table/TopologyTable";
import { useUiStore } from "@/store/ui-store";
import type { Node, NodeMetrics } from "@/types/contracts.gen";

function createMockMetrics(overrides?: Partial<NodeMetrics>): NodeMetrics {
  return {
    rps: 100,
    p50_ms: 5,
    p99_ms: 15,
    error_rate: 0.001,
    saturation: 0.2,
    cpu_percent: 25,
    open_connections: 10,
    rss_bytes: 100 * 1024 * 1024,
    quality: "measured",
    ...overrides,
  };
}

const mockNodes: Node[] = [
  {
    id: "svc:web",
    label: "Web Service",
    kind: "service",
    health: "healthy",
    metrics: createMockMetrics({ rps: 500, p99_ms: 10 }),
  },
  {
    id: "svc:api",
    label: "API Gateway",
    kind: "service",
    health: "degraded",
    metrics: createMockMetrics({ rps: 300, p99_ms: 45, error_rate: 0.05 }),
  },
  {
    id: "db:postgres",
    label: "PostgreSQL Database",
    kind: "datastore",
    health: "critical",
    metrics: createMockMetrics({ rps: 150, p99_ms: 120, saturation: 0.95 }),
  },
];

describe("TopologyTable Component (§3.5, §3.7)", () => {
  beforeEach(() => {
    useUiStore.setState({
      selectedNodeId: null,
      searchQuery: "",
      kinds: [],
    });
  });

  it("renders accessible semantic table presentation with caption, zero a11y violations, and aria-rowcount", async () => {
    const { container } = render(<TopologyTable nodes={mockNodes} showToolbar={true} />);

    expect(
      screen.getByRole("region", { name: "Semantic Topology Table Presentation" }),
    ).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(table).toHaveAttribute("aria-rowcount", "3");

    // Caption should exist for screen readers
    expect(table.querySelector("caption")).toBeInTheDocument();

    expect(screen.getByText("Web Service")).toBeInTheDocument();
    expect(screen.getByText("API Gateway")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("preserves aria-rowindex on rows", () => {
    render(<TopologyTable nodes={mockNodes} showToolbar={false} />);

    const rows = screen.getAllByRole("row", { name: /requests per second/i });
    expect(rows.length).toBe(3);

    // Default sorted by health (critical first -> degraded -> healthy)
    expect(rows[0]).toHaveAttribute("aria-rowindex", "1");
    expect(rows[1]).toHaveAttribute("aria-rowindex", "2");
    expect(rows[2]).toHaveAttribute("aria-rowindex", "3");
  });

  it("sorts by column on header click and updates aria-sort attribute", () => {
    render(<TopologyTable nodes={mockNodes} showToolbar={false} />);

    const rpsHeader = screen.getByRole("columnheader", { name: /RPS/i });
    expect(rpsHeader).toHaveAttribute("aria-sort", "none");

    const rpsBtn = screen.getByRole("button", { name: /RPS/i });

    // Click to sort ascending by RPS
    fireEvent.click(rpsBtn);
    expect(rpsHeader).toHaveAttribute("aria-sort", "ascending");

    let rows = screen.getAllByRole("row", { name: /requests per second/i });
    // PostgreSQL (150) -> API (300) -> Web (500)
    expect(rows[0]).toHaveAttribute("data-node-id", "db:postgres");
    expect(rows[2]).toHaveAttribute("data-node-id", "svc:web");

    // Click to toggle descending by RPS
    fireEvent.click(rpsBtn);
    expect(rpsHeader).toHaveAttribute("aria-sort", "descending");

    rows = screen.getAllByRole("row", { name: /requests per second/i });
    // Web (500) -> API (300) -> PostgreSQL (150)
    expect(rows[0]).toHaveAttribute("data-node-id", "svc:web");
    expect(rows[2]).toHaveAttribute("data-node-id", "db:postgres");
  });

  it("filters table entities by search input", () => {
    render(<TopologyTable nodes={mockNodes} showToolbar={true} />);

    const searchInput = screen.getByPlaceholderText(/Filter table entities…/i);
    fireEvent.change(searchInput, { target: { value: "postgres" } });

    expect(screen.getByText("PostgreSQL Database")).toBeInTheDocument();
    expect(screen.queryByText("Web Service")).not.toBeInTheDocument();
    expect(screen.queryByText("API Gateway")).not.toBeInTheDocument();
  });

  it("selects node on row click and Enter key press", () => {
    render(<TopologyTable nodes={mockNodes} showToolbar={false} />);

    const webRow = screen.getByRole("row", { name: /Web Service/i });
    fireEvent.click(webRow);
    expect(useUiStore.getState().selectedNodeId).toBe("svc:web");

    const apiRow = screen.getByRole("row", { name: /API Gateway/i });
    fireEvent.keyDown(apiRow, { key: "Enter" });
    expect(useUiStore.getState().selectedNodeId).toBe("svc:api");
  });
});
