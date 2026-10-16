"use client";

import * as React from "react";
import {
  AlertCircle,
  AlertOctagon,
  AlertTriangle,
  Bot,
  CheckCircle2,
  Cpu,
  FileText,
  Hash,
  Info,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import type { Bottleneck, OptimizationReport, Severity } from "@/types/contracts.gen";
import { cn } from "@/lib/utils";
import { EvidenceChip } from "./EvidenceChip";
import { RecommendationCard } from "./RecommendationCard";

export interface ReportViewProps {
  report: OptimizationReport;
  onNavigateNode?: (nodeId: string) => void;
  compact?: boolean;
  className?: string;
}

const SEVERITY_META: Record<
  Severity,
  {
    label: string;
    badgeClass: string;
    cardClass: string;
    icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  }
> = {
  high: {
    label: "Severity: High",
    badgeClass: "border-[var(--crit)]/45 bg-[var(--crit)]/15 text-[var(--crit)]",
    cardClass: "border-[var(--crit)]/35 bg-[var(--crit)]/5",
    icon: AlertOctagon,
  },
  medium: {
    label: "Severity: Medium",
    badgeClass: "border-[var(--warn)]/45 bg-[var(--warn)]/15 text-[var(--warn)]",
    cardClass: "border-[var(--warn)]/30 bg-[var(--warn)]/5",
    icon: AlertTriangle,
  },
  low: {
    label: "Severity: Low",
    badgeClass: "border-[var(--accent)]/40 bg-[var(--accent)]/15 text-[var(--accent)]",
    cardClass: "border-[var(--border-strong)] bg-[var(--surface-solid)]/60",
    icon: Info,
  },
};

function formatReportTimestamp(iso?: string): string {
  if (!iso) return "Just now";
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function ReportView({
  report,
  onNavigateNode,
  compact = false,
  className,
}: ReportViewProps) {
  const bottlenecks = report.bottlenecks ?? [];
  const caveats = report.caveats ?? [];

  const sortedRecommendations = React.useMemo(() => {
    const raw = report.recommendations ?? [];
    return [...raw].sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.id.localeCompare(b.id);
    });
  }, [report.recommendations]);

  const isGemini = report.source === "gemini";
  const shortHash = report.digest_hash.slice(0, 12);

  return (
    <div
      data-testid="insights-report-view"
      data-report-source={report.source}
      className={cn("@container space-y-6", compact && "space-y-4", className)}
    >
      {/* 1. Source Disclosure & Provenance Header */}
      <section
        aria-label="Report provenance and source disclosure"
        className="glass-surface rounded-xl border border-[var(--border)] p-4 @sm:p-5"
      >
        <div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <span
              data-testid="report-source-badge"
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold",
                isGemini
                  ? "border-[var(--accent)]/50 bg-[var(--accent)]/15 text-[var(--accent)]"
                  : "border-[var(--warn)]/45 bg-[var(--warn)]/15 text-[var(--warn)]",
              )}
            >
              {isGemini ? (
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
              ) : (
                <Cpu className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
              )}
              <span>{isGemini ? "Gemini AI" : "Heuristic Engine"}</span>
            </span>

            {isGemini && report.model ? (
              <span
                data-testid="report-model-badge"
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-strong)] bg-[var(--surface-solid)] px-2 py-0.5 font-mono text-xs text-[var(--fg)]"
              >
                <Bot className="h-3 w-3 shrink-0 text-[var(--accent)]" aria-hidden={true} />
                <span>{report.model}</span>
              </span>
            ) : null}

            <span
              title={`Full SHA-256 Digest Hash: ${report.digest_hash}`}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface-solid)] px-2 py-0.5 font-mono text-xs text-[var(--fg-muted)] tabular-nums"
            >
              <Hash className="h-3 w-3 shrink-0" aria-hidden={true} />
              <span>Digest: {shortHash}</span>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 font-mono text-xs text-[var(--fg-muted)] tabular-nums">
            <span>ID: {report.report_id}</span>
            <span aria-hidden={true}>•</span>
            <span>{formatReportTimestamp(report.generated_at)}</span>
          </div>
        </div>

        <p
          data-testid="report-source-explanation"
          className="mt-2.5 border-t border-[var(--border)] pt-2.5 text-xs leading-relaxed text-[var(--fg-muted)]"
        >
          {isGemini
            ? `Cloud LLM structured analysis produced by ${report.model ?? "Gemini"} over a <= 6 KB topology digest and verified by the server-side entity grounding guard.`
            : "Deterministic SRE queueing and threshold heuristic engine evaluating live saturation, tail latency (p99), connection pool pressure, and retry amplification."}
        </p>
      </section>

      {/* 2. Executive Summary Card */}
      <section
        aria-labelledby="report-summary-heading"
        className="glass-surface rounded-xl border border-[var(--border-strong)] p-4 @sm:p-5"
      >
        <div className="mb-2 flex items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden={true} />
          <h2
            id="report-summary-heading"
            className="text-sm font-semibold tracking-wider text-[var(--fg-muted)] uppercase"
          >
            Executive Summary
          </h2>
        </div>
        <p
          data-testid="report-summary-text"
          className="text-sm leading-relaxed font-medium text-[var(--fg)] @md:text-base"
        >
          {report.summary}
        </p>
      </section>

      {/* 3. Detected Bottlenecks Section */}
      <section aria-labelledby="report-bottlenecks-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="report-bottlenecks-heading"
            className="text-base font-semibold tracking-tight text-[var(--fg)]"
          >
            Detected Bottlenecks ({bottlenecks.length})
          </h2>
        </div>

        {bottlenecks.length === 0 ? (
          <div
            data-testid="bottlenecks-empty-state"
            className="glass-surface flex items-center gap-3 rounded-xl border border-[var(--ok)]/30 bg-[var(--ok)]/5 p-4 text-xs text-[var(--fg)]"
          >
            <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--ok)]" aria-hidden={true} />
            <div>
              <p className="font-semibold">No active bottlenecks detected</p>
              <p className="text-[var(--fg-muted)]">
                All evaluated entities within the selected topology scope are operating within
                healthy saturation and latency thresholds.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 @lg:grid-cols-2">
            {bottlenecks.map((bottleneck: Bottleneck, index: number) => {
              const sevMeta = SEVERITY_META[bottleneck.severity];
              const SevIcon = sevMeta.icon;
              return (
                <div
                  key={`${bottleneck.node_id}-${String(index)}`}
                  data-testid={`bottleneck-card-${bottleneck.node_id}`}
                  className={cn(
                    "glass-surface flex flex-col justify-between gap-3 rounded-xl border p-4",
                    sevMeta.cardClass,
                  )}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-xs font-semibold",
                          sevMeta.badgeClass,
                        )}
                      >
                        <SevIcon className="h-3.5 w-3.5 shrink-0" aria-hidden={true} />
                        <span>{sevMeta.label}</span>
                      </span>

                      <EvidenceChip
                        nodeId={bottleneck.node_id}
                        {...(onNavigateNode !== undefined ? { onNavigate: onNavigateNode } : {})}
                      />
                    </div>

                    <h3 className="text-sm font-semibold text-balance text-[var(--fg)]">
                      {bottleneck.title}
                    </h3>
                  </div>

                  {bottleneck.evidence.length > 0 ? (
                    <ul
                      aria-label={`Telemetry evidence for ${bottleneck.title}`}
                      className="space-y-1 border-t border-[var(--border)] pt-2.5 font-mono text-xs text-[var(--fg-muted)] tabular-nums"
                    >
                      {bottleneck.evidence.map((ev) => (
                        <li key={ev} className="flex items-center gap-1.5">
                          <span
                            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--accent)]"
                            aria-hidden={true}
                          />
                          <span>{ev}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Prioritized Recommendations List */}
      <section aria-labelledby="report-recommendations-heading" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2
            id="report-recommendations-heading"
            className="text-base font-semibold tracking-tight text-[var(--fg)]"
          >
            Prioritized Recommendations ({sortedRecommendations.length})
          </h2>
          <span className="text-xs text-[var(--fg-muted)]">Sorted by priority (P1 → P5)</span>
        </div>

        {sortedRecommendations.length === 0 ? (
          <div
            data-testid="recommendations-empty-state"
            className="glass-surface flex items-center gap-3 rounded-xl border border-[var(--border)] p-4 text-xs text-[var(--fg-muted)]"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden={true} />
            <span>
              No remediation actions required for the current steady-state topology snapshot.
            </span>
          </div>
        ) : (
          <div
            data-testid="recommendations-list"
            style={{
              contentVisibility: "auto",
              containIntrinsicSize: "auto 440px",
            }}
            className="space-y-4"
          >
            {sortedRecommendations.map((rec) => (
              <RecommendationCard
                key={rec.id}
                recommendation={rec}
                {...(onNavigateNode !== undefined ? { onNavigateNode } : {})}
              />
            ))}
          </div>
        )}
      </section>

      {/* 5. Caveats & Qualifications Footer */}
      {caveats.length > 0 ? (
        <footer
          aria-labelledby="report-caveats-heading"
          data-testid="report-caveats-footer"
          className="glass-surface rounded-xl border border-[var(--border)] bg-[var(--surface-solid)]/60 p-4"
        >
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-wider text-[var(--fg-muted)] uppercase">
            <ShieldAlert className="h-4 w-4 shrink-0 text-[var(--warn)]" aria-hidden={true} />
            <h2 id="report-caveats-heading">Diagnostic Caveats & Qualifications</h2>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-[var(--fg-muted)]">
            {caveats.map((caveat) => (
              <li key={caveat}>{caveat}</li>
            ))}
          </ul>
        </footer>
      ) : null}
    </div>
  );
}
