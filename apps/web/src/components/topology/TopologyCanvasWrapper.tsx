"use client";

import * as React from "react";
import dynamic from "next/dynamic";

const DynamicTopologyCanvas = dynamic(
  () => import("./TopologyCanvas").then((m) => m.TopologyCanvas),
  {
    ssr: false,
    loading: () => (
      <div
        className="glass-surface relative flex h-full w-full items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-solid)]"
        data-testid="topology-canvas-loading"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
          <span className="font-mono text-xs text-[var(--fg-muted)]">Loading Topology Canvas…</span>
        </div>
      </div>
    ),
  },
);

export function TopologyCanvasWrapper() {
  return <DynamicTopologyCanvas />;
}
