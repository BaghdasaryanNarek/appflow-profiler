"use client";

import * as React from "react";
import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { Boxes, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { useUiStore } from "@/store/ui-store";
import type { GroupNodeData } from "./types";

export type GroupNodeProps = NodeProps<Node<GroupNodeData, "group">>;

export const GroupNode = React.memo(function GroupNode({ id, data, selected }: GroupNodeProps) {
  const selectNode = useUiStore((s) => s.selectNode);
  const lodCollapsed = useUiStore((s) => s.lodCollapsed);
  const setLodCollapsed = useUiStore((s) => s.setLodCollapsed);

  const memberCount = data.memberCount ?? 1;
  const isCollapsed = data.isCollapsed ?? (lodCollapsed === true || lodCollapsed === "auto");

  const toggleExpand = React.useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setLodCollapsed(!isCollapsed);
    },
    [isCollapsed, setLodCollapsed],
  );

  return (
    <div
      data-testid={`group-node-${id}`}
      data-node-id={id}
      aria-label={`Service Group ${data.label}, ${String(memberCount)} services, ${data.health} health`}
      className={cn(
        "glass-surface relative flex min-w-[280px] flex-col rounded-xl border border-[var(--border-strong)] bg-[var(--surface-solid)]/70 p-3 shadow-lg transition-all duration-150 select-none",
        selected && "border-[var(--accent)] ring-2 ring-[var(--accent)]/50",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--bg)] !bg-[var(--fg-muted)]"
      />

      <div className="flex items-center justify-between border-b border-[var(--border)] pb-2">
        <button
          type="button"
          onClick={() => {
            selectNode(id);
          }}
          className="flex items-center gap-2 overflow-hidden text-left hover:opacity-80 focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          aria-label={`Select Service Group ${data.label}`}
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-[var(--accent)]/15 text-[var(--accent)]">
            <Boxes className="h-4 w-4" />
          </div>
          <span className="truncate font-mono text-xs font-bold text-[var(--fg)]">
            {data.label}
          </span>
        </button>

        <button
          type="button"
          onClick={toggleExpand}
          className="flex items-center gap-1 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          aria-label={isCollapsed ? "Expand service group" : "Collapse service group"}
        >
          <span>{memberCount} nodes</span>
          {isCollapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between font-mono text-[11px] text-[var(--fg-muted)]">
        <span>Total RPS: {formatNumber(data.metrics.rps)}</span>
        <span
          className={cn(
            "py-0.2 rounded px-1.5 text-[9px] font-semibold uppercase",
            data.health === "healthy"
              ? "bg-[var(--ok)]/15 text-[var(--ok)]"
              : data.health === "degraded"
                ? "bg-[var(--warn)]/15 text-[var(--warn)]"
                : "bg-[var(--crit)]/15 text-[var(--crit)]",
          )}
        >
          {data.health}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-2 !border-[var(--bg)] !bg-[var(--fg-muted)]"
      />
    </div>
  );
});
