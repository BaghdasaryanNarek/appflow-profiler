"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Activity, Network, ArrowUpRight, ShieldCheck, Play, Pause, RotateCcw } from "lucide-react";
import { useTopologyStream } from "@/lib/realtime/useTopologyStream";
import { useKpiSummary } from "@/store/selectors";
import { formatLatencyMs, formatPercent, formatRps } from "@/lib/format";

export function TopologyLiveStrip() {
  const { status, isPaused, tickAgeMs, seq, pause, resume, resync } = useTopologyStream();
  const kpi = useKpiSummary();

  const totalEntities = kpi.nodeCount;
  const healthyRatio = totalEntities > 0 ? kpi.healthyCount / totalEntities : 1.0;

  return (
    <div className="space-y-4">
      {/* KPI Cards Strip */}
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <Card className="glass-surface">
            <CardContent className="flex items-center gap-3 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[oklch(0.70_0.15_255_/_0.15)] text-[var(--accent)]">
                <Network className="h-5 w-5" />
              </div>
              <div>
                <p className="text-xs font-medium text-[var(--fg-muted)]">Active Nodes</p>
                <p
                  className="text-xl font-bold text-[var(--fg)] tabular-nums"
                  data-testid="kpi-node-count"
                >
                  {kpi.nodeCount > 0 ? kpi.nodeCount : "--"}
                </p>
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
                <p
                  className="text-xl font-bold text-[var(--ok)] tabular-nums"
                  data-testid="kpi-health-ratio"
                >
                  {totalEntities > 0 ? formatPercent(healthyRatio) : "100%"}
                </p>
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
                <p
                  className="text-xl font-bold text-[var(--fg)] tabular-nums"
                  data-testid="kpi-total-rps"
                >
                  {kpi.totalRps > 0 ? formatRps(kpi.totalRps) : "0 rps"}
                </p>
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
                <p
                  className="text-xl font-bold text-[var(--fg)] tabular-nums"
                  data-testid="kpi-p99-ms"
                >
                  {kpi.globalP99Ms > 0 ? formatLatencyMs(kpi.globalP99Ms) : "-- ms"}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Stream Status & Controls Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] px-3 py-2 text-xs text-[var(--fg-muted)]">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 font-medium">
            Status:
            <Badge
              variant={status === "connected" ? "ok" : status === "error" ? "crit" : "outline"}
              className="px-1.5 py-0 text-[10px] uppercase"
              data-testid="stream-status-badge"
            >
              {status}
            </Badge>
          </span>
          <span className="hidden font-mono sm:inline-flex" data-testid="stream-seq">
            Seq: {seq ?? 0}
          </span>
          {tickAgeMs !== null && (
            <span className="hidden font-mono sm:inline-flex">Tick: {tickAgeMs}ms</span>
          )}
          {kpi.criticalCount > 0 && (
            <Badge variant="crit" className="px-1.5 py-0 text-[10px]">
              {kpi.criticalCount} crit
            </Badge>
          )}
          {kpi.degradedCount > 0 && (
            <Badge variant="warn" className="px-1.5 py-0 text-[10px]">
              {kpi.degradedCount} depr
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isPaused ? (
            <Button
              variant="outline"
              size="sm"
              onClick={resume}
              className="h-7 gap-1.5 px-2 text-xs"
              aria-label="Resume stream"
            >
              <Play className="h-3 w-3" />
              <span>Resume</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={pause}
              className="h-7 gap-1.5 px-2 text-xs"
              aria-label="Pause stream"
            >
              <Pause className="h-3 w-3" />
              <span>Pause</span>
            </Button>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={resync}
            className="h-7 gap-1.5 px-2 text-xs"
            aria-label="Resync stream"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Resync</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
