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
  redirect: vi.fn(),
}));

describe("Route Stubs & Pages", () => {
  it("RootPage redirects to /topology", () => {
    RootPage();
    expect(redirect).toHaveBeenCalledWith("/topology");
  });

  describe("TopologyPage", () => {
    it("renders page title, KPI cards, and canvas island with zero a11y violations", async () => {
      const { container } = render(<TopologyPage />);
      expect(
        screen.getByRole("heading", { level: 1, name: "Network Topology" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Active Nodes")).toBeInTheDocument();
      expect(screen.getByText("Health Ratio")).toBeInTheDocument();
      expect(screen.getByTestId("topology-canvas-island")).toBeInTheDocument();

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("renders loading skeleton", () => {
      const { container } = render(<TopologyLoading />);
      expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    });
  });

  describe("ProcessesPage", () => {
    it("renders page title and table placeholder with zero a11y violations", async () => {
      const { container } = render(<ProcessesPage />);
      expect(
        screen.getByRole("heading", {
          level: 1,
          name: "Process & Service Table",
        }),
      ).toBeInTheDocument();
      expect(screen.getByTestId("processes-table-placeholder")).toBeInTheDocument();

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
