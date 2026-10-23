"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Network, Activity, ArrowUpRight, ShieldAlert, Cpu } from "lucide-react";
import { formatRps, formatLatencyMs, formatPercent } from "@/lib/format";
import { useKpiSummary } from "@/store/selectors";
import { useUiStore } from "@/store/ui-store";
import type { TopologySummary } from "@/types/contracts.gen";

export interface KpiStripProps {
  summary?: TopologySummary | null | undefined;
}

/**
 * Server-renderable KPI headline strip (the LCP element per §0.3 & §3.6) with
 * seamless client hydration from the live WebSocket topology store.
 * Uses container queries and tabular figures to present instant fleet health on initial paint
 * while automatically switching to live telemetry once the WebSocket stream populates.
 */
export function KpiStrip({ summary }: KpiStripProps) {
  const liveKpi = useKpiSummary();
  const connectionStatus = useUiStore((s) => s.connectionStatus);

  const hasLive = liveKpi.nodeCount > 0;
  const nodeCount = hasLive ? liveKpi.nodeCount : (summary?.node_count ?? 0);
  const edgeCount = hasLive ? liveKpi.edgeCount : (summary?.edge_count ?? 0);
  const totalRps = hasLive ? liveKpi.totalRps : (summary?.total_rps ?? 0);
  const p99Ms = hasLive ? liveKpi.globalP99Ms : (summary?.global_p99_ms ?? 0);
  const errorRate = hasLive ? liveKpi.globalErrorRate : (summary?.global_error_rate ?? 0);
  const critCount = hasLive ? liveKpi.criticalCount : (summary?.critical_count ?? 0);
  const deprCount = hasLive ? liveKpi.degradedCount : (summary?.degraded_count ?? 0);
  const mode = hasLive ? liveKpi.mode : (summary?.mode ?? "demo");
  const scenario = hasLive ? liveKpi.activeScenario : (summary?.active_scenario ?? null);

  return (
    <div className="@container w-full" aria-label="Fleet Key Performance Indicators">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {/* Nodes & Edges Card */}
        <Card className="glass-surface border-[var(--border)]">
          <CardContent className="flex items-center gap-3 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/15 text-[var(--accent)]">
              <Network className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[11px] font-medium text-[var(--fg-muted)]">Fleet Entities</p>
              <p
                className="font-mono text-lg font-bold text-[var(--fg)] tabular-nums sm:text-xl"
                data-testid="kpi-node-count"
              >
                {nodeCount > 0 || connectionStatus === "connected" ? (
                  <>
                    <span>{nodeCount}</span>
                    <span className="ml-1 text-xs font-normal text-[var(--fg-muted)]">
                      / {edgeCount} edges
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-normal text-[var(--fg-muted)]">Connecting…</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Throughput Card */}
        <Card className="glass-surface border-[var(--border)]">
          <CardContent className="flex items-center gap-3 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--ok)]/15 text-[var(--ok)]">
              <Activity className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[11px] font-medium text-[var(--fg-muted)]">Throughput</p>
              <p
                className="font-mono text-lg font-bold text-[var(--fg)] tabular-nums sm:text-xl"
                data-testid="kpi-total-rps"
              >
                {totalRps > 0 ? formatRps(totalRps) : "0 rps"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Global p99 Latency Card */}
        <Card className="glass-surface border-[var(--border)]">
          <CardContent className="flex items-center gap-3 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--warn)]/15 text-[var(--warn)]">
              <ArrowUpRight className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[11px] font-medium text-[var(--fg-muted)]">Global p99</p>
              <p
                className="font-mono text-lg font-bold text-[var(--fg)] tabular-nums sm:text-xl"
                data-testid="kpi-p99-ms"
              >
                {p99Ms > 0 ? formatLatencyMs(p99Ms) : "--"}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Error Rate Card */}
        <Card className="glass-surface border-[var(--border)]">
          <CardContent className="flex items-center gap-3 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--crit)]/15 text-[var(--crit)]">
              <ShieldAlert className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[11px] font-medium text-[var(--fg-muted)]">Error Rate</p>
              <p
                className="font-mono text-lg font-bold text-[var(--fg)] tabular-nums sm:text-xl"
                data-testid="kpi-error-rate"
              >
                {errorRate > 0 ? (
                  <span className="text-[var(--crit)]">{formatPercent(errorRate)}</span>
                ) : (
                  <span className="text-[var(--ok)]">0.0%</span>
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Mode & Health Status Card */}
        <Card className="glass-surface col-span-2 border-[var(--border)] lg:col-span-1">
          <CardContent className="flex items-center gap-3 p-3 sm:p-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] text-[var(--fg)]">
              <Cpu className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
            </div>
            <div className="overflow-hidden">
              <p className="text-[11px] font-medium text-[var(--fg-muted)]">Status</p>
              <div className="flex items-center gap-1.5 font-mono text-xs" data-testid="kpi-status">
                {critCount > 0 ? (
                  <span className="font-bold text-[var(--crit)]">{critCount} Critical</span>
                ) : deprCount > 0 ? (
                  <span className="font-bold text-[var(--warn)]">{deprCount} Degraded</span>
                ) : (
                  <span className="font-bold text-[var(--ok)]">All Healthy</span>
                )}
                {scenario && (
                  <span className="truncate text-[10px] text-[var(--fg-muted)]">({scenario})</span>
                )}
                {!scenario && <span className="text-[10px] text-[var(--fg-muted)]">({mode})</span>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
