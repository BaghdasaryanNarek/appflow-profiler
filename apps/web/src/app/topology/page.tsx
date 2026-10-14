import type { Metadata } from "next";
import { Network } from "lucide-react";
import { TopologyLiveStrip } from "@/components/topology/TopologyLiveStrip";

export const metadata: Metadata = {
  title: "Topology | AppFlow Profiler",
  description: "Real-time process topology graph and network flow visualization",
};

export default function TopologyPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Network Topology</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Interactive process graph and real-time socket connection map.
        </p>
      </div>

      {/* Real-time KPI Metric Strip & Stream Status */}
      <TopologyLiveStrip />

      {/* Canvas Container Placeholder */}
      <div
        id="topology-canvas-container"
        className="glass-surface relative flex min-h-[460px] w-full flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-6 text-center select-none"
        style={{ viewTransitionName: "topology-canvas" }}
        data-testid="topology-canvas-island"
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)]">
          <Network className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">Topology Canvas Island</h2>
        <p className="mt-1 max-w-md text-xs text-[var(--fg-muted)]">
          Interactive React Flow canvas with ELK layered layout, real-time edge flow particles, and
          socket inspection sheets will mount here in Phase 12.
        </p>
      </div>
    </div>
  );
}
