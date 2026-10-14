import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, Network, ArrowUpRight, ShieldCheck } from "lucide-react";

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

      {/* KPI Metric Strip */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Card className="glass-surface">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.70_0.15_255_/_0.15)] text-[var(--accent)]">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--fg-muted)]">Active Nodes</p>
                <p className="text-xl font-bold text-[var(--fg)] tabular-nums">--</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-surface">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.72_0.16_145_/_0.15)] text-[var(--ok)]">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--fg-muted)]">Health Ratio</p>
                <p className="text-xl font-bold text-[var(--ok)] tabular-nums">100%</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-surface">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.75_0.16_75_/_0.15)] text-[var(--warn)]">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--fg-muted)]">Throughput</p>
                <p className="text-xl font-bold text-[var(--fg)] tabular-nums">0 B/s</p>
              </div>
            </CardContent>
          </Card>

          <Card className="glass-surface">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.70_0.15_255_/_0.15)] text-[var(--accent)]">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--fg-muted)]">Latency (P99)</p>
                <p className="text-xl font-bold text-[var(--fg)] tabular-nums">-- ms</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

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
          socket inspection sheets will mount here in Phase 11.
        </p>
      </div>
    </div>
  );
}
