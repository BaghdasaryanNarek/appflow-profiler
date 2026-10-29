"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Activity, AlertOctagon, AlertTriangle, ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { HealthStatus } from "@/types/contracts.gen";
import { cn } from "@/lib/utils";
import { startViewTransition } from "@/lib/view-transition";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";

export interface EvidenceChipProps {
  nodeId: string;
  label?: string;
  health?: HealthStatus;
  onNavigate?: (nodeId: string) => void;
  className?: string;
}

const HEALTH_META: Record<
  HealthStatus,
  {
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
    text: string;
    chipClass: string;
    iconClass: string;
  }
> = {
  healthy: {
    icon: CheckCircle2,
    text: "healthy",
    chipClass:
      "border-[var(--ok)]/35 bg-[var(--ok)]/10 text-[var(--fg)] hover:border-[var(--ok)]/70 hover:bg-[var(--ok)]/15",
    iconClass: "text-[var(--ok)]",
  },
  degraded: {
    icon: AlertTriangle,
    text: "degraded",
    chipClass:
      "border-[var(--warn)]/40 bg-[var(--warn)]/10 text-[var(--fg)] hover:border-[var(--warn)]/75 hover:bg-[var(--warn)]/15",
    iconClass: "text-[var(--warn)]",
  },
  critical: {
    icon: AlertOctagon,
    text: "critical",
    chipClass:
      "border-[var(--crit)]/45 bg-[var(--crit)]/10 text-[var(--fg)] hover:border-[var(--crit)]/80 hover:bg-[var(--crit)]/15",
    iconClass: "text-[var(--crit)]",
  },
  unknown: {
    icon: Activity,
    text: "unknown",
    chipClass:
      "border-[var(--border-strong)] bg-[var(--surface-solid)] text-[var(--fg)] hover:border-[var(--accent)]/60 hover:bg-[var(--accent-muted)]",
    iconClass: "text-[var(--fg-muted)]",
  },
};

export function EvidenceChip({ nodeId, label, health, onNavigate, className }: EvidenceChipProps) {
  const router = useRouter();
  const liveNode = useTopologyStore((s) => s.nodes.get(nodeId));

  const resolvedLabel = label ?? liveNode?.label ?? nodeId;
  const resolvedHealth: HealthStatus = health ?? liveNode?.health ?? "unknown";
  const resolvedKind = liveNode?.kind;

  const meta = HEALTH_META[resolvedHealth];
  const StatusIcon = meta.icon;

  const handleActivate = React.useCallback(() => {
    useUiStore.getState().selectNode(nodeId);
    onNavigate?.(nodeId);
    void startViewTransition(() => {
      router.push("/topology");
    });
  }, [nodeId, onNavigate, router]);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleActivate();
      }
    },
    [handleActivate],
  );

  // Starts with the visible kind and label (WCAG 2.5.3); the "(nodeId)" part is parenthetical
  const ariaLabel = `${resolvedKind ? `${resolvedKind} ` : ""}${resolvedLabel} (${nodeId}), health ${meta.text}, inspect on topology map`;

  return (
    <button
      type="button"
      data-testid={`evidence-chip-${nodeId}`}
      data-evidence-node-id={nodeId}
      aria-label={ariaLabel}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className={cn(
        "group inline-flex min-h-7 min-w-7 cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-all duration-150",
        "focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)] focus-visible:outline-none",
        meta.chipClass,
        className,
      )}
    >
      <StatusIcon className={cn("h-3.5 w-3.5 shrink-0", meta.iconClass)} aria-hidden={true} />
      {/* Explicit spaces keep the visible words apart for WCAG 2.5.3; flex layout drops them */}
      {resolvedKind ? (
        <>
          <span className="font-mono text-[10px] tracking-wider text-[var(--fg-muted)] uppercase">
            {resolvedKind}
          </span>{" "}
        </>
      ) : null}
      <span className="truncate font-semibold text-[var(--fg)]">{resolvedLabel}</span>
      {resolvedLabel !== nodeId ? (
        <>
          {" "}
          <span className="hidden font-mono text-[10px] text-[var(--fg-muted)] @sm:inline">
            ({nodeId})
          </span>
        </>
      ) : null}
      <span className="sr-only">({meta.text})</span>
      <ArrowUpRight
        className="h-3 w-3 shrink-0 text-[var(--fg-muted)] transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[var(--accent)]"
        aria-hidden={true}
      />
    </button>
  );
}
