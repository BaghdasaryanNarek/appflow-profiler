"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Bot, Cpu, Globe, Loader2, RefreshCw, Server, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { TopologyLiveStrip } from "@/components/topology/TopologyLiveStrip";
import { NodeDetailSheet } from "@/components/details/NodeDetailSheet";
import { ReportView } from "@/components/insights";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { analyzeTopology } from "@/lib/api/client";
import { ApiProblemError } from "@/lib/api/errors";
import { useTopologyStore } from "@/store/topology-store";
import type { AnalyzeRequest, OptimizationReport } from "@/types/contracts.gen";

const FOCUS_PRESETS = [
  "Latency & tail p99",
  "Connection pooling",
  "Retry amplification",
  "Cache efficiency",
] as const;

interface ErrorAlertState {
  readonly title: string;
  readonly detail: string;
  readonly status: number | null;
}

/**
 * Interactive Optimization Advisor view for `/insights`.
 * Supports global topology analysis, single-node pre-scoped analysis via `?node=<id>`,
 * optional focus area hints, streaming-style skeleton states, RFC 9457 Problem Details
 * error handling with Sonner toast notifications, and clickable evidence deep-linking.
 */
export function InsightsView(): React.JSX.Element {
  const searchParams = useSearchParams();
  const nodeParam = searchParams.get("node")?.trim() ?? "";

  const nodesMap = useTopologyStore((state) => state.nodes);
  const sortedNodes = React.useMemo(
    () => Array.from(nodesMap.values()).sort((a, b) => a.label.localeCompare(b.label)),
    [nodesMap],
  );

  const [scopeMode, setScopeMode] = React.useState<"global" | "node">(() =>
    nodeParam.length > 0 ? "node" : "global",
  );
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>(() => nodeParam);
  const [focusText, setFocusText] = React.useState<string>("");
  const [isAnalyzing, setIsAnalyzing] = React.useState<boolean>(false);
  const [report, setReport] = React.useState<OptimizationReport | null>(null);
  const [errorState, setErrorState] = React.useState<ErrorAlertState | null>(null);

  const abortControllerRef = React.useRef<AbortController | null>(null);
  const autoAnalyzedNodeRef = React.useRef<string | null>(null);

  // Ensure a default node ID is selected when switching to "node" mode if nodes are loaded
  React.useEffect(() => {
    if (scopeMode === "node" && selectedNodeId.length === 0 && sortedNodes.length > 0) {
      const firstNode = sortedNodes[0];
      if (firstNode !== undefined) {
        setSelectedNodeId(firstNode.id);
      }
    }
  }, [scopeMode, selectedNodeId, sortedNodes]);

  const runAnalysis = React.useCallback(
    async (overrideScope?: string, overrideFocus?: string): Promise<void> => {
      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      const resolvedScope =
        overrideScope ??
        (scopeMode === "node" && selectedNodeId.trim().length > 0
          ? selectedNodeId.trim()
          : "global");
      const trimmedFocus = (overrideFocus ?? focusText).trim();

      const requestBody: AnalyzeRequest = {
        scope: resolvedScope,
        ...(trimmedFocus.length > 0 ? { focus: trimmedFocus } : {}),
      };

      setIsAnalyzing(true);
      setErrorState(null);

      try {
        const result = await analyzeTopology(requestBody, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) {
          return;
        }
        setReport(result);
      } catch (err: unknown) {
        if (controller.signal.aborted || (err instanceof Error && err.name === "AbortError")) {
          return;
        }

        if (err instanceof ApiProblemError) {
          const detailMessage =
            err.detail ?? `Request failed with HTTP status ${String(err.status)}.`;
          toast.error(err.title, {
            description: detailMessage,
          });
          setErrorState({
            title: err.title,
            detail: detailMessage,
            status: err.status,
          });
        } else {
          const message =
            err instanceof Error ? err.message : "Unable to complete optimization analysis.";
          toast.error("Optimization analysis failed", {
            description: message,
          });
          setErrorState({
            title: "Optimization analysis failed",
            detail: message,
            status: null,
          });
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setIsAnalyzing(false);
        }
      }
    },
    [focusText, scopeMode, selectedNodeId],
  );

  // Auto-scope and trigger analysis when arriving with `?node=<id>`
  React.useEffect(() => {
    if (nodeParam.length > 0 && autoAnalyzedNodeRef.current !== nodeParam) {
      autoAnalyzedNodeRef.current = nodeParam;
      setScopeMode("node");
      setSelectedNodeId(nodeParam);
      void runAnalysis(nodeParam, "");
    }
  }, [nodeParam, runAnalysis]);

  // Clean up any in-flight request on unmount
  React.useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const handleFormSubmit = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void runAnalysis();
  };

  const activeNodeRecord = selectedNodeId.length > 0 ? nodesMap.get(selectedNodeId) : undefined;

  return (
    <div className="space-y-6">
      <TopologyLiveStrip />

      {/* Page Header & Control Bar */}
      <section
        aria-labelledby="insights-heading"
        className="glass-surface rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-6 shadow-md"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/15 text-[var(--accent)]">
                <Sparkles className="h-4 w-4" aria-hidden="true" />
              </span>
              <h1
                id="insights-heading"
                className="text-xl font-bold tracking-tight text-[var(--fg)]"
              >
                Optimization Advisor
              </h1>
              <Badge variant="outline">Gemini 2.5 Flash + Heuristics</Badge>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
              Analyze live telemetry digests to surface high-leverage architectural bottlenecks,
              saturation risks, and prioritized remediation steps backed by clickable topology
              evidence.
            </p>
          </div>
        </div>

        {/* Interactive Analysis Controls Form */}
        <form
          onSubmit={handleFormSubmit}
          aria-label="Optimization analysis controls"
          className="mt-5 border-t border-[var(--border)] pt-5"
        >
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Scope Picker */}
            <fieldset className="lg:col-span-5">
              <legend className="mb-2 block text-xs font-semibold tracking-wider text-[var(--fg-muted)] uppercase">
                Analysis Scope
              </legend>
              <div
                className="flex flex-wrap items-center gap-2"
                role="radiogroup"
                aria-label="Analysis scope mode"
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={scopeMode === "global"}
                  data-testid="scope-global-btn"
                  onClick={() => {
                    setScopeMode("global");
                  }}
                  className={
                    scopeMode === "global"
                      ? "inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--accent)]/60 bg-[var(--accent)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--fg)] transition-colors"
                      : "inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
                  }
                >
                  <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                  Global Topology
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={scopeMode === "node"}
                  data-testid="scope-node-btn"
                  onClick={() => {
                    setScopeMode("node");
                    if (selectedNodeId.length === 0 && sortedNodes[0] !== undefined) {
                      setSelectedNodeId(sortedNodes[0].id);
                    }
                  }}
                  className={
                    scopeMode === "node"
                      ? "inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--accent)]/60 bg-[var(--accent)]/15 px-3 py-1.5 text-xs font-semibold text-[var(--fg)] transition-colors"
                      : "inline-flex min-h-9 items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
                  }
                >
                  <Server className="h-3.5 w-3.5" aria-hidden="true" />
                  Specific Node
                </button>
              </div>

              {scopeMode === "node" ? (
                <div className="mt-3">
                  <label
                    htmlFor="scope-node-select"
                    className="mb-1 block text-xs text-[var(--fg-muted)]"
                  >
                    Target Node
                  </label>
                  <select
                    id="scope-node-select"
                    data-testid="scope-node-select"
                    value={selectedNodeId}
                    onChange={(e) => {
                      setSelectedNodeId(e.target.value);
                    }}
                    className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--fg)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
                  >
                    {selectedNodeId.length > 0 && activeNodeRecord === undefined ? (
                      <option value={selectedNodeId}>{selectedNodeId}</option>
                    ) : null}
                    {sortedNodes.map((node) => (
                      <option key={node.id} value={node.id}>
                        {node.label} ({node.id})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </fieldset>

            {/* Focus Hint Input & Presets */}
            <div className="lg:col-span-5">
              <label
                htmlFor="insights-focus-input"
                className="mb-2 block text-xs font-semibold tracking-wider text-[var(--fg-muted)] uppercase"
              >
                Focus Area (Optional)
              </label>
              <input
                id="insights-focus-input"
                data-testid="insights-focus-input"
                type="text"
                value={focusText}
                onChange={(e) => {
                  setFocusText(e.target.value);
                }}
                placeholder="e.g., Latency & tail p99, database pool exhaustion..."
                maxLength={120}
                className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 text-xs text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
              />
              <div
                className="mt-2 flex flex-wrap items-center gap-1.5"
                role="group"
                aria-label="Quick focus presets"
              >
                {FOCUS_PRESETS.map((preset) => {
                  const isSelected = focusText === preset;
                  return (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setFocusText(isSelected ? "" : preset);
                      }}
                      aria-pressed={isSelected}
                      className={
                        isSelected
                          ? "inline-flex min-h-6 items-center rounded border border-[var(--accent)]/60 bg-[var(--accent)]/15 px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] transition-colors"
                          : "inline-flex min-h-6 items-center rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--fg-muted)] transition-colors hover:text-[var(--fg)]"
                      }
                    >
                      {preset}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Action Button */}
            <div className="flex items-end lg:col-span-2">
              <Button
                type="submit"
                variant="default"
                data-testid="analyze-topology-btn"
                disabled={
                  isAnalyzing || (scopeMode === "node" && selectedNodeId.trim().length === 0)
                }
                aria-busy={isAnalyzing}
                className="w-full"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                    Analyze topology
                  </>
                )}
              </Button>
            </div>
          </div>
        </form>
      </section>

      {/* Error Alert Banner (RFC 9457 Problem Details / Rate Limit) */}
      {errorState !== null ? (
        <div
          role="alert"
          data-testid="insights-error-alert"
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--crit)]/40 bg-[var(--crit)]/10 p-4"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--crit)]"
              aria-hidden="true"
            />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-[var(--fg)]">{errorState.title}</h2>
                {errorState.status !== null ? (
                  <Badge variant="crit" className="font-mono tabular-nums">
                    HTTP {errorState.status}
                  </Badge>
                ) : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--fg-muted)]">
                {errorState.detail}
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => {
              void runAnalysis();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry analysis
          </Button>
        </div>
      ) : null}

      {/* Streaming-Style Skeleton State while in-flight */}
      {isAnalyzing ? (
        <div
          role="status"
          aria-live="polite"
          aria-label="Analyzing topology..."
          data-testid="insights-loading-skeleton"
          className="flex flex-col gap-6"
        >
          <div className="glass-surface animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-5">
            <div className="flex items-center gap-3">
              <div className="h-6 w-32 rounded-md bg-[var(--surface)]" />
              <div className="h-5 w-48 rounded-md bg-[var(--surface)]" />
            </div>
            <div className="mt-3 h-4 w-3/4 rounded bg-[var(--surface)]" />
          </div>

          <div className="glass-surface animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-6">
            <div className="h-4 w-40 rounded bg-[var(--surface)]" />
            <div className="mt-4 h-4 w-full rounded bg-[var(--surface)]" />
            <div className="mt-2 h-4 w-5/6 rounded bg-[var(--surface)]" />
          </div>

          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="glass-surface animate-pulse rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-5"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="h-5 w-64 rounded bg-[var(--surface)]" />
                  <div className="h-5 w-24 rounded bg-[var(--surface)]" />
                </div>
                <div className="mt-4 h-12 w-full rounded bg-[var(--surface)]" />
                <div className="mt-3 h-8 w-2/3 rounded bg-[var(--surface)]" />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Populated Report View */}
      {!isAnalyzing && report !== null ? <ReportView report={report} /> : null}

      {/* Initial Ready-to-Analyze Placeholder */}
      {!isAnalyzing && report === null ? (
        <section
          aria-label="Advisor overview"
          data-testid="insights-report-placeholder"
          className="glass-surface rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-solid)] p-8"
        >
          <div className="mx-auto flex max-w-2xl flex-col items-center text-center">
            <div className="mb-4 flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs">
              <Bot className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
              <span className="font-medium text-[var(--fg)]">Two-Tier Diagnostic Engine</span>
              <span className="text-[var(--fg-subtle)]">·</span>
              <Cpu className="h-4 w-4 text-[var(--ok)]" aria-hidden="true" />
              <span className="text-[var(--fg-muted)]">Zero-Downtime Heuristic Fallback</span>
            </div>

            <h2 className="text-base font-semibold text-[var(--fg)]">
              Ready to diagnose system bottlenecks
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--fg-muted)]">
              Select <strong>Global Topology</strong> to inspect end-to-end critical paths, or scope
              to a <strong>Specific Node</strong> to evaluate localized saturation, connection pool
              queueing, and retry amplification. Click <strong>Analyze topology</strong> above to
              generate a prioritized report.
            </p>
          </div>
        </section>
      ) : null}

      <NodeDetailSheet />
    </div>
  );
}
