import type { Metadata } from "next";
import { fetchTopologySummary } from "@/lib/api/client";
import { KpiStrip } from "@/components/topology/KpiStrip";
import { TopologyLiveStrip } from "@/components/topology/TopologyLiveStrip";
import { TopologyCanvasWrapper } from "@/components/topology/TopologyCanvasWrapper";
import type { TopologySummary } from "@/types/contracts.gen";

export const metadata: Metadata = {
  title: "Topology | AppFlow Profiler",
  description: "Real-time process topology graph and network flow visualization",
};

export default async function TopologyPage() {
  let initialSummary: TopologySummary | null = null;

  try {
    // 1.5-second timeout guard so build time / cold starts never block or crash
    initialSummary = await fetchTopologySummary({
      timeoutMs: 1500,
      signal: AbortSignal.timeout(1500),
    });
  } catch {
    // Graceful fallback during CI build or backend waking up
    initialSummary = null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Network Topology</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Interactive process graph, socket connection map, and traffic flow diagnostics.
        </p>
      </div>

      {/* Server-Rendered LCP KPI Strip with Live Store Hydration */}
      <KpiStrip summary={initialSummary} />

      {/* Live Stream Controller Bar */}
      <TopologyLiveStrip showKpiCards={false} />

      {/* Hero Canvas Island with strict height to guarantee 0 CLS */}
      <div
        id="topology-canvas-container"
        className="glass-surface relative h-[calc(100dvh-13rem)] min-h-[640px] w-full overflow-hidden rounded-xl border border-[var(--border)]"
        style={{ viewTransitionName: "topology-canvas" }}
        data-testid="topology-canvas-island"
      >
        <TopologyCanvasWrapper />
      </div>
    </div>
  );
}
