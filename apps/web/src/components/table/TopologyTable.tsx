"use client";

import * as React from "react";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  HelpCircle,
} from "lucide-react";
import { useFilteredTopology } from "@/store/selectors";
import { useUiStore } from "@/store/ui-store";
import { formatNumber, formatLatencyMs } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Node, HealthStatus } from "@/types/contracts.gen";

export type SortField = "kind" | "label" | "health" | "rps" | "p99_ms" | "error_rate";
export type SortDirection = "asc" | "desc";

export interface TopologyTableProps {
  className?: string | undefined;
  nodes?: Node[] | undefined;
  showToolbar?: boolean | undefined;
}

const healthRank: Record<HealthStatus, number> = {
  critical: 0,
  degraded: 1,
  healthy: 2,
  unknown: 3,
};

const ROW_HEIGHT = 48;
const OVERSCAN = 6;

export const TopologyTable = React.memo(function TopologyTable({
  className,
  nodes: customNodes,
  showToolbar = true,
}: TopologyTableProps) {
  const { nodes: storeNodes, edges: storeEdges } = useFilteredTopology();
  const selectNode = useUiStore((s) => s.selectNode);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);

  // Filter state from store
  const storeSearchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);

  const [sortField, setSortField] = React.useState<SortField>("health");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc");

  // Local search query when showToolbar is true
  const [localSearch, setLocalSearch] = React.useState(storeSearchQuery);

  const activeNodes = customNodes ?? storeNodes;

  // Filter nodes based on local search if toolbar is active
  const filteredNodes = React.useMemo(() => {
    if (!showToolbar || !localSearch.trim()) {
      return activeNodes;
    }
    const q = localSearch.toLowerCase().trim();
    return activeNodes.filter(
      (node) =>
        node.label.toLowerCase().includes(q) ||
        node.id.toLowerCase().includes(q) ||
        node.kind.toLowerCase().includes(q),
    );
  }, [activeNodes, showToolbar, localSearch]);

  // Sort nodes
  const sortedNodes = React.useMemo(() => {
    const list = [...filteredNodes];
    list.sort((a, b) => {
      let diff = 0;
      switch (sortField) {
        case "kind":
          diff = a.kind.localeCompare(b.kind);
          break;
        case "label":
          diff = a.label.localeCompare(b.label);
          break;
        case "health":
          diff = healthRank[a.health] - healthRank[b.health];
          break;
        case "rps":
          diff = a.metrics.rps - b.metrics.rps;
          break;
        case "p99_ms":
          diff = a.metrics.p99_ms - b.metrics.p99_ms;
          break;
        case "error_rate":
          diff = a.metrics.error_rate - b.metrics.error_rate;
          break;
      }
      return sortDirection === "asc" ? diff : -diff;
    });
    return list;
  }, [filteredNodes, sortField, sortDirection]);

  // Virtualization state & container ref
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [containerHeight, setContainerHeight] = React.useState(500);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateDimensions = () => {
      if (el.clientHeight > 0) {
        setContainerHeight(el.clientHeight);
      }
    };
    updateDimensions();

    const resizeObserver = new ResizeObserver(updateDimensions);
    resizeObserver.observe(el);

    const handleScroll = () => {
      setScrollTop(el.scrollTop);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });

    return () => {
      resizeObserver.disconnect();
      el.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const totalCount = sortedNodes.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIndex = Math.min(
    totalCount,
    Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN,
  );

  const visibleRows = sortedNodes.slice(startIndex, endIndex);
  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalCount - endIndex) * ROW_HEIGHT);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />;
    }
    return sortDirection === "asc" ? (
      <ArrowUp className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
    );
  };

  const getAriaSort = (field: SortField): "ascending" | "descending" | "none" => {
    if (sortField !== field) return "none";
    return sortDirection === "asc" ? "ascending" : "descending";
  };

  const renderHealthBadge = (health: HealthStatus) => {
    switch (health) {
      case "healthy":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--ok)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ok)] uppercase">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            Healthy
          </span>
        );
      case "degraded":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--warn)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--warn)] uppercase">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" />
            Degraded
          </span>
        );
      case "critical":
        return (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--crit)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--crit)] uppercase">
            <AlertOctagon className="h-3 w-3" aria-hidden="true" />
            Critical
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--fg-muted)] uppercase">
            <HelpCircle className="h-3 w-3" aria-hidden="true" />
            Unknown
          </span>
        );
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
      data-testid="topology-table-container"
    >
      {/* Optional Top Toolbar with Search and Counters */}
      {showToolbar && (
        <div className="flex flex-col gap-2 border-b border-[var(--border)] p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--fg-muted)]"
                aria-hidden="true"
              />
              <input
                type="text"
                placeholder="Filter table entities…"
                value={localSearch}
                onChange={(e) => {
                  setLocalSearch(e.target.value);
                  setSearchQuery(e.target.value);
                }}
                className="h-8 w-48 rounded-lg border border-[var(--border)] bg-[var(--surface)] pr-3 pl-8 font-mono text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none sm:w-64"
                aria-label="Filter table entities"
              />
            </div>
            <span className="font-mono text-xs text-[var(--fg-muted)] tabular-nums">
              Showing {String(sortedNodes.length)} of {String(activeNodes.length)} entities
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-[var(--fg-muted)]">
              {String(storeEdges.length)} connections
            </span>
          </div>
        </div>
      )}

      {/* Virtualized Scrollable Semantic Table */}
      <div ref={containerRef} className="flex-1 overflow-auto outline-none">
        <table
          className="w-full text-left font-mono text-xs select-none"
          aria-rowcount={sortedNodes.length}
        >
          <caption className="sr-only">
            Fleet entities and topology nodes table with sortable columns and progressive disclosure
            details.
          </caption>
          <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface)] text-[10px] tracking-wider uppercase">
            <tr>
              <th scope="col" aria-sort={getAriaSort("kind")} className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    handleSort("kind");
                  }}
                  className="flex items-center gap-1 rounded p-1 hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                >
                  <span>Type</span>
                  {getSortIcon("kind")}
                </button>
              </th>
              <th scope="col" aria-sort={getAriaSort("label")} className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    handleSort("label");
                  }}
                  className="flex items-center gap-1 rounded p-1 hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                >
                  <span>Label / ID</span>
                  {getSortIcon("label")}
                </button>
              </th>
              <th scope="col" aria-sort={getAriaSort("health")} className="px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => {
                    handleSort("health");
                  }}
                  className="flex items-center gap-1 rounded p-1 hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                >
                  <span>Health</span>
                  {getSortIcon("health")}
                </button>
              </th>
              <th scope="col" aria-sort={getAriaSort("rps")} className="px-4 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => {
                    handleSort("rps");
                  }}
                  className="ml-auto flex items-center gap-1 rounded p-1 hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                >
                  <span>RPS</span>
                  {getSortIcon("rps")}
                </button>
              </th>
              <th scope="col" aria-sort={getAriaSort("p99_ms")} className="px-4 py-2.5 text-right">
                <button
                  type="button"
                  onClick={() => {
                    handleSort("p99_ms");
                  }}
                  className="ml-auto flex items-center gap-1 rounded p-1 hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                >
                  <span>p99 Latency</span>
                  {getSortIcon("p99_ms")}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={getAriaSort("error_rate")}
                className="px-4 py-2.5 text-right"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleSort("error_rate");
                  }}
                  className="ml-auto flex items-center gap-1 rounded p-1 hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                >
                  <span>Sat / Err</span>
                  {getSortIcon("error_rate")}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {sortedNodes.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-xs text-[var(--fg-muted)]">
                  No topology nodes match the current criteria.
                </td>
              </tr>
            ) : (
              <>
                {topSpacerHeight > 0 && (
                  <tr
                    aria-hidden="true"
                    style={{ height: `${String(topSpacerHeight)}px` }}
                    className="border-none"
                  >
                    <td colSpan={6} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
                {visibleRows.map((node, i) => {
                  const actualIndex = startIndex + i;
                  const isSelected = selectedNodeId === node.id;
                  const accessibleRowLabel = `${node.kind} ${node.label}, health ${node.health}, ${formatNumber(node.metrics.rps)} requests per second, p99 ${String(Math.round(node.metrics.p99_ms))} milliseconds`;

                  return (
                    <tr
                      key={node.id}
                      data-node-id={node.id}
                      data-entity-id={node.id}
                      data-testid={`table-row-${node.id}`}
                      tabIndex={0}
                      aria-rowindex={actualIndex + 1}
                      aria-label={accessibleRowLabel}
                      aria-selected={isSelected}
                      onClick={() => {
                        selectNode(node.id);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          selectNode(node.id);
                        }
                      }}
                      className={cn(
                        "h-[48px] cursor-pointer transition-colors hover:bg-[var(--surface)] focus-visible:bg-[var(--surface)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none",
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
                      <td className="px-4 py-2">{renderHealthBadge(node.health)}</td>
                      <td className="px-4 py-2 text-right text-[var(--fg)] tabular-nums">
                        {formatNumber(node.metrics.rps)}
                      </td>
                      <td className="px-4 py-2 text-right text-[var(--fg)] tabular-nums">
                        {formatLatencyMs(node.metrics.p99_ms)}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums">
                        {node.metrics.error_rate > 0 ? (
                          <span className="font-semibold text-[var(--crit)]">
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
                })}
                {bottomSpacerHeight > 0 && (
                  <tr
                    aria-hidden="true"
                    style={{ height: `${String(bottomSpacerHeight)}px` }}
                    className="border-none"
                  >
                    <td colSpan={6} style={{ padding: 0, border: 0 }} />
                  </tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
