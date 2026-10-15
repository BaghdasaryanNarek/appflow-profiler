"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import type {
  Edge,
  EdgeDetail,
  HealthStatus,
  MetricQuality,
  NeighbourRef,
  Node,
  NodeDetail,
  ProcessInfo,
} from "@/types/contracts.gen";
import { fetchEdgeDetail, fetchNodeDetail } from "@/lib/api/client";
import { formatBytes, formatLatencyMs, formatNumber, formatPercent, formatRps } from "@/lib/format";
import { startViewTransition } from "@/lib/view-transition";
import { cn } from "@/lib/utils";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sparkline } from "./Sparkline";
import { StateBar } from "./StateBar";
import { SocketTable } from "./SocketTable";

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  GripVertical,
  Server,
  Sparkles,
} from "lucide-react";

const MIN_SHEET_WIDTH = 380;
const MAX_SHEET_WIDTH = 760;
const DEFAULT_SHEET_WIDTH = 500;

export function NodeDetailSheet() {
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectedEdgeId = useUiStore((s) => s.selectedEdgeId);
  const isOpen = useUiStore((s) => s.detailSheetOpen);
  const setDetailSheetOpen = useUiStore((s) => s.setDetailSheetOpen);
  const selectNode = useUiStore((s) => s.selectNode);

  // Store subscriptions for real-time live data
  const liveNode = useTopologyStore((s) => (selectedNodeId ? s.nodes.get(selectedNodeId) : null));
  const liveEdge = useTopologyStore((s) => (selectedEdgeId ? s.edges.get(selectedEdgeId) : null));
  const liveNodeHistory = useTopologyStore((s) =>
    selectedNodeId ? s.nodeHistory.get(selectedNodeId) : null,
  );
  const liveEdgeHistory = useTopologyStore((s) =>
    selectedEdgeId ? s.edgeHistory.get(selectedEdgeId) : null,
  );

  // REST details state
  const [nodeDetail, setNodeDetail] = React.useState<NodeDetail | null>(null);
  const [edgeDetail, setEdgeDetail] = React.useState<EdgeDetail | null>(null);
  const [isLoadingDetail, setIsLoadingDetail] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("overview");

  // Sheet resize state
  const [sheetWidth, setSheetWidth] = React.useState(DEFAULT_SHEET_WIDTH);
  const isDraggingRef = React.useRef(false);
  const startXRef = React.useRef(0);
  const startWidthRef = React.useRef(DEFAULT_SHEET_WIDTH);

  // Focus restoration targets
  const lastSelectedNodeIdRef = React.useRef<string | null>(null);
  const lastSelectedEdgeIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (selectedNodeId) lastSelectedNodeIdRef.current = selectedNodeId;
    if (selectedEdgeId) lastSelectedEdgeIdRef.current = selectedEdgeId;
  }, [selectedNodeId, selectedEdgeId]);

  // Fetch REST NodeDetail or EdgeDetail with AbortController
  React.useEffect(() => {
    if (!isOpen) {
      setNodeDetail(null);
      setEdgeDetail(null);
      return;
    }

    const controller = new AbortController();
    setIsLoadingDetail(true);

    if (selectedNodeId) {
      setEdgeDetail(null);
      fetchNodeDetail(selectedNodeId, { signal: controller.signal })
        .then((detail) => {
          setNodeDetail(detail);
          setIsLoadingDetail(false);
        })
        .catch((_err: unknown) => {
          if (!controller.signal.aborted) {
            setIsLoadingDetail(false);
          }
        });
    } else if (selectedEdgeId) {
      setNodeDetail(null);
      fetchEdgeDetail(selectedEdgeId, { signal: controller.signal })
        .then((detail) => {
          setEdgeDetail(detail);
          setIsLoadingDetail(false);
        })
        .catch((_err: unknown) => {
          if (!controller.signal.aborted) {
            setIsLoadingDetail(false);
          }
        });
    } else {
      setIsLoadingDetail(false);
    }

    return () => {
      controller.abort();
    };
  }, [isOpen, selectedNodeId, selectedEdgeId]);

  // Resize Drag Handlers with guaranteed listener cleanup
  const handlePointerDown = React.useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      isDraggingRef.current = true;
      startXRef.current = e.clientX;
      startWidthRef.current = sheetWidth;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!isDraggingRef.current) return;
        // Moving left (smaller clientX) increases width
        const deltaX = startXRef.current - moveEvent.clientX;
        const nextWidth = Math.min(
          MAX_SHEET_WIDTH,
          Math.max(MIN_SHEET_WIDTH, startWidthRef.current + deltaX),
        );
        setSheetWidth(nextWidth);
      };

      const handlePointerUp = () => {
        isDraggingRef.current = false;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [sheetWidth],
  );

  // Keyboard resizing for accessibility
  const handleKeyDownResize = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setSheetWidth((w) => Math.min(MAX_SHEET_WIDTH, w + 24));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setSheetWidth((w) => Math.max(MIN_SHEET_WIDTH, w - 24));
    } else if (e.key === "Home") {
      e.preventDefault();
      setSheetWidth(MIN_SHEET_WIDTH);
    } else if (e.key === "End") {
      e.preventDefault();
      setSheetWidth(MAX_SHEET_WIDTH);
    }
  };

  // Deterministic focus restoration when closing sheet
  const handleCloseAutoFocus = (e: Event) => {
    e.preventDefault();
    const targetNodeId = lastSelectedNodeIdRef.current;
    const targetEdgeId = lastSelectedEdgeIdRef.current;

    if (targetNodeId) {
      const el =
        document.querySelector<HTMLElement>(`[data-node-id="${targetNodeId}"]`) ??
        document.querySelector<HTMLElement>(
          `.react-flow__node[data-id="${targetNodeId}"] button`,
        ) ??
        document.querySelector<HTMLElement>(`.react-flow__node[data-id="${targetNodeId}"]`) ??
        document.querySelector<HTMLElement>(`[data-entity-id="${targetNodeId}"]`);
      el?.focus();
    } else if (targetEdgeId) {
      const el =
        document.querySelector<HTMLElement>(`[data-edge-id="${targetEdgeId}"]`) ??
        document.querySelector<HTMLElement>(`[data-entity-id="${targetEdgeId}"]`);
      el?.focus();
    }
  };

  // Navigate to advisor view with View Transition
  const handleAskAdvisor = (nodeId: string) => {
    void startViewTransition(() => {
      router.push(`/insights?node=${encodeURIComponent(nodeId)}`);
    });
  };

  // Merge live node data with REST detail node
  const activeNode: Node | null = liveNode ?? nodeDetail?.node ?? null;
  const activeEdge: Edge | null = liveEdge ?? edgeDetail?.edge ?? null;

  if (!isOpen || (!activeNode && !activeEdge)) {
    return null;
  }

  return (
    <Sheet open={isOpen} onOpenChange={setDetailSheetOpen}>
      <SheetContent
        side="right"
        data-testid="node-detail-sheet"
        onCloseAutoFocus={handleCloseAutoFocus}
        style={{ width: `${String(sheetWidth)}px`, maxWidth: "100vw" }}
        className="flex flex-col overflow-hidden border-l border-[var(--border)] bg-[var(--surface-solid)] p-0 shadow-2xl"
      >
        {/* Resize Handle (Inline-start border) */}
        <div
          role="slider"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize detail sheet width"
          aria-valuenow={sheetWidth}
          aria-valuemin={MIN_SHEET_WIDTH}
          aria-valuemax={MAX_SHEET_WIDTH}
          onPointerDown={handlePointerDown}
          onKeyDown={handleKeyDownResize}
          className="group absolute top-0 bottom-0 left-0 z-50 flex w-2.5 -translate-x-1 cursor-col-resize items-center justify-center transition-colors hover:bg-[var(--accent)]/20 focus:bg-[var(--accent)]/30 focus:outline-none"
        >
          <GripVertical
            className="h-4 w-4 text-[var(--fg-subtle)] opacity-40 transition-opacity group-hover:opacity-100 group-focus:opacity-100"
            aria-hidden="true"
          />
        </div>

        {/* Sheet Content Container with CSS Container Queries (@container) and Motion spring */}
        <motion.div
          initial={prefersReducedMotion ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={
            prefersReducedMotion ? { duration: 0 } : { type: "spring", stiffness: 400, damping: 40 }
          }
          className="@container flex flex-1 flex-col overflow-hidden"
        >
          {activeNode && (
            <NodeDetailView
              node={activeNode}
              detail={nodeDetail}
              history={liveNodeHistory}
              isLoadingDetail={isLoadingDetail}
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onSelectNeighbour={(id) => {
                selectNode(id);
                setActiveTab("overview");
              }}
              onAskAdvisor={handleAskAdvisor}
            />
          )}

          {activeEdge && !activeNode && (
            <EdgeDetailView
              edge={activeEdge}
              detail={edgeDetail}
              history={liveEdgeHistory}
              onSelectNode={selectNode}
            />
          )}
        </motion.div>
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Node Detail Presentation View
// ---------------------------------------------------------------------------
interface NodeDetailViewProps {
  node: Node;
  detail: NodeDetail | null;
  history: ReturnType<typeof useTopologyStore.getState>["nodeHistory"] extends Map<string, infer H>
    ? H | null | undefined
    : never;
  isLoadingDetail: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onSelectNeighbour: (id: string) => void;
  onAskAdvisor: (nodeId: string) => void;
}

function NodeDetailView({
  node,
  detail,
  history,
  isLoadingDetail,
  activeTab,
  onTabChange,
  onSelectNeighbour,
  onAskAdvisor,
}: NodeDetailViewProps) {
  const quality = node.metrics.quality;
  const reasons = node.health_reasons ?? [];

  // Sparkline data series from live ring buffers or REST history
  const rpsSeries = history?.rps.toArray() ?? detail?.history?.rps ?? [node.metrics.rps];
  const p99Series = history?.p99_ms.toArray() ?? detail?.history?.p99_ms ?? [node.metrics.p99_ms];
  const errorSeries = history?.error_rate.toArray() ??
    detail?.history?.error_rate ?? [node.metrics.error_rate];
  const saturationSeries = history?.saturation.toArray() ??
    detail?.history?.saturation ?? [node.metrics.saturation];

  // Up/down neighbours from REST detail
  const upNeighbours = detail?.neighbours?.up ?? [];
  const downNeighbours = detail?.neighbours?.down ?? [];

  // TCP states calculated from sockets if available
  const socketStates = React.useMemo(() => {
    if (!detail?.sockets || detail.sockets.length === 0) {
      return {};
    }
    const counts: Record<string, number> = {};
    for (const s of detail.sockets) {
      counts[s.state] = (counts[s.state] ?? 0) + 1;
    }
    return counts;
  }, [detail?.sockets]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <SheetHeader className="border-b border-[var(--border)] px-6 py-4 text-left">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] tracking-wider uppercase">
            {node.kind}
          </Badge>
          <MetricQualityBadge quality={quality} />
        </div>
        <SheetTitle className="truncate text-xl font-bold tracking-tight text-[var(--fg)]">
          {node.label}
        </SheetTitle>
        <SheetDescription className="truncate font-mono text-xs text-[var(--fg-subtle)]">
          {node.id}
        </SheetDescription>
      </SheetHeader>

      {/* Tabs Controller */}
      <Tabs
        value={activeTab}
        onValueChange={onTabChange}
        className="flex flex-1 flex-col overflow-hidden"
      >
        <div className="border-b border-[var(--border)] bg-[var(--surface-raised)]/30 px-6 py-2">
          <TabsList className="grid w-full grid-cols-4 bg-[var(--surface-raised)]">
            <TabsTrigger value="overview" className="text-xs">
              Overview
            </TabsTrigger>
            <TabsTrigger value="process" className="text-xs">
              Process
            </TabsTrigger>
            <TabsTrigger value="sockets" className="text-xs">
              Sockets
            </TabsTrigger>
            <TabsTrigger value="neighbours" className="text-xs">
              Neighbours
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Overview */}
        <TabsContent
          value="overview"
          className="flex-1 space-y-4 overflow-y-auto px-6 py-4 focus:outline-none"
        >
          {/* Health Explanation Banner */}
          <HealthBanner health={node.health} reasons={reasons} />

          {/* Sparkline Cards Grid: Responsive with Container Queries */}
          <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
            <Sparkline
              label="Throughput"
              unit="rps"
              data={rpsSeries}
              status={node.health}
              formatValue={formatRps}
            />
            <div className="flex flex-col gap-1">
              <Sparkline
                label="Tail Latency (p99)"
                unit="ms"
                data={p99Series}
                status={node.health}
                formatValue={formatLatencyMs}
              />
              <div className="flex items-center justify-between px-1 text-[11px] text-[var(--fg-subtle)]">
                <span>Median (p50):</span>
                <span className="font-semibold text-[var(--fg)] tabular-nums">
                  {formatLatencyMs(node.metrics.p50_ms)}
                </span>
              </div>
            </div>
            <Sparkline
              label="Error Rate"
              unit="%"
              data={errorSeries}
              status={node.metrics.error_rate > 0.05 ? "critical" : undefined}
              formatValue={formatPercent}
            />
            <Sparkline
              label="Saturation"
              unit="%"
              data={saturationSeries}
              status={node.metrics.saturation > 0.9 ? "critical" : undefined}
              formatValue={formatPercent}
            />
          </div>

          {/* Level 3: Ask Advisor Entry Point */}
          <div className="flex items-center justify-between gap-3 rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/10 p-3.5">
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-5 w-5 shrink-0 text-[var(--accent)]" aria-hidden="true" />
              <div>
                <p className="text-xs font-semibold text-[var(--fg)]">AI Optimization Advisor</p>
                <p className="text-[11px] text-[var(--fg-subtle)]">
                  Analyze topology bottlenecks and get actionable recommendations.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="default"
              onClick={() => {
                onAskAdvisor(node.id);
              }}
              className="shrink-0 bg-[var(--accent)] text-xs font-medium text-[var(--accent-fg)] hover:opacity-90"
            >
              Ask Advisor
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>
        </TabsContent>

        {/* Tab 2: Process */}
        <TabsContent
          value="process"
          className="flex-1 space-y-4 overflow-y-auto px-6 py-4 focus:outline-none"
        >
          {node.process ? (
            <ProcessDetailView process={node.process} metrics={node.metrics} />
          ) : (
            <div className="space-y-3 rounded-md border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
              <div className="flex items-center gap-2 text-[var(--fg-muted)]">
                <Server className="h-4 w-4" />
                <span className="font-semibold text-[var(--fg)]">
                  Aggregated Cluster / Service Node
                </span>
              </div>
              <p className="leading-relaxed text-[var(--fg-subtle)]">
                This entity represents a logical service tier, managed cluster, or external host
                without direct single-process OS bindings.
              </p>
              <div className="grid grid-cols-2 gap-2 border-t border-[var(--border)] pt-2 text-[11px]">
                <div>
                  <span className="text-[var(--fg-subtle)]">Group ID: </span>
                  <span className="font-mono text-[var(--fg)]">{node.group_id ?? "None"}</span>
                </div>
                <div>
                  <span className="text-[var(--fg-subtle)]">Open Connections: </span>
                  <span className="font-mono text-[var(--fg)]">
                    {formatNumber(node.metrics.open_connections)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* Tab 3: Sockets */}
        <TabsContent
          value="sockets"
          className="flex-1 space-y-4 overflow-y-auto px-6 py-4 focus:outline-none"
        >
          <StateBar states={socketStates} totalConnections={node.metrics.open_connections} />
          {isLoadingDetail && !detail ? (
            <div className="space-y-2">
              <Skeleton className="h-8 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <SocketTable sockets={detail?.sockets ?? []} maxHeight={340} />
          )}
        </TabsContent>

        {/* Tab 4: Neighbours */}
        <TabsContent
          value="neighbours"
          className="flex-1 space-y-4 overflow-y-auto px-6 py-4 focus:outline-none"
        >
          <div className="space-y-4">
            <div>
              <h4 className="mb-2 text-xs font-semibold tracking-wider text-[var(--fg-subtle)] uppercase">
                Upstream Dependencies ({upNeighbours.length})
              </h4>
              {upNeighbours.length === 0 ? (
                <p className="text-xs text-[var(--fg-subtle)] italic">
                  No upstream clients identified.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {upNeighbours.map((ref) => (
                    <NeighbourRow
                      key={`up-${ref.edge_id}-${ref.node_id}`}
                      refItem={ref}
                      _direction="up"
                      onSelect={() => {
                        onSelectNeighbour(ref.node_id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-[var(--border)] pt-3">
              <h4 className="mb-2 text-xs font-semibold tracking-wider text-[var(--fg-subtle)] uppercase">
                Downstream Dependencies ({downNeighbours.length})
              </h4>
              {downNeighbours.length === 0 ? (
                <p className="text-xs text-[var(--fg-subtle)] italic">
                  No downstream services identified.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {downNeighbours.map((ref) => (
                    <NeighbourRow
                      key={`down-${ref.edge_id}-${ref.node_id}`}
                      refItem={ref}
                      _direction="down"
                      onSelect={() => {
                        onSelectNeighbour(ref.node_id);
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edge Detail Presentation View
// ---------------------------------------------------------------------------
interface EdgeDetailViewProps {
  edge: Edge;
  detail: EdgeDetail | null;
  history: ReturnType<typeof useTopologyStore.getState>["edgeHistory"] extends Map<string, infer H>
    ? H | null | undefined
    : never;
  onSelectNode: (nodeId: string) => void;
}

function EdgeDetailView({ edge, detail, history, onSelectNode }: EdgeDetailViewProps) {
  const rpsSeries = history?.rps.toArray() ?? detail?.history?.rps ?? [edge.metrics.rps];
  const p99Series = history?.p99_ms.toArray() ?? detail?.history?.p99_ms ?? [edge.metrics.p99_ms];
  const errorSeries = history?.error_rate.toArray() ??
    detail?.history?.error_rate ?? [edge.metrics.error_rate];

  const states = edge.metrics.state_breakdown ?? {};

  return (
    <div className="flex flex-1 flex-col space-y-4 overflow-y-auto px-6 py-4">
      <SheetHeader className="border-b border-[var(--border)] pb-4 text-left">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-mono text-[10px] uppercase">
            {edge.protocol}
          </Badge>
          <MetricQualityBadge quality={edge.metrics.quality} />
        </div>
        <SheetTitle className="truncate text-lg font-bold text-[var(--fg)]">
          Communication Edge
        </SheetTitle>
        <SheetDescription className="truncate font-mono text-xs text-[var(--fg-subtle)]">
          {edge.id}
        </SheetDescription>
      </SheetHeader>

      {/* Traversal Navigation Buttons */}
      <div className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
        <button
          type="button"
          onClick={() => {
            onSelectNode(edge.source);
          }}
          className="flex-1 rounded-sm border border-[var(--border)] bg-[var(--surface-raised)] p-2 text-left transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none"
        >
          <span className="block text-[10px] text-[var(--fg-subtle)]">Source Node</span>
          <span className="block truncate font-semibold text-[var(--fg)]">{edge.source}</span>
        </button>
        <ArrowRight className="h-4 w-4 shrink-0 text-[var(--fg-subtle)]" aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            onSelectNode(edge.target);
          }}
          className="flex-1 rounded-sm border border-[var(--border)] bg-[var(--surface-raised)] p-2 text-left transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none"
        >
          <span className="block text-[10px] text-[var(--fg-subtle)]">Target Node</span>
          <span className="block truncate font-semibold text-[var(--fg)]">{edge.target}</span>
        </button>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="text-[11px] text-[var(--fg-subtle)]">Throughput</span>
          <p className="text-base font-bold text-[var(--fg)] tabular-nums">
            {formatRps(edge.metrics.rps)}
          </p>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="text-[11px] text-[var(--fg-subtle)]">Bandwidth</span>
          <p className="text-base font-bold text-[var(--fg)] tabular-nums">
            {formatBytes(edge.metrics.bytes_per_sec)}/s
          </p>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="text-[11px] text-[var(--fg-subtle)]">p99 Latency</span>
          <p className="text-base font-bold text-[var(--fg)] tabular-nums">
            {formatLatencyMs(edge.metrics.p99_ms)}
          </p>
        </div>
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5">
          <span className="text-[11px] text-[var(--fg-subtle)]">Connections</span>
          <p className="text-base font-bold text-[var(--fg)] tabular-nums">
            {formatNumber(edge.metrics.connection_count)}
          </p>
        </div>
      </div>

      {/* StateBar */}
      <StateBar states={states} totalConnections={edge.metrics.connection_count} />

      {/* Sparklines */}
      <div className="grid grid-cols-1 gap-3 @sm:grid-cols-2">
        <Sparkline
          label="Throughput"
          unit="rps"
          data={rpsSeries}
          status={edge.health}
          formatValue={formatRps}
        />
        <Sparkline
          label="p99 Latency"
          unit="ms"
          data={p99Series}
          status={edge.health}
          formatValue={formatLatencyMs}
        />
        <Sparkline
          label="Error Rate"
          unit="%"
          data={errorSeries}
          status={edge.metrics.error_rate > 0.05 ? "critical" : undefined}
          formatValue={formatPercent}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper Subcomponents
// ---------------------------------------------------------------------------
function HealthBanner({ health, reasons }: { health: HealthStatus; reasons: readonly string[] }) {
  const isHealthy = health === "healthy";
  const isDegraded = health === "degraded";

  const bannerClass = isHealthy
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
    : isDegraded
      ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
      : "border-rose-500/30 bg-rose-500/10 text-rose-400";

  const Icon = isHealthy ? CheckCircle2 : AlertCircle;

  return (
    <div className={cn("rounded-md border p-3 text-xs", bannerClass)} role="status">
      <div className="flex items-center gap-2 font-semibold capitalize">
        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span>Health Status: {health}</span>
      </div>
      <div className="mt-1 space-y-0.5 pl-6 text-[11px] opacity-90">
        {reasons.length > 0 ? (
          reasons.map((r) => <p key={r}>{r}</p>)
        ) : (
          <p>
            {isHealthy
              ? "All metrics within healthy thresholds."
              : "No specific threshold breaches reported."}
          </p>
        )}
      </div>
    </div>
  );
}

function MetricQualityBadge({ quality }: { quality: MetricQuality }) {
  const label = quality.toUpperCase();
  const variant =
    quality === "measured" ? "default" : quality === "estimated" ? "secondary" : "outline";

  return (
    <Badge variant={variant} className="text-[10px] tracking-wide">
      {label}
    </Badge>
  );
}

function ProcessDetailView({
  process,
  metrics,
}: {
  process: ProcessInfo;
  metrics: Node["metrics"];
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
        <h4 className="flex items-center gap-1.5 font-semibold text-[var(--fg)]">
          <Cpu className="h-4 w-4 text-[var(--accent)]" />
          Process Telemetry
        </h4>
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div>
            <span className="text-[var(--fg-subtle)]">Process Name: </span>
            <span className="font-semibold text-[var(--fg)]">{process.name}</span>
          </div>
          <div>
            <span className="text-[var(--fg-subtle)]">PID / PPID: </span>
            <span className="font-mono text-[var(--fg)]">
              {process.pid} {process.ppid ? `/ ${String(process.ppid)}` : ""}
            </span>
          </div>
          <div>
            <span className="text-[var(--fg-subtle)]">User: </span>
            <span className="text-[var(--fg)]">{process.username ?? "—"}</span>
          </div>
          <div>
            <span className="text-[var(--fg-subtle)]">Threads: </span>
            <span className="font-mono text-[var(--fg)]">{process.num_threads ?? 1}</span>
          </div>
          <div>
            <span className="text-[var(--fg-subtle)]">CPU Utilization: </span>
            <span className="font-mono font-semibold text-[var(--fg)]">
              {metrics.cpu_percent.toFixed(1)}%
            </span>
          </div>
          <div>
            <span className="text-[var(--fg-subtle)]">Memory (RSS): </span>
            <span className="font-mono font-semibold text-[var(--fg)]">
              {formatBytes(metrics.rss_bytes)}
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs">
        <span className="text-[11px] font-semibold text-[var(--fg-muted)]">
          Sanitized Command Line
        </span>
        <pre className="overflow-x-auto rounded-xs border border-[var(--border)] bg-[var(--surface-solid)] p-2 font-mono text-[11px] break-all whitespace-pre-wrap text-[var(--fg)]">
          {process.cmdline_sanitized || process.name}
        </pre>
      </div>
    </div>
  );
}

function NeighbourRow({
  refItem,
  _direction,
  onSelect,
}: {
  refItem: NeighbourRef;
  _direction: "up" | "down";
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-2.5 text-left transition-all hover:border-[var(--accent)] hover:bg-[var(--surface-raised)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none"
    >
      <div className="flex items-center gap-2 truncate">
        <Badge variant="outline" className="px-1 py-0 font-mono text-[9px] uppercase">
          {refItem.kind}
        </Badge>
        <span className="truncate text-xs font-medium text-[var(--fg)]">{refItem.label}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--fg-subtle)] tabular-nums">
        <span className="font-mono text-[10px] uppercase">{refItem.protocol}</span>
        <span>{formatRps(refItem.rps)}</span>
        <ArrowRight className="h-3.5 w-3.5 text-[var(--fg-subtle)]" aria-hidden="true" />
      </div>
    </button>
  );
}
