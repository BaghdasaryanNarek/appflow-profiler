"use client";

import * as React from "react";
import { CheckCircle2, RefreshCw, AlertCircle, Clock, PauseCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

export type ConnectionStatus =
  | "connected"
  | "reconnecting"
  | "waking"
  | "waking_up"
  | "connecting"
  | "paused"
  | "idle"
  | "error"
  | "disconnected";

export interface ConnectionIndicatorProps {
  status?: ConnectionStatus;
  className?: string;
}

export function ConnectionIndicator({ status: propStatus, className }: ConnectionIndicatorProps) {
  const storeStatus = useUiStore((s) => s.connectionStatus);
  const status: ConnectionStatus = propStatus ?? storeStatus;

  const config = React.useMemo(() => {
    switch (status) {
      case "connected":
        return {
          icon: <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ok)]" />,
          label: "Connected",
          colorClass: "text-[var(--ok)]",
          dotClass: "bg-[var(--ok)]",
        };
      case "reconnecting":
      case "connecting":
        return {
          icon: <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--warn)]" />,
          label: "Reconnecting…",
          colorClass: "text-[var(--warn)]",
          dotClass: "bg-[var(--warn)] animate-pulse",
        };
      case "waking":
      case "waking_up":
        return {
          icon: <Clock className="h-3.5 w-3.5 animate-pulse text-[var(--accent)]" />,
          label: "Waking up demo backend…",
          colorClass: "text-[var(--accent)]",
          dotClass: "bg-[var(--accent)] animate-ping",
        };
      case "paused":
        return {
          icon: <PauseCircle className="h-3.5 w-3.5 text-[var(--fg-muted)]" />,
          label: "Stream paused",
          colorClass: "text-[var(--fg-muted)]",
          dotClass: "bg-[var(--fg-muted)]",
        };
      case "idle":
      case "error":
      case "disconnected":
      default:
        return {
          icon: <AlertCircle className="h-3.5 w-3.5 text-[var(--crit)]" />,
          label: "Disconnected",
          colorClass: "text-[var(--crit)]",
          dotClass: "bg-[var(--crit)]",
        };
    }
  }, [status]);

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-solid)] px-2.5 py-1 text-xs font-medium text-[var(--fg-muted)]",
        className,
      )}
      role="status"
      aria-live="polite"
      data-testid="connection-indicator"
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", config.dotClass)} />
      {config.icon}
      <span className={cn("text-xs font-medium", config.colorClass)}>{config.label}</span>
    </div>
  );
}
