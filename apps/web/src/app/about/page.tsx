import type { Metadata } from "next";
import { Cpu, Activity, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About | AppFlow Profiler",
  description: "System architecture, telemetry collection model, and simulation mode details",
};

export default function AboutPage() {
  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
          About AppFlow Profiler
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Architecture overview, telemetry collection methodology, and simulation disclosures.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="glass-surface">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[var(--ok)]" />
              <CardTitle>Dual-Mode Telemetry</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>AppFlow operates in two distinct operational modes:</p>
            <ul className="list-inside list-disc space-y-1 text-xs">
              <li>
                <strong className="text-[var(--fg)]">Live Mode:</strong> Collects real operating
                system socket tables and process telemetry via psutil and procfs with sensitive
                argument sanitization.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Simulation Mode:</strong> Runs a deterministic
                discrete-event simulation model with queueing theory (M/M/c/K, Pollaczek-Khinchine)
                for testing without host-level privileges.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-surface">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[var(--accent)]" />
              <CardTitle>Streaming Protocol</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              Data streams over WebSocket using sequence-tracked delta frames with JSON Schema
              validation. Clients maintain client-side Map stores and can request periodic snapshots
              or resyncs seamlessly.
            </p>
          </CardContent>
        </Card>

        <Card className="glass-surface md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-[var(--warn)]" />
              <CardTitle>Optimization Advisor</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              The optimization advisor evaluates compact topology digests to generate actionable
              remediation recommendations. When a Gemini API key is configured, recommendations are
              synthesized via the Interactions API; otherwise, an intelligent heuristic rule engine
              provides deterministic fallback analysis.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
