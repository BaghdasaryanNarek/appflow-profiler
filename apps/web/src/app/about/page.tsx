import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArrowUpRight, Cpu, Eye, Gauge, ShieldCheck, Zap } from "lucide-react";

import { AboutCapabilitiesStrip } from "@/components/shell/AboutCapabilitiesStrip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "About | AppFlow Profiler",
  description: "System architecture, telemetry collection model, and simulation mode details",
};

export default function AboutPage() {
  return (
    <div className="@container max-w-5xl space-y-6">
      <div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
            About AppFlow Profiler
          </h1>
          <p className="text-sm text-[var(--fg-muted)]">
            Architecture overview, telemetry collection methodology, and simulation disclosures.
          </p>
        </div>

        <nav aria-label="Quick view links" className="flex flex-wrap items-center gap-2">
          <Link
            href="/topology"
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-solid)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          >
            <span>Topology Canvas</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[var(--fg-muted)]" aria-hidden="true" />
          </Link>
          <Link
            href="/processes"
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-solid)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          >
            <span>Process Table</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[var(--fg-muted)]" aria-hidden="true" />
          </Link>
          <Link
            href="/insights"
            className="inline-flex min-h-8 items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs font-medium text-[var(--fg)] transition-colors hover:bg-[var(--surface-solid)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          >
            <span>Optimization Advisor</span>
            <ArrowUpRight className="h-3.5 w-3.5 text-[var(--fg-muted)]" aria-hidden="true" />
          </Link>
        </nav>
      </div>

      <AboutCapabilitiesStrip />

      <div className="grid gap-4 @md:grid-cols-2">
        <Card className="glass-surface">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-[var(--ok)]" aria-hidden="true" />
              <CardTitle>Dual-Mode Telemetry</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              AppFlow operates behind a unified{" "}
              <code className="font-mono text-xs text-[var(--fg)]">TopologySource</code> protocol
              with two interchangeable runtime engines:
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed">
              <li>
                <strong className="text-[var(--fg)]">Live Mode (psutil):</strong> Enumerates kernel
                socket tables and process metrics inside{" "}
                <code className="font-mono">asyncio.to_thread</code>, redacting sensitive
                command-line tokens and degrading gracefully to endpoint-level telemetry when
                unprivileged.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Simulation Mode (M/M/c + Hawkes):</strong>{" "}
                Executes a seeded discrete-event microservice traffic model combining Erlang C
                queueing delay, Little&apos;s Law connection pooling, and self-exciting Hawkes burst
                scenarios without importing <code className="font-mono">psutil</code>.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-surface">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <CardTitle>Streaming Protocol</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              Real-time state synchronization uses a versioned{" "}
              <code className="font-mono text-xs text-[var(--fg)]">v=1</code> WebSocket envelope
              with monotonic sequence numbers:
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed">
              <li>
                <strong className="text-[var(--fg)]">0.5% Epsilon Diff Suppression:</strong>{" "}
                Unchanged metrics within the 0.5% relative threshold are omitted, keeping
                steady-state deltas under 7% of full snapshot size.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Bounded Backpressure &amp; Resync:</strong>{" "}
                Per-client bounded queues (<code className="font-mono">maxsize=8</code>) drain and
                emit a fresh snapshot on overflow, while sequence gaps trigger automatic client
                resync.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-surface">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Eye className="h-5 w-5 text-[var(--accent)]" aria-hidden="true" />
              <CardTitle>Progressive Disclosure &amp; WCAG 2.2 AA Accessibility</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              Designed around a 4-level progressive disclosure hierarchy and dual-representation
              accessibility contract:
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed">
              <li>
                <strong className="text-[var(--fg)]">Spatial &amp; Tabular Parity:</strong> Every
                entity on the React Flow canvas is mirrored in a virtualized semantic{" "}
                <code className="font-mono">TopologyTable</code> with full directional keyboard
                navigation.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Non-Visual Signifiers:</strong> Health states
                pair OKLCH color tokens with distinct icons, text labels, edge dash patterns, and a
                5-second throttled <code className="font-mono">aria-live=&quot;polite&quot;</code>{" "}
                announcer.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-surface">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gauge className="h-5 w-5 text-[var(--ok)]" aria-hidden="true" />
              <CardTitle>Performance &amp; Memory Bounds</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              Engineered to sustain 60 FPS interaction and flat heap usage over extended streaming
              sessions:
            </p>
            <ul className="list-inside list-disc space-y-1.5 text-xs leading-relaxed">
              <li>
                <strong className="text-[var(--fg)]">
                  O(1) Ring Buffers &amp; Cascade Cleanup:
                </strong>{" "}
                Fixed-capacity 120-point <code className="font-mono">Float32Array</code> ring
                buffers and atomic cascade deletion prevent unbounded array growth or orphaned map
                entries.
              </li>
              <li>
                <strong className="text-[var(--fg)]">Off-Thread Layout &amp; LOD Grouping:</strong>{" "}
                Incremental <code className="font-mono">elkjs</code> layered layout runs inside a
                dedicated Web Worker, while Level-of-Detail grouping collapses child processes above
                600 visible nodes.
              </li>
            </ul>
          </CardContent>
        </Card>

        <Card className="glass-surface @md:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Cpu className="h-5 w-5 text-[var(--warn)]" aria-hidden="true" />
              <CardTitle>Optimization Advisor</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-[var(--fg-muted)]">
            <p>
              The optimization advisor evaluates compact topology digests (&le;6 KB, SHA-256
              fingerprinted) to generate actionable remediation recommendations. When a Gemini API
              key is configured, recommendations are synthesized via the{" "}
              <code className="font-mono text-xs text-[var(--fg)]">google-genai</code> Interactions
              API with strict Pydantic schema enforcement and a server-side hallucinated-ID
              grounding guard; otherwise, a deterministic SRE queueing heuristic engine provides
              zero-downtime fallback analysis.
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-[var(--fg-subtle)]">
              <ShieldCheck className="h-4 w-4 text-[var(--ok)]" aria-hidden="true" />
              <span>
                Zero raw command-line arguments or environment secrets ever leave the host boundary.
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
