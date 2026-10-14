"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Activity, Cpu } from "lucide-react";
import { useTopologyStore } from "@/store/topology-store";

export interface ModeBadgeProps {
  mode?: "live" | "demo" | "test";
  className?: string;
}

export function ModeBadge({ mode: propMode, className }: ModeBadgeProps) {
  const storeMode = useTopologyStore((s) => s.meta?.mode);
  const mode = propMode ?? storeMode ?? "demo";
  const isLive = mode === "live";

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="inline-flex cursor-default">
            <Badge
              variant={isLive ? "ok" : "outline"}
              className={`flex items-center gap-1.5 px-2 py-0.5 text-xs font-semibold tracking-wider uppercase ${className ?? ""}`}
              data-testid="mode-badge"
            >
              {isLive ? (
                <>
                  <Activity className="h-3 w-3 text-[var(--ok)]" />
                  <span>LIVE</span>
                </>
              ) : (
                <>
                  <Cpu className="h-3 w-3 text-[var(--accent)]" />
                  <span>SIMULATION</span>
                </>
              )}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">
            {isLive
              ? "Live OS-level process connections via psutil"
              : "Deterministic synthetic simulation with simulated scenarios"}
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
