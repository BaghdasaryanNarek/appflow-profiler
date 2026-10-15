"use client";

import * as React from "react";
import {
  Server,
  Database,
  Layers,
  Globe,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface LegendProps {
  className?: string | undefined;
}

export const Legend = React.memo(function Legend({ className }: LegendProps) {
  const [isOpen, setIsOpen] = React.useState(true);

  return (
    <aside
      className={cn(
        "glass-surface pointer-events-auto rounded-lg border border-[var(--border)] bg-[var(--surface-solid)]/85 p-2.5 shadow-lg backdrop-blur-md transition-all select-none",
        className,
      )}
      aria-label="Topology Legend"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] font-bold tracking-wider text-[var(--fg-muted)] uppercase">
          Legend
        </span>
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
          }}
          className="flex h-6 min-h-[24px] w-6 min-w-[24px] items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
          aria-expanded={isOpen}
          aria-label={isOpen ? "Collapse legend" : "Expand legend"}
        >
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </button>
      </div>

      {isOpen && (
        <div className="mt-2.5 flex flex-col gap-2.5 border-t border-[var(--border)] pt-2 font-mono text-[10px]">
          {/* Node Kinds */}
          <div>
            <span className="text-[9px] tracking-wider text-[var(--fg-muted)] uppercase">
              Entity Types
            </span>
            <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-[var(--fg)]">
              <div className="flex items-center gap-1.5">
                <Server className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                <span>Service</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Database className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                <span>Datastore</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Layers className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                <span>Queue</span>
              </div>
              <div className="flex items-center gap-1.5">
                <Globe className="h-3 w-3 text-[var(--accent)]" aria-hidden="true" />
                <span>External</span>
              </div>
            </div>
          </div>

          {/* Health States (Dual encoded by color + line dash style) */}
          <div className="border-t border-[var(--border)] pt-1.5">
            <span className="text-[9px] tracking-wider text-[var(--fg-muted)] uppercase">
              Health & Stroke
            </span>
            <div className="mt-1 flex flex-col gap-1 text-[var(--fg)]">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-3 w-3 text-[var(--ok)]" aria-hidden="true" />
                  <span>Healthy</span>
                </div>
                <svg width="40" height="6" className="shrink-0" aria-hidden="true">
                  <line x1="0" y1="3" x2="40" y2="3" stroke="var(--ok)" strokeWidth="2" />
                </svg>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <AlertTriangle className="h-3 w-3 text-[var(--warn)]" aria-hidden="true" />
                  <span>Degraded</span>
                </div>
                <svg width="40" height="6" className="shrink-0" aria-hidden="true">
                  <line
                    x1="0"
                    y1="3"
                    x2="40"
                    y2="3"
                    stroke="var(--warn)"
                    strokeWidth="2"
                    strokeDasharray="6 3"
                  />
                </svg>
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <AlertOctagon className="h-3 w-3 text-[var(--crit)]" aria-hidden="true" />
                  <span>Critical</span>
                </div>
                <svg width="40" height="6" className="shrink-0" aria-hidden="true">
                  <line
                    x1="0"
                    y1="3"
                    x2="40"
                    y2="3"
                    stroke="var(--crit)"
                    strokeWidth="2"
                    strokeDasharray="2 2"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Traffic scale */}
          <div className="border-t border-[var(--border)] pt-1.5 text-[var(--fg-muted)]">
            <span className="text-[9px] tracking-wider uppercase">Edge Width</span>
            <p className="mt-0.5 text-[9px] leading-tight text-[var(--fg-muted)]">
              Log-scaled proportional to RPS (1.5px – 8px)
            </p>
          </div>
        </div>
      )}
    </aside>
  );
});
