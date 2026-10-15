"use client";

import * as React from "react";
import type { ConnState } from "@/types/contracts.gen";
import { formatNumber, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AlertCircle, AlertTriangle, ShieldCheck } from "lucide-react";

export interface StateBarProps {
  states: Partial<Record<ConnState, number>> | Record<string, number>;
  totalConnections?: number;
  className?: string;
}

interface StateConfig {
  label: string;
  colorClass: string;
  textClass: string;
  category: "healthy" | "transitional" | "warning" | "critical";
}

const STATE_CONFIG: Record<ConnState, StateConfig> = {
  ESTABLISHED: {
    label: "ESTABLISHED",
    colorClass: "bg-emerald-500",
    textClass: "text-emerald-400",
    category: "healthy",
  },
  LISTEN: {
    label: "LISTEN",
    colorClass: "bg-cyan-500",
    textClass: "text-cyan-400",
    category: "healthy",
  },
  SYN_SENT: {
    label: "SYN_SENT",
    colorClass: "bg-blue-500",
    textClass: "text-blue-400",
    category: "transitional",
  },
  SYN_RECV: {
    label: "SYN_RECV",
    colorClass: "bg-indigo-500",
    textClass: "text-indigo-400",
    category: "transitional",
  },
  FIN_WAIT1: {
    label: "FIN_WAIT1",
    colorClass: "bg-orange-400",
    textClass: "text-orange-400",
    category: "transitional",
  },
  FIN_WAIT2: {
    label: "FIN_WAIT2",
    colorClass: "bg-orange-500",
    textClass: "text-orange-400",
    category: "transitional",
  },
  TIME_WAIT: {
    label: "TIME_WAIT",
    colorClass: "bg-amber-500",
    textClass: "text-amber-400",
    category: "warning",
  },
  CLOSE_WAIT: {
    label: "CLOSE_WAIT",
    colorClass: "bg-rose-500",
    textClass: "text-rose-400",
    category: "critical",
  },
  LAST_ACK: {
    label: "LAST_ACK",
    colorClass: "bg-red-400",
    textClass: "text-red-400",
    category: "transitional",
  },
  CLOSING: {
    label: "CLOSING",
    colorClass: "bg-purple-500",
    textClass: "text-purple-400",
    category: "transitional",
  },
  CLOSE: {
    label: "CLOSE",
    colorClass: "bg-zinc-500",
    textClass: "text-zinc-400",
    category: "transitional",
  },
  NONE: {
    label: "NONE",
    colorClass: "bg-zinc-600",
    textClass: "text-zinc-400",
    category: "transitional",
  },
};

export const StateBar = React.memo(function StateBar({
  states,
  totalConnections,
  className,
}: StateBarProps) {
  // Aggregate state counts
  const { segments, totalCount, hasCloseWaitLeak, isTimeWaitElevated } = React.useMemo(() => {
    let computedTotal = 0;
    const entries: Array<{ state: ConnState; count: number; config: StateConfig }> = [];

    for (const [key, rawCount] of Object.entries(states)) {
      const count = typeof rawCount === "number" && rawCount > 0 ? rawCount : 0;
      if (count > 0 && key in STATE_CONFIG) {
        const stateKey = key as ConnState;
        const config = STATE_CONFIG[stateKey];
        entries.push({ state: stateKey, count, config });
        computedTotal += count;
      }
    }

    const actualTotal =
      totalConnections !== undefined && totalConnections > 0 ? totalConnections : computedTotal;

    // Order: ESTABLISHED first, then LISTEN, then transitions, then TIME_WAIT, CLOSE_WAIT
    const ordered = entries.sort((a, b) => {
      if (a.state === "ESTABLISHED") return -1;
      if (b.state === "ESTABLISHED") return 1;
      if (a.state === "CLOSE_WAIT") return 1;
      if (b.state === "CLOSE_WAIT") return -1;
      return b.count - a.count;
    });

    const segmentsWithPct = ordered.map((entry) => ({
      ...entry,
      percentage: actualTotal > 0 ? entry.count / actualTotal : 0,
    }));

    const closeWaitEntry = entries.find((e) => e.state === "CLOSE_WAIT");
    const closeWaitCount = closeWaitEntry ? closeWaitEntry.count : 0;
    const closeWaitLeak = closeWaitCount > 0;

    const timeWaitEntry = entries.find((e) => e.state === "TIME_WAIT");
    const timeWaitCount = timeWaitEntry ? timeWaitEntry.count : 0;
    const timeWaitElevated =
      actualTotal > 0 && (timeWaitCount / actualTotal > 0.3 || timeWaitCount > 100);

    return {
      segments: segmentsWithPct,
      totalCount: actualTotal,
      hasCloseWaitLeak: closeWaitLeak,
      isTimeWaitElevated: timeWaitElevated,
    };
  }, [states, totalConnections]);

  if (totalCount === 0 || segments.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-[var(--fg-muted)]",
          className,
        )}
        role="group"
        aria-label="TCP Connection States: No active connections"
      >
        <div className="flex items-center gap-1.5 text-[var(--fg-subtle)]">
          <ShieldCheck className="h-4 w-4 text-[var(--ok)]" aria-hidden="true" />
          <span>No active TCP connections tracked.</span>
        </div>
        <div className="h-2 w-full rounded-full bg-[var(--surface-raised)]" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-2.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs",
        className,
      )}
      role="group"
      aria-label={`TCP Connection States distribution, total ${formatNumber(totalCount)} connections`}
    >
      <div className="flex items-center justify-between">
        <span className="font-medium text-[var(--fg-muted)]">TCP Connection States</span>
        <span className="text-[11px] font-semibold text-[var(--fg)] tabular-nums">
          {formatNumber(totalCount)} total
        </span>
      </div>

      {/* Stacked Proportional Bar */}
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-raised)]"
        aria-hidden="true"
      >
        {segments.map((seg) => {
          const widthPct = `${(seg.percentage * 100).toFixed(1)}%`;
          return (
            <div
              key={seg.state}
              style={{ width: widthPct }}
              className={cn("h-full transition-all duration-300", seg.config.colorClass)}
              title={`${seg.state}: ${formatNumber(seg.count)} (${formatPercent(seg.percentage)})`}
            />
          );
        })}
      </div>

      {/* Anomaly Callouts (§3.5: Never color alone) */}
      {(hasCloseWaitLeak || isTimeWaitElevated) && (
        <div className="flex flex-col gap-1.5 pt-1">
          {hasCloseWaitLeak && (
            <div
              className="flex items-center gap-1.5 rounded-xs border border-rose-500/30 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-400"
              role="alert"
            >
              <AlertCircle className="h-3.5 w-3.5 shrink-0 text-rose-500" aria-hidden="true" />
              <span>
                <strong>CLOSE_WAIT alert:</strong> {formatNumber(states.CLOSE_WAIT ?? 0)} socket(s)
                waiting on local application close (leak risk).
              </span>
            </div>
          )}
          {isTimeWaitElevated && (
            <div
              className="flex items-center gap-1.5 rounded-xs border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-amber-400"
              role="status"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
              <span>
                <strong>Elevated TIME_WAIT:</strong> {formatNumber(states.TIME_WAIT ?? 0)} sockets
                in teardown (elevated socket churn).
              </span>
            </div>
          )}
        </div>
      )}

      {/* Tabular Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-1 text-[11px] text-[var(--fg-subtle)] sm:grid-cols-3">
        {segments.map((seg) => (
          <div key={seg.state} className="flex items-center justify-between gap-1.5">
            <div className="flex items-center gap-1.5 truncate">
              <span
                className={cn("h-2 w-2 shrink-0 rounded-full", seg.config.colorClass)}
                aria-hidden="true"
              />
              <span className="truncate">{seg.config.label}</span>
            </div>
            <span className="font-mono text-[var(--fg)] tabular-nums">
              {formatNumber(seg.count)}{" "}
              <span className="text-[10px] text-[var(--fg-subtle)]">
                ({formatPercent(seg.percentage)})
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
});
