"use client";

import * as React from "react";
import { Handle, Position } from "@xyflow/react";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber, formatLatencyMs, formatPercent, formatRps } from "@/lib/format";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";
import type { HealthStatus, NodeMetrics } from "@/types/contracts.gen";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { NodeSparkline } from "./NodeSparkline";

export interface BaseNodeCardProps {
  id: string;
  label: string;
  kind: string;
  health: HealthStatus;
  metrics: NodeMetrics;
  selected?: boolean | undefined;
  icon: LucideIcon;
  sublabel?: string | undefined;
  className?: string | undefined;
}

export const BaseNodeCard = React.memo(function BaseNodeCard({
  id,
  label,
  kind,
  health,
  metrics,
  selected = false,
  icon: Icon,
  sublabel,
  className,
}: BaseNodeCardProps) {
  const selectNode = useUiStore((s) => s.selectNode);

  // Stable reference to history buffer; toArray is only called when metrics change
  const historyBuffers = useTopologyStore((s) => s.nodeHistory.get(id));
  const currentRps = metrics.rps;
  const rpsHistory = React.useMemo(() => {
    if (currentRps < 0) return [];
    return historyBuffers?.rps.toArray();
  }, [historyBuffers, currentRps]);

  // Adjacency counts using adjacency map in topologyStore (O(1) Set lookup)
  const incidentEdgeIds = useTopologyStore((s) => s.adjacency.get(id));
  const edgesMap = useTopologyStore((s) => s.edges);

  const { upCount, downCount } = React.useMemo(() => {
    let up = 0;
    let down = 0;
    if (incidentEdgeIds) {
      for (const edgeId of incidentEdgeIds) {
        const edge = edgesMap.get(edgeId);
        if (edge) {
          if (edge.target === id) up++;
          if (edge.source === id) down++;
        }
      }
    } else {
      for (const edge of edgesMap.values()) {
        if (edge.target === id) up++;
        if (edge.source === id) down++;
      }
    }
    return { upCount: up, downCount: down };
  }, [id, incidentEdgeIds, edgesMap]);

  const healthConfig = React.useMemo(() => {
    switch (health) {
      case "healthy":
        return {
          icon: CheckCircle2,
          text: "Healthy",
          color: "var(--ok)",
          borderClass: "border-[var(--ok)]/40 hover:border-[var(--ok)]/70",
          glowClass: "shadow-[0_0_12px_rgba(34,197,94,0.15)]",
          badgeBg: "bg-[var(--ok)]/10 text-[var(--ok)]",
        };
      case "degraded":
        return {
          icon: AlertTriangle,
          text: "Degraded",
          color: "var(--warn)",
          borderClass: "border-[var(--warn)]/60 hover:border-[var(--warn)]",
          glowClass: "shadow-[0_0_14px_rgba(234,179,8,0.22)]",
          badgeBg: "bg-[var(--warn)]/15 text-[var(--warn)]",
        };
      case "critical":
        return {
          icon: AlertOctagon,
          text: "Critical",
          color: "var(--crit)",
          borderClass: "border-[var(--crit)]/80 hover:border-[var(--crit)]",
          glowClass: "shadow-[0_0_18px_rgba(239,68,68,0.3)]",
          badgeBg: "bg-[var(--crit)]/20 text-[var(--crit)]",
        };
      default:
        return {
          icon: HelpCircle,
          text: "Unknown",
          color: "var(--fg-muted)",
          borderClass: "border-[var(--border)]",
          glowClass: "",
          badgeBg: "bg-[var(--surface)] text-[var(--fg-muted)]",
        };
    }
  }, [health]);

  const HealthIcon = healthConfig.icon;

  const accessibleLabel = React.useMemo(() => {
    return `${kind} ${label}, health ${health}, ${formatNumber(metrics.rps)} requests per second, p99 ${String(Math.round(metrics.p99_ms))} milliseconds, ${String(upCount)} upstream, ${String(downCount)} downstream`;
  }, [kind, label, health, metrics.rps, metrics.p99_ms, upCount, downCount]);

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectNode(id);
    },
    [id, selectNode],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        selectNode(id);
      }
    },
    [id, selectNode],
  );

  return (
    <TooltipProvider delayDuration={250}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            data-testid={`node-${id}`}
            data-node-id={id}
            tabIndex={0}
            role="button"
            aria-label={accessibleLabel}
            aria-pressed={selected}
            onClick={handleClick}
            onKeyDown={handleKeyDown}
            className={cn(
              "glass-surface group relative flex w-[240px] cursor-pointer flex-col rounded-lg p-3 transition-all duration-150 select-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] focus-visible:outline-none",
              healthConfig.borderClass,
              healthConfig.glowClass,
              selected && "border-[var(--accent)] ring-2 ring-[var(--accent)]/50",
              className,
            )}
          >
            {/* React Flow Left Handle (Target) */}
            <Handle
              type="target"
              position={Position.Left}
              className="!h-2.5 !w-2.5 !border-2 !border-[var(--bg)] !bg-[var(--fg-muted)] group-hover:!bg-[var(--accent)]"
            />

            {/* Node Header */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 overflow-hidden">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)]">
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                </div>
                <div className="flex flex-col overflow-hidden">
                  <span
                    className="truncate font-mono text-xs font-semibold text-[var(--fg)]"
                    title={label}
                  >
                    {label}
                  </span>
                  {sublabel && (
                    <span className="truncate text-[10px] text-[var(--fg-muted)]">{sublabel}</span>
                  )}
                </div>
              </div>

              {/* Health Badge: color + icon + text (WCAG SC 1.4.1 compliance) */}
              <div
                className={cn(
                  "flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium",
                  healthConfig.badgeBg,
                )}
                aria-hidden="true"
              >
                <HealthIcon className="h-3 w-3" />
                <span>{healthConfig.text}</span>
              </div>
            </div>

            {/* Metrics Strip */}
            <div className="mt-2.5 flex items-end justify-between border-t border-[var(--border)] pt-2 font-mono text-xs text-[var(--fg-muted)]">
              <div className="flex flex-col">
                <span className="text-[9px] tracking-wider text-[var(--fg-muted)] uppercase">
                  RPS
                </span>
                <span className="font-semibold text-[var(--fg)] tabular-nums">
                  {formatNumber(metrics.rps)}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[9px] tracking-wider text-[var(--fg-muted)] uppercase">
                  p99
                </span>
                <span className="font-semibold text-[var(--fg)] tabular-nums">
                  {formatLatencyMs(metrics.p99_ms)}
                </span>
              </div>

              <div className="flex flex-col">
                <span className="text-[9px] tracking-wider text-[var(--fg-muted)] uppercase">
                  {metrics.error_rate > 0 ? "Err" : "Sat"}
                </span>
                <span
                  className={cn(
                    "font-semibold tabular-nums",
                    metrics.error_rate > 0.05
                      ? "text-[var(--crit)]"
                      : metrics.error_rate > 0
                        ? "text-[var(--warn)]"
                        : "text-[var(--fg)]",
                  )}
                >
                  {metrics.error_rate > 0
                    ? `${(metrics.error_rate * 100).toFixed(1)}%`
                    : `${(metrics.saturation * 100).toFixed(0)}%`}
                </span>
              </div>

              {/* Mini Sparkline */}
              <NodeSparkline data={rpsHistory} color={healthConfig.color} width={48} height={18} />
            </div>

            {/* React Flow Right Handle (Source) */}
            <Handle
              type="source"
              position={Position.Right}
              className="!h-2.5 !w-2.5 !border-2 !border-[var(--bg)] !bg-[var(--fg-muted)] group-hover:!bg-[var(--accent)]"
            />
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="flex items-center gap-3 font-mono text-[11px] tabular-nums"
        >
          <span>
            <strong className="text-[var(--fg-muted)]">RPS:</strong> {formatRps(metrics.rps)}
          </span>
          <span>
            <strong className="text-[var(--fg-muted)]">p99:</strong>{" "}
            {formatLatencyMs(metrics.p99_ms)}
          </span>
          <span>
            <strong className="text-[var(--fg-muted)]">Err:</strong>{" "}
            {formatPercent(metrics.error_rate)}
          </span>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});
