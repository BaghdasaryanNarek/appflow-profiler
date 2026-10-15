"use client";

import * as React from "react";

export interface NodeSparklineProps {
  data?: number[] | undefined;
  color?: string | undefined;
  width?: number | undefined;
  height?: number | undefined;
  className?: string | undefined;
}

export const NodeSparkline = React.memo(function NodeSparkline({
  data,
  color = "var(--accent)",
  width = 64,
  height = 20,
  className,
}: NodeSparklineProps) {
  const points = React.useMemo(() => {
    if (!data || data.length === 0) {
      return `0,${String(height / 2)} ${String(width)},${String(height / 2)}`;
    }

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const step = width / Math.max(1, data.length - 1);
    return data
      .map((val, idx) => {
        const x = Math.round(idx * step * 10) / 10;
        const normalized = (val - min) / range;
        // SVG y=0 is top, y=height is bottom
        const y = Math.round((height - 2 - normalized * (height - 4)) * 10) / 10;
        return `${String(x)},${String(y)}`;
      })
      .join(" ");
  }, [data, width, height]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      className={className}
      aria-hidden="true"
    >
      <polyline
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={points}
      />
    </svg>
  );
});
