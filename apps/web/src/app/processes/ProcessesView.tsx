"use client";

import * as React from "react";
import { useTopologyStream } from "@/lib/realtime";
import { TopologyTable } from "@/components/table";
import { TopologyLiveStrip } from "@/components/topology/TopologyLiveStrip";
import { NodeDetailSheet } from "@/components/details/NodeDetailSheet";

export function ProcessesView() {
  useTopologyStream();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
          Process & Service Table
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Accessible, virtualized table view of operating system processes, fleet services, and
          active network connections.
        </p>
      </div>

      {/* Real-time Stream Status & Metrics */}
      <TopologyLiveStrip />

      {/* Canonical Virtualized Table Container */}
      <div
        className="glass-surface h-[calc(100dvh-14rem)] min-h-[500px] w-full overflow-hidden rounded-xl border border-[var(--border)]"
        data-testid="processes-table-container"
      >
        <TopologyTable showToolbar={true} />
      </div>

      {/* Progressive Disclosure Detail Sheet (§3.3) */}
      <NodeDetailSheet />
    </div>
  );
}
