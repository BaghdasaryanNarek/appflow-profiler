import * as React from "react";
import type { Metadata } from "next";

import { InsightsView } from "./InsightsView";

export const metadata: Metadata = {
  title: "Insights | AppFlow Profiler",
  description: "AI-powered architectural recommendations and deterministic bottleneck analysis",
};

export default function InsightsPage(): React.JSX.Element {
  return (
    <React.Suspense
      fallback={
        <div
          role="status"
          aria-live="polite"
          className="border-border bg-bg-surface/70 m-6 rounded-xl border p-6 text-sm"
        >
          Loading Optimization Advisor...
        </div>
      }
    >
      <InsightsView />
    </React.Suspense>
  );
}
