import * as React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { axe } from "vitest-axe";
import { toast } from "sonner";

import { EvidenceChip, RecommendationCard, ReportView } from "@/components/insights";
import InsightsPage from "@/app/insights/page";
import * as apiClient from "@/lib/api/client";
import { ApiProblemError } from "@/lib/api/errors";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";
import type { Node, OptimizationReport } from "@/types/contracts.gen";

const mockPush = vi.fn();
const mockReplace = vi.fn();
let currentSearchParams = new URLSearchParams();

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/insights"),
  useRouter: vi.fn(() => ({
    push: mockPush,
    replace: mockReplace,
  })),
  useSearchParams: vi.fn(() => currentSearchParams),
}));

vi.mock("@/lib/realtime/useTopologyStream", () => ({
  useTopologyStream: vi.fn(() => ({
    status: "open",
    isPaused: false,
    tickAgeMs: 50,
    seq: 1,
    pause: vi.fn(),
    resume: vi.fn(),
    resync: vi.fn(),
  })),
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

function createSampleNode(id: string, label: string, health: Node["health"] = "critical"): Node {
  return {
    id,
    label,
    kind: "service",
    health,
    health_reasons: ["p99_ms 480.0 > 250.0 threshold"],
    metrics: {
      rps: 420,
      p50_ms: 14,
      p99_ms: 480,
      error_rate: 0.06,
      saturation: 0.91,
      cpu_percent: 84.2,
      rss_bytes: 536870912,
      open_connections: 128,
      quality: "measured",
    },
  };
}

function createSampleReport(source: OptimizationReport["source"] = "gemini"): OptimizationReport {
  return {
    report_id: "rep-2026-001",
    generated_at: "2026-10-16T12:00:00Z",
    source,
    model: source === "gemini" ? "gemini-2.5-flash" : null,
    digest_hash: "a1b2c3d4e5f60718293a4b5c6d7e8f90",
    summary:
      "Critical tail latency amplification detected on Orders Service due to downstream PostgreSQL connection pool saturation.",
    bottlenecks: [
      {
        node_id: "svc:orders-svc",
        severity: "high",
        title: "Orders Service experiencing severe p99 queueing delay.",
        evidence: ["p99_ms=480.0ms exceeds 250.0ms SLO", "saturation=91.0% with 6.0% error_rate"],
      },
    ],
    // Intentionally out-of-order priorities (3, 1, 2) to verify ascending sort (1 -> 5)
    recommendations: [
      {
        id: "rec-obs-3",
        priority: 3,
        category: "observability",
        title: "Add pool wait-time histogram alerts",
        rationale: "Early saturation warning before hard pool exhaustion occurs.",
        expected_impact: "Reduces mean time to detect (MTTD) pool contention by 80%.",
        affected_node_ids: ["svc:orders-svc"],
        effort: "S",
      },
      {
        id: "rec-pool-1",
        priority: 1,
        category: "connection_pooling",
        title: "Deploy transaction-mode PgBouncer ahead of Primary DB",
        rationale: "Multiplexes high-churn short transactions across bounded backend connections.",
        expected_impact: "Lowers p99 latency from 480ms to <45ms and eliminates pool timeouts.",
        affected_node_ids: ["svc:orders-svc", "db:orders-primary"],
        effort: "M",
      },
      {
        id: "rec-retry-2",
        priority: 2,
        category: "retry_policy",
        title: "Enforce jittered exponential backoff with token bucket",
        rationale: "Prevents synchronous retry storms from amplifying downstream load.",
        expected_impact: "Cuts retry-induced traffic spikes by 65%.",
        affected_node_ids: ["svc:orders-svc"],
        effort: "S",
      },
    ],
    caveats: ["Metrics sampled over a 60-second sliding window in simulation mode."],
  };
}

describe("Phase 15: Insights UI (Optimization Advisor)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentSearchParams = new URLSearchParams();
    useTopologyStore.getState().reset();
    useUiStore.getState().clearSelection();
  });

  afterEach(() => {
    cleanup();
  });

  describe("ReportView & RecommendationCard", () => {
    it("renders Gemini AI provenance, bottlenecks, caveats, and recommendations sorted by priority (1 -> 5) with 0 axe violations", async () => {
      const node = createSampleNode("svc:orders-svc", "Orders Service");
      useTopologyStore.getState().applySnapshot({ nodes: [node], edges: [] }, 1);

      const report = createSampleReport("gemini");
      const { container } = render(<ReportView report={report} />);

      // Provenance badge & model
      expect(screen.getByTestId("report-source-badge")).toHaveTextContent("Gemini AI");
      expect(screen.getByTestId("report-model-badge")).toHaveTextContent("gemini-2.5-flash");

      // Summary & bottleneck
      expect(screen.getByTestId("report-summary-text")).toHaveTextContent(
        /Critical tail latency amplification detected/i,
      );
      expect(screen.getByTestId("bottleneck-card-svc:orders-svc")).toBeInTheDocument();
      expect(screen.getByText("p99_ms=480.0ms exceeds 250.0ms SLO")).toBeInTheDocument();

      // Verify ascending priority sort (P1 first, P2 second, P3 third)
      const priorityBadges = screen.getAllByTestId("recommendation-priority-badge");
      expect(priorityBadges).toHaveLength(3);
      expect(priorityBadges[0]).toHaveTextContent("P1 · Critical");
      expect(priorityBadges[1]).toHaveTextContent("P2 · High");
      expect(priorityBadges[2]).toHaveTextContent("P3 · Medium");

      // Caveats
      expect(screen.getByTestId("report-caveats-footer")).toHaveTextContent(
        /Metrics sampled over a 60-second sliding window/i,
      );

      const axeResults = await axe(container);
      expect(axeResults).toHaveNoViolations();
    });

    it("renders Heuristic Engine fallback provenance when source is heuristic", () => {
      const report = createSampleReport("heuristic");
      render(<ReportView report={report} />);

      expect(screen.getByTestId("report-source-badge")).toHaveTextContent("Heuristic Engine");
      expect(screen.queryByTestId("report-model-badge")).not.toBeInTheDocument();
      expect(screen.getByTestId("report-source-explanation")).toHaveTextContent(
        /Deterministic SRE queueing and threshold heuristic engine/i,
      );
    });

    it("renders individual RecommendationCard with effort, category, expected impact, and evidence chips", () => {
      const rec = createSampleReport("heuristic").recommendations?.[1];
      if (!rec) {
        throw new Error("Expected sample recommendation at index 1");
      }
      render(<RecommendationCard recommendation={rec} />);

      expect(screen.getByTestId("recommendation-card-rec-pool-1")).toBeInTheDocument();
      expect(screen.getByTestId("recommendation-category-badge")).toHaveTextContent(
        "Connection Pooling",
      );
      expect(screen.getByTestId("recommendation-effort-badge")).toHaveTextContent("Effort: M");
      expect(screen.getByText(/Lowers p99 latency from 480ms/i)).toBeInTheDocument();
      expect(screen.getByTestId("evidence-chip-svc:orders-svc")).toBeInTheDocument();
      expect(screen.getByTestId("evidence-chip-db:orders-primary")).toBeInTheDocument();
    });
  });

  describe("EvidenceChip Navigation & Selection", () => {
    it("selects the target node in useUiStore and navigates to /topology on click and Enter key", () => {
      const node = createSampleNode("svc:orders-svc", "Orders Service", "critical");
      useTopologyStore.getState().applySnapshot({ nodes: [node], edges: [] }, 1);

      render(<EvidenceChip nodeId="svc:orders-svc" />);

      const chip = screen.getByTestId("evidence-chip-svc:orders-svc");
      expect(chip).toHaveTextContent("Orders Service");
      expect(chip).toHaveAttribute("aria-label", expect.stringContaining("Orders Service"));

      fireEvent.click(chip);

      expect(useUiStore.getState().selectedNodeId).toBe("svc:orders-svc");
      expect(useUiStore.getState().detailSheetOpen).toBe(true);
      expect(mockPush).toHaveBeenCalledWith("/topology");

      // Reset and test keyboard activation
      useUiStore.getState().clearSelection();
      mockPush.mockClear();

      fireEvent.keyDown(chip, { key: "Enter" });
      expect(useUiStore.getState().selectedNodeId).toBe("svc:orders-svc");
      expect(mockPush).toHaveBeenCalledWith("/topology");
    });
  });

  describe("/insights Route & Pre-Scoping", () => {
    it("triggers global topology analysis on button click and renders the resulting report with 0 axe violations", async () => {
      const analyzeSpy = vi
        .spyOn(apiClient, "analyzeTopology")
        .mockResolvedValue(createSampleReport("heuristic"));

      const { container } = render(<InsightsPage />);

      expect(screen.getByTestId("insights-report-placeholder")).toBeInTheDocument();

      const analyzeBtn = screen.getByTestId("analyze-topology-btn");
      fireEvent.click(analyzeBtn);

      await waitFor(() => {
        expect(analyzeSpy).toHaveBeenCalledWith(
          { scope: "global" },
          { signal: expect.any(AbortSignal) as AbortSignal },
        );
      });

      expect(await screen.findByTestId("insights-report-view")).toBeInTheDocument();

      const axeResults = await axe(container);
      expect(axeResults).toHaveNoViolations();
    });

    it("pre-scopes to Specific Node and automatically analyzes when ?node=<id> query param is present", async () => {
      currentSearchParams = new URLSearchParams("node=svc%3Aorders-svc");
      const node = createSampleNode("svc:orders-svc", "Orders Service");
      useTopologyStore.getState().applySnapshot({ nodes: [node], edges: [] }, 1);

      const analyzeSpy = vi
        .spyOn(apiClient, "analyzeTopology")
        .mockResolvedValue(createSampleReport("heuristic"));

      render(<InsightsPage />);

      await waitFor(() => {
        expect(analyzeSpy).toHaveBeenCalledWith(
          { scope: "svc:orders-svc" },
          { signal: expect.any(AbortSignal) as AbortSignal },
        );
      });

      const nodeSelect = screen.getByTestId<HTMLSelectElement>("scope-node-select");
      expect(nodeSelect.value).toBe("svc:orders-svc");
      expect(await screen.findByTestId("insights-report-view")).toBeInTheDocument();
    });

    it("surfaces RFC 9457 429 rate-limit errors via sonner toast and accessible alert banner", async () => {
      const problemError = new ApiProblemError({
        type: "https://appflow.dev/problems/rate-limit-exceeded",
        title: "Too Many Requests",
        status: 429,
        detail: "Advisor rate limit of 10 requests per minute exceeded.",
      });

      vi.spyOn(apiClient, "analyzeTopology").mockRejectedValue(problemError);

      render(<InsightsPage />);

      fireEvent.click(screen.getByTestId("analyze-topology-btn"));

      const alertBanner = await screen.findByTestId("insights-error-alert");
      expect(alertBanner).toBeInTheDocument();
      expect(alertBanner).toHaveTextContent("Too Many Requests");
      expect(alertBanner).toHaveTextContent("HTTP 429");
      expect(alertBanner).toHaveTextContent(
        "Advisor rate limit of 10 requests per minute exceeded.",
      );

      expect(toast.error).toHaveBeenCalledWith("Too Many Requests", {
        description: "Advisor rate limit of 10 requests per minute exceeded.",
      });
    });
  });
});
