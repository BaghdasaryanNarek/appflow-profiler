import * as React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import TopologyPage from "@/app/topology/page";
import TopologyLoading from "@/app/topology/loading";
import ProcessesPage from "@/app/processes/page";
import InsightsPage from "@/app/insights/page";
import AboutPage from "@/app/about/page";
import NotFound from "@/app/not-found";
import RootPage from "@/app/page";
import { redirect } from "next/navigation";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/topology"),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
  })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  redirect: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  fetchTopologySummary: vi.fn(() =>
    Promise.resolve({
      node_count: 12,
      edge_count: 18,
      total_rps: 450,
      global_p99_ms: 12.5,
      global_error_rate: 0.01,
      critical_count: 0,
      degraded_count: 1,
      mode: "simulation",
    }),
  ),
  fetchSnapshots: vi.fn(() => Promise.resolve([])),
  exportSnapshot: vi.fn(() => Promise.resolve()),
  importSnapshot: vi.fn(() => Promise.resolve()),
}));

vi.mock("@/components/topology/TopologyCanvasWrapper", () => ({
  TopologyCanvasWrapper: () => <div data-testid="topology-canvas-mock">Topology Canvas</div>,
}));

describe("Route Stubs & Pages", () => {
  it("RootPage redirects to /topology", () => {
    RootPage();
    expect(redirect).toHaveBeenCalledWith("/topology");
  });

  describe("TopologyPage", () => {
    it("renders page title, KPI cards, and canvas island with zero a11y violations", async () => {
      const page = await TopologyPage();
      let container: HTMLElement | undefined;
      React.act(() => {
        const res = render(page);
        container = res.container;
      });
      expect(
        screen.getByRole("heading", { level: 1, name: "Network Topology" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Fleet Entities")).toBeInTheDocument();
      expect(screen.getAllByText("Throughput").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Status")).toBeInTheDocument();
      expect(screen.getByTestId("topology-canvas-island")).toBeInTheDocument();

      if (!container) {
        throw new Error("container is undefined");
      }
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("renders loading skeleton", () => {
      const { container } = render(<TopologyLoading />);
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
  });

  describe("ProcessesPage", () => {
    it("renders page title and virtualized table with zero a11y violations", async () => {
      const { container } = render(<ProcessesPage />);
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Process & Service Table",
        }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("processes-table-container")).toBeInTheDocument();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("InsightsPage", () => {
    it("renders page title and report placeholder with zero a11y violations", async () => {
      const { container } = render(<InsightsPage />);
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Optimization Advisor",
        }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("insights-report-placeholder")).toBeInTheDocument();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("AboutPage", () => {
    it("renders architecture overview and simulation disclosures with zero a11y violations", async () => {
      const { container } = render(<AboutPage />);
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "About AppFlow Profiler",
        }),
      ).toBeInTheDocument();
      expect(screen.getByText("Dual-Mode Telemetry")).toBeInTheDocument();
      expect(screen.getByText("Streaming Protocol")).toBeInTheDocument();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("NotFound", () => {
    it("renders 404 heading and return link with zero a11y violations", async () => {
      const { container } = render(<NotFound />);
      expect(screen.getByRole("heading", { level: 1, name: "Page Not Found" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: /Return to Topology/i })).toBeInTheDocument();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });
});
