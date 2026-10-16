"use client";

import * as React from "react";
import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  Cable,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  GitFork,
  Info,
  RefreshCw,
  TrendingUp,
  Wrench,
  Zap,
} from "lucide-react";
import type { Effort, Recommendation, RecommendationCategory } from "@/types/contracts.gen";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { EvidenceChip } from "./EvidenceChip";

export interface RecommendationCardProps {
  recommendation: Recommendation;
  onNavigateNode?: (nodeId: string) => void;
  className?: string;
}

interface PriorityMeta {
  label: string;
  badgeClass: string;
  borderClass: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}

function getPriorityMeta(priority: number): PriorityMeta {
  switch (priority) {
    case 1:
      return {
        label: "P1 · Critical",
        badgeClass: "border-[var(--crit)]/45 bg-[var(--crit)]/15 text-[var(--crit)]",
        borderClass: "border-l-4 border-l-[var(--crit)]",
        icon: AlertOctagon,
      };
    case 2:
      return {
        label: "P2 · High",
        badgeClass: "border-[var(--warn)]/45 bg-[var(--warn)]/15 text-[var(--warn)]",
        borderClass: "border-l-4 border-l-[var(--warn)]",
        icon: AlertTriangle,
      };
    case 3:
      return {
        label: "P3 · Medium",
        badgeClass: "border-[var(--accent)]/45 bg-[var(--accent)]/15 text-[var(--accent)]",
        borderClass: "border-l-4 border-l-[var(--accent)]",
        icon: Zap,
      };
    case 4:
      return {
        label: "P4 · Low",
        badgeClass:
          "border-[var(--border-strong)] bg-[var(--surface-solid)] text-[var(--fg-muted)]",
        borderClass: "border-l-4 border-l-[var(--border-strong)]",
        icon: Info,
      };
    default:
      return {
        label: `P${String(priority)} · Informational`,
        badgeClass: "border-[var(--ok)]/40 bg-[var(--ok)]/10 text-[var(--ok)]",
        borderClass: "border-l-4 border-l-[var(--ok)]",
        icon: CheckCircle2,
      };
  }
}

const CATEGORY_META: Record<
  RecommendationCategory,
  {
    label: string;
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  }
> = {
  capacity: {
    label: "Capacity & Scaling",
    icon: Cpu,
  },
  connection_pooling: {
    label: "Connection Pooling",
    icon: Cable,
  },
  caching: {
    label: "Caching Layer",
    icon: Database,
  },
  retry_policy: {
    label: "Retry Policy",
    icon: RefreshCw,
  },
  topology: {
    label: "Topology & Fan-out",
    icon: GitFork,
  },
  timeouts: {
    label: "Timeouts & Deadlines",
    icon: Clock,
  },
  observability: {
    label: "Observability",
    icon: Activity,
  },
};

const EFFORT_META: Record<
  Effort,
  {
    label: string;
    description: string;
    badgeClass: string;
  }
> = {
  S: {
    label: "Effort: S",
    description: "Small engineering effort (configuration or parameter tuning)",
    badgeClass: "border-[var(--ok)]/35 bg-[var(--ok)]/10 text-[var(--ok)]",
  },
  M: {
    label: "Effort: M",
    description: "Medium engineering effort (service or client library update)",
    badgeClass: "border-[var(--warn)]/35 bg-[var(--warn)]/10 text-[var(--warn)]",
  },
  L: {
    label: "Effort: L",
    description: "Large engineering effort (architectural or topology refactor)",
    badgeClass: "border-[var(--crit)]/35 bg-[var(--crit)]/10 text-[var(--crit)]",
  },
};

export function RecommendationCard({
  recommendation,
  onNavigateNode,
  className,
}: RecommendationCardProps) {
  const priorityMeta = getPriorityMeta(recommendation.priority);
  const PriorityIcon = priorityMeta.icon;

  const categoryMeta = CATEGORY_META[recommendation.category];
  const CategoryIcon = categoryMeta.icon;

  const effortMeta = EFFORT_META[recommendation.effort];

  return (
    <article
      data-testid={`recommendation-card-${recommendation.id}`}
      data-priority={recommendation.priority}
      data-category={recommendation.category}
      style={{
        contentVisibility: "auto",
        containIntrinsicSize: "auto 220px",
      }}
      className={cn(
        "recommendation-card-item glass-surface @container rounded-xl border border-[var(--border)] p-4 transition-colors duration-150 hover:border-[var(--border-strong)] @sm:p-5",
        priorityMeta.borderClass,
        className,
      )}
    >
      <div className="flex flex-col gap-3">
        {/* Top Metadata Strip: Reflows via Container Queries */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span
              data-testid="recommendation-priority-badge"
              data-priority-id={recommendation.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold tabular-nums",
                priorityMeta.badgeClass,
              )}
            >
              <PriorityIcon className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
              <span>{priorityMeta.label}</span>
            </span>

            <Badge
              variant="outline"
              data-testid="recommendation-category-badge"
              className="inline-flex items-center gap-1.5 border-[var(--border-strong)] bg-[var(--surface-solid)] px-2.5 py-0.5 text-xs font-medium text-[var(--fg)]"
            >
              <CategoryIcon
                className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]"
                aria-hidden={true}
              />
              <span>{categoryMeta.label}</span>
            </Badge>
          </div>

          <span
            data-testid="recommendation-effort-badge"
            title={effortMeta.description}
            aria-label={`${effortMeta.label}: ${effortMeta.description}`}
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-xs font-medium",
              effortMeta.badgeClass,
            )}
          >
            <Wrench className="h-3 w-3 shrink-0" aria-hidden={true} />
            <span>{effortMeta.label}</span>
          </span>
        </div>

        {/* Title */}
        <h3 className="text-base font-semibold tracking-tight text-balance text-[var(--fg)] @md:text-lg">
          {recommendation.title}
        </h3>

        {/* Rationale & Expected Impact Grid: 1 col in narrow containers, 2 cols in @md+ containers */}
        <div className="grid grid-cols-1 gap-3 @md:grid-cols-2">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-solid)]/70 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--fg-muted)] uppercase">
              <Info className="h-3.5 w-3.5 shrink-0 text-[var(--accent)]" aria-hidden={true} />
              <span>Diagnostic Rationale</span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--fg)]">{recommendation.rationale}</p>
          </div>

          <div className="rounded-lg border border-[var(--ok)]/25 bg-[var(--ok)]/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--ok)] uppercase">
              <TrendingUp className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
              <span>Expected Impact</span>
            </div>
            <p className="text-xs leading-relaxed text-[var(--fg)]">
              {recommendation.expected_impact}
            </p>
          </div>
        </div>

        {/* Affected Nodes Evidence Strip */}
        {recommendation.affected_node_ids.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-[var(--border)] pt-3 @sm:flex-row @sm:items-center @sm:justify-between">
            <span className="text-xs font-medium text-[var(--fg-muted)]">
              Affected Topology Entities ({recommendation.affected_node_ids.length}):
            </span>
            <div className="flex flex-wrap items-center gap-1.5" role="list">
              {recommendation.affected_node_ids.map((nodeId) => (
                <div key={nodeId} role="listitem">
                  <EvidenceChip
                    nodeId={nodeId}
                    {...(onNavigateNode !== undefined ? { onNavigate: onNavigateNode } : {})}
                  />
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
