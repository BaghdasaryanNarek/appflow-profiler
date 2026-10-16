"use client";

import * as React from "react";
import { CheckCircle2, Radio, Server } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useTopologyStore } from "@/store/topology-store";

/**
 * Displays live engine metadata and negotiated capabilities from `useTopologyStore`
 * when connected, or baseline architecture defaults when offline.
 */
export function AboutCapabilitiesStrip(): React.JSX.Element {
  const meta = useTopologyStore((state) => state.meta);

  const mode = meta?.mode ?? "demo";
  const version = meta?.version ?? "0.1.0";
  const tickMs = meta?.tick_ms ?? 1000;
  const maxNodes = meta?.limits.max_nodes ?? 2500;
  const capabilities = meta?.capabilities ?? {
    per_process_io: false,
    connection_owner: true,
    ai_advisor: true,
    scenarios: true,
  };

  return (
    <section
      aria-label="Live runtime capabilities"
      data-testid="about-capabilities-strip"
      className="glass-surface @container rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-4"
    >
      <div className="flex flex-col gap-3 @md:flex-row @md:items-center @md:justify-between">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--accent)]/30 bg-[var(--accent)]/15 text-[var(--accent)]">
            <Server className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-semibold tracking-wider text-[var(--fg)] uppercase">
                Runtime Capability Matrix
              </h2>
              <Badge variant="outline" className="font-mono tabular-nums">
                v{version}
              </Badge>
              <Badge variant={mode === "live" ? "ok" : "default"} className="font-mono uppercase">
                {mode}
              </Badge>
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-[var(--fg-muted)] tabular-nums">
              Tick Interval: {tickMs}ms · Max Graph Capacity: {maxNodes} nodes
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <CapabilityPill label="Connection Owner" enabled={capabilities.connection_owner} />
          <CapabilityPill label="Per-Process I/O" enabled={capabilities.per_process_io} />
          <CapabilityPill label="AI Advisor" enabled={capabilities.ai_advisor} />
          <CapabilityPill label="Chaos Scenarios" enabled={capabilities.scenarios} />
        </div>
      </div>
    </section>
  );
}

function CapabilityPill({
  label,
  enabled,
}: {
  readonly label: string;
  readonly enabled: boolean;
}): React.JSX.Element {
  return (
    <span
      className={
        enabled
          ? "inline-flex items-center gap-1.5 rounded-md border border-[var(--ok)]/35 bg-[var(--ok)]/10 px-2.5 py-1 text-xs font-medium text-[var(--fg)]"
          : "inline-flex items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-xs font-medium text-[var(--fg-muted)]"
      }
    >
      {enabled ? (
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[var(--ok)]" aria-hidden="true" />
      ) : (
        <Radio className="h-3.5 w-3.5 shrink-0 text-[var(--fg-subtle)]" aria-hidden="true" />
      )}
      <span>{label}</span>
    </span>
  );
}
