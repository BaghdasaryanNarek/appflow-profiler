"use client";

import * as React from "react";
import type { HealthStatus } from "@/types/contracts.gen";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface SparklineProps {
  data: readonly number[];
  label: string;
  unit?: string | undefined;
  formatValue?: ((value: number) => string) | undefined;
  status?: HealthStatus | undefined;
  threshold?: number | undefined;
  height?: number | undefined;
  className?: string | undefined;
}

const STATUS_COLOR_MAP: Record<
  HealthStatus,
  { stroke: string; stopStart: string; stopEnd: string }
> = {
  healthy: {
    stroke: "var(--ok, #22c55e)",
    stopStart: "rgba(34, 197, 94, 0.28)",
    stopEnd: "rgba(34, 197, 94, 0.0)",
  },
  degraded: {
    stroke: "var(--warn, #eab308)",
    stopStart: "rgba(234, 179, 8, 0.28)",
    stopEnd: "rgba(234, 179, 8, 0.0)",
  },
  critical: {
    stroke: "var(--crit, #ef4444)",
    stopStart: "rgba(239, 68, 68, 0.28)",
    stopEnd: "rgba(239, 68, 68, 0.0)",
  },
  unknown: {
    stroke: "var(--fg-muted, #71717a)",
    stopStart: "rgba(113, 113, 122, 0.28)",
    stopEnd: "rgba(113, 113, 122, 0.0)",
  },
};

const DEFAULT_COLOR = {
  stroke: "var(--accent, #06b6d4)",
  stopStart: "rgba(6, 182, 212, 0.28)",
  stopEnd: "rgba(6, 182, 212, 0.0)",
};

export const Sparkline = React.memo(function Sparkline({
  data,
  label,
  unit = "",
  formatValue,
  status,
  threshold,
  height = 56,
  className,
}: SparklineProps) {
  const gradientId = React.useId();
  const width = 280;
  const paddingY = 4;

  const defaultFormatter = React.useCallback(
    (v: number) => (unit ? `${formatNumber(v)} ${unit}` : formatNumber(v)),
    [unit],
  );
  const formatter = formatValue ?? defaultFormatter;

  // Calculate statistics
  const stats = React.useMemo(() => {
    if (data.length === 0) {
      return null;
    }
    let min = data[0] ?? 0;
    let max = data[0] ?? 0;
    let sum = 0;
    for (const val of data) {
      if (val < min) min = val;
      if (val > max) max = val;
      sum += val;
    }
    const avg = sum / data.length;
    const latest = data[data.length - 1] ?? 0;
    return { min, max, avg, latest };
  }, [data]);

  // Compute SVG coordinates
  const { linePath, areaPath, thresholdY } = React.useMemo(() => {
    if (data.length === 0) {
      const midY = height / 2;
      return {
        linePath: `M 0,${String(midY)} L ${String(width)},${String(midY)}`,
        areaPath: `M 0,${String(midY)} L ${String(width)},${String(midY)} L ${String(width)},${String(height)} L 0,${String(height)} Z`,
        thresholdY: null,
      };
    }

    let effectiveMin = stats?.min ?? 0;
    let effectiveMax = stats?.max ?? 0;
    if (threshold !== undefined && Number.isFinite(threshold)) {
      effectiveMin = Math.min(effectiveMin, threshold);
      effectiveMax = Math.max(effectiveMax, threshold);
    }
    const range = effectiveMax - effectiveMin || 1;
    const effectiveHeight = height - paddingY * 2;

    const getY = (val: number) => {
      const normalized = (val - effectiveMin) / range;
      return Math.round((height - paddingY - normalized * effectiveHeight) * 10) / 10;
    };

    if (data.length === 1) {
      const singleY = getY(data[0] ?? 0);
      return {
        linePath: `M 0,${String(singleY)} L ${String(width)},${String(singleY)}`,
        areaPath: `M 0,${String(singleY)} L ${String(width)},${String(singleY)} L ${String(width)},${String(height)} L 0,${String(height)} Z`,
        thresholdY: threshold !== undefined && Number.isFinite(threshold) ? getY(threshold) : null,
      };
    }

    const step = width / (data.length - 1);
    const points: Array<[number, number]> = data.map((val, idx) => {
      const x = Math.round(idx * step * 10) / 10;
      const y = getY(val);
      return [x, y];
    });

    const firstPoint = points[0] ?? [0, height / 2];
    const lastPoint = points[points.length - 1] ?? [width, height / 2];

    const line = points
      .map(([x, y], idx) => `${idx === 0 ? "M" : "L"} ${String(x)},${String(y)}`)
      .join(" ");

    const area = `${line} L ${String(lastPoint[0])},${String(height)} L ${String(firstPoint[0])},${String(height)} Z`;

    const threshY = threshold !== undefined && Number.isFinite(threshold) ? getY(threshold) : null;

    return { linePath: line, areaPath: area, thresholdY: threshY };
  }, [data, stats, threshold, height]);

  const colors = status ? STATUS_COLOR_MAP[status] : DEFAULT_COLOR;

  const summaryText = stats
    ? `${label} sparkline, ${String(data.length)} samples, latest ${formatter(stats.latest)}, min ${formatter(stats.min)}, max ${formatter(stats.max)}, avg ${formatter(stats.avg)}`
    : `${label} sparkline, no data points available`;

  return (
    <div
      className={cn(
        "flex flex-col rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-xs transition-colors",
        className,
      )}
    >
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-[var(--fg-muted)]">{label}</span>
        <div className="flex items-center gap-1.5">
          {threshold !== undefined && Number.isFinite(threshold) && (
            <span className="rounded-xs bg-[var(--surface-raised)] px-1 py-0.5 text-[10px] text-[var(--fg-subtle)] tabular-nums">
              limit {formatter(threshold)}
            </span>
          )}
          <span className="font-semibold text-[var(--fg)] tabular-nums">
            {stats ? formatter(stats.latest) : "—"}
          </span>
        </div>
      </div>

      <div className="my-1.5 w-full">
        <svg
          viewBox={`0 0 ${String(width)} ${String(height)}`}
          className="h-full w-full overflow-visible"
          role="img"
          aria-label={summaryText}
        >
          <title>{summaryText}</title>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={colors.stopStart} />
              <stop offset="100%" stopColor={colors.stopEnd} />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill={`url(#${gradientId})`} />

          {/* Threshold reference line */}
          {thresholdY !== null && (
            <line
              x1="0"
              y1={thresholdY}
              x2={width}
              y2={thresholdY}
              stroke="var(--crit, #ef4444)"
              strokeWidth="1"
              strokeDasharray="3 3"
              opacity="0.7"
            />
          )}

          {/* Main polyline */}
          <path
            d={linePath}
            fill="none"
            stroke={colors.stroke}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <div className="flex items-center justify-between text-[10px] text-[var(--fg-subtle)] tabular-nums">
        <span>min: {stats ? formatter(stats.min) : "—"}</span>
        <span>avg: {stats ? formatter(stats.avg) : "—"}</span>
        <span>max: {stats ? formatter(stats.max) : "—"}</span>
      </div>
    </div>
  );
});
