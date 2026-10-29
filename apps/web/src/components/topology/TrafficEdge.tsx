"use client";

import * as React from "react";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
  type Edge,
} from "@xyflow/react";
import { cn } from "@/lib/utils";
import { formatNumber, formatLatencyMs, formatPercent, formatRps } from "@/lib/format";
import { useUiStore } from "@/store/ui-store";
import type { HealthStatus } from "@/types/contracts.gen";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { FlowEdgeData } from "./types";

export type TrafficEdgeProps = EdgeProps<Edge<FlowEdgeData, "traffic">>;

export const TrafficEdge = React.memo(function TrafficEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: TrafficEdgeProps) {
  const selectEdge = useUiStore((s) => s.selectEdge);

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const rps = data?.metrics.rps ?? 0;
  const health: HealthStatus = data?.health ?? "healthy";

  // Log-scaled stroke width: Math.max(1.5, Math.min(8, Math.log10(rps + 1) * 2.2)) per §3.5
  const strokeWidth = React.useMemo(() => {
    return Math.max(1.5, Math.min(8, Math.log10(rps + 1) * 2.2));
  }, [rps]);

  // Dual encoding: color AND stroke dash pattern (WCAG SC 1.4.1 compliance)
  const healthStyle = React.useMemo(() => {
    switch (health) {
      case "healthy":
        return {
          stroke: "var(--ok)",
          strokeDasharray: undefined,
          glow: "drop-shadow(0 0 3px rgba(34,197,94,0.3))",
          labelClass: "border-[var(--ok)]/40 text-[var(--ok)]",
        };
      case "degraded":
        return {
          stroke: "var(--warn)",
          strokeDasharray: "8 4", // long-dash
          glow: "drop-shadow(0 0 4px rgba(234,179,8,0.4))",
          labelClass: "border-[var(--warn)]/60 text-[var(--warn)]",
        };
      case "critical":
        return {
          stroke: "var(--crit)",
          strokeDasharray: "3 3", // short-dash
          glow: "drop-shadow(0 0 6px rgba(239,68,68,0.5))",
          labelClass: "border-[var(--crit)]/80 text-[var(--crit)]",
        };
      default:
        return {
          stroke: "var(--border-strong)",
          strokeDasharray: "4 2",
          glow: "none",
          labelClass: "border-[var(--border)] text-[var(--fg-muted)]",
        };
    }
  }, [health]);

  const handleClick = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectEdge(id);
    },
    [id, selectEdge],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        selectEdge(id);
      }
    },
    [id, selectEdge],
  );

  const edgeDescription = `Edge ${id}, protocol ${data?.protocol ?? "tcp"}, health ${health}, ${rps.toLocaleString()} requests per second`;
  // The pill's name starts with its visible "<rps> rps" text (WCAG 2.5.3); the hit-target path has none.
  // The {" "} between the pill's spans keeps the visible words apart; flex layout drops it visually.
  const pillText = `${formatNumber(rps)} rps`;

  return (
    <>
      {/* Invisible wider hit-target for effortless clicking and keyboard focus */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(20, strokeWidth + 12)}
        className="cursor-pointer focus:outline-none"
        tabIndex={0}
        role="button"
        data-edge-id={id}
        aria-label={edgeDescription}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
      />

      {/* Main rendered edge with dual health encoding & rps scaling */}
      <BaseEdge
        id={id}
        path={edgePath}
        className={cn(
          "cursor-pointer transition-all duration-200",
          rps > 5 ? "traffic-flow-animated" : "",
        )}
        style={{
          stroke: selected ? "var(--accent)" : healthStyle.stroke,
          strokeWidth: selected ? strokeWidth + 1.5 : strokeWidth,
          strokeDasharray: healthStyle.strokeDasharray,
          filter: selected ? "drop-shadow(0 0 6px var(--accent))" : healthStyle.glow,
        }}
      />

      {/* Edge RPS Pill Label with Level 1 Tooltip */}
      {rps > 0 && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${String(labelX)}px,${String(labelY)}px)`,
              pointerEvents: "all",
            }}
            className="nodrag nopan"
          >
            <TooltipProvider delayDuration={250}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    data-edge-id={id}
                    onClick={handleClick}
                    className={cn(
                      "flex items-center rounded-full border bg-[var(--surface-solid)]/90 px-2 py-0.5 font-mono text-[9px] font-semibold backdrop-blur-sm transition-transform hover:scale-110 focus:ring-1 focus:ring-[var(--accent)] focus:outline-none",
                      healthStyle.labelClass,
                      selected &&
                        "border-[var(--accent)] text-[var(--accent)] ring-1 ring-[var(--accent)]",
                    )}
                    aria-label={`${pillText}, ${edgeDescription}`}
                  >
                    <span>{formatNumber(rps)}</span>{" "}
                    <span className="ml-0.5 text-[7px] opacity-75">rps</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  className="flex items-center gap-3 font-mono text-[11px] tabular-nums"
                >
                  <span>
                    <strong className="text-[var(--fg-muted)]">RPS:</strong> {formatRps(rps)}
                  </span>
                  <span>
                    <strong className="text-[var(--fg-muted)]">p99:</strong>{" "}
                    {formatLatencyMs(data?.metrics.p99_ms ?? 0)}
                  </span>
                  <span>
                    <strong className="text-[var(--fg-muted)]">Err:</strong>{" "}
                    {formatPercent(data?.metrics.error_rate ?? 0)}
                  </span>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});
