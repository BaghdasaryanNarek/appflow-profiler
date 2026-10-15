"use client";

import * as React from "react";
import { useFilteredTopology } from "@/store/selectors";
import { useUiStore } from "@/store/ui-store";
import { formatNumber, formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Node } from "@/types/contracts.gen";

export interface TopologyTableViewProps {
  className?: string | undefined;
}

export const TopologyTableView = React.memo(function TopologyTableView({
  className,
}: TopologyTableViewProps) {
  const { nodes, edges } = useFilteredTopology();
  const selectNode = useUiStore((s) => s.selectNode);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);

  const handleRowClick = (node: Node) => {
    selectNode(node.id);
  };

  const handleRowKeyDown = (e: React.KeyboardEvent, node: Node) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectNode(node.id);
    }
  };

  return (
    <div
      className={cn(
        "glass-surface flex h-full w-full flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-solid)]",
        className,
      )}
      role="region"
      aria-label="Semantic Topology Table Presentation"
    >
      <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--fg)]">
            Topology Fleet Table ({nodes.length} nodes, {edges.length} edges)
          </h3>
          <p className="text-xs text-[var(--fg-muted)]">
            Semantic tabular view for keyboard navigation and screen readers. Press T to toggle
            canvas.
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left font-mono text-xs select-none">
          <thead className="sticky top-0 border-b border-[var(--border)] bg-[var(--surface)] text-[10px] tracking-wider text-[var(--fg-muted)] uppercase">
            <tr>
              <th scope="col" className="px-4 py-2.5">
                Type
              </th>
              <th scope="col" className="px-4 py-2.5">
                Label / ID
              </th>
              <th scope="col" className="px-4 py-2.5">
                Health
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                RPS
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                p99 Latency
              </th>
              <th scope="col" className="px-4 py-2.5 text-right">
                Sat / Err
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {nodes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-xs text-[var(--fg-muted)]">
                  No topology nodes match active filters.
                </td>
              </tr>
            ) : (
              nodes.map((node) => {
                const isSelected = selectedNodeId === node.id;
                return (
                  <tr
                    key={node.id}
                    tabIndex={0}
                    role="button"
                    aria-label={`${node.kind} ${node.label}, health ${node.health}, ${formatNumber(node.metrics.rps)} requests per second`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      handleRowClick(node);
                    }}
                    onKeyDown={(e) => {
                      handleRowKeyDown(e, node);
                    }}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none",
                      isSelected && "border-l-2 border-l-[var(--accent)] bg-[var(--accent)]/10",
                    )}
                  >
                    <td className="px-4 py-2 text-[10px] text-[var(--fg-muted)] uppercase">
                      {node.kind}
                    </td>
                    <td className="px-4 py-2 font-semibold text-[var(--fg)]">
                      <div className="flex flex-col">
                        <span>{node.label}</span>
                        <span className="text-[10px] text-[var(--fg-muted)]">{node.id}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={cn(
                          "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                          node.health === "healthy"
                            ? "bg-[var(--ok)]/15 text-[var(--ok)]"
                            : node.health === "degraded"
                              ? "bg-[var(--warn)]/15 text-[var(--warn)]"
                              : "bg-[var(--crit)]/15 text-[var(--crit)]",
                        )}
                      >
                        {node.health}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-[var(--fg)] tabular-nums">
                      {formatNumber(node.metrics.rps)}
                    </td>
                    <td className="px-4 py-2 text-right text-[var(--fg)] tabular-nums">
                      {formatDuration(node.metrics.p99_ms)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {node.metrics.error_rate > 0 ? (
                        <span className="text-[var(--crit)]">
                          {(node.metrics.error_rate * 100).toFixed(1)}% err
                        </span>
                      ) : (
                        <span className="text-[var(--fg-muted)]">
                          {(node.metrics.saturation * 100).toFixed(0)}% sat
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
