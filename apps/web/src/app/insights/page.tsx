import type { Metadata } from "next";
import { Sparkles } from "lucide-react";

export const metadata: Metadata = {
  title: "Insights | AppFlow Profiler",
  description: "AI-powered architectural recommendations and deterministic bottleneck analysis",
};

export default function InsightsPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Optimization Advisor</h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Architectural recommendations grounded in observed throughput, error rates, and
          saturation.
        </p>
      </div>

      <div
        className="glass-surface flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-8 text-center"
        data-testid="insights-report-placeholder"
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--warn)]">
          <Sparkles className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">Architecture Optimization Report</h2>
        <p className="mt-1 max-w-md text-xs text-[var(--fg-muted)]">
          Structured advisor report with bottleneck evidence chips, impact assessments, and code
          remediation snippets will mount here in Phase 12.
        </p>
      </div>
    </div>
  );
}
