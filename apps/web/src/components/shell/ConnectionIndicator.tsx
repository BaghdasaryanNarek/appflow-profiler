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
  const reconnectAttempt = useUiStore((s) => s.reconnectAttempt);
  const status: ConnectionStatus = propStatus ?? storeStatus;
  const isWaking = status === "waking" || status === "waking_up";

  const config = React.useMemo(() => {
    switch (status) {
      case "connected":
        return {
          icon: <CheckCircle2 className="h-3.5 w-3.5 text-[var(--ok)]" />,
          label: "Connected",
          title: "Real-time topology WebSocket stream active",
          colorClass: "text-[var(--ok)]",
          dotClass: "bg-[var(--ok)]",
        };
      case "reconnecting":
      case "connecting":
        return {
          icon: <RefreshCw className="h-3.5 w-3.5 animate-spin text-[var(--warn)]" />,
          label: "Reconnecting…",
          title: "Connecting to real-time topology stream",
          colorClass: "text-[var(--warn)]",
          dotClass: "bg-[var(--warn)] animate-pulse",
        };
      case "waking":
      case "waking_up":
        return {
          icon: <Clock className="h-3.5 w-3.5 animate-pulse text-[var(--accent)]" />,
          label: "Waking up demo backend…",
          title:
            "Hosted demo backend is waking from Render free-tier cold sleep (~30s). Retrying automatically with exponential backoff.",
          colorClass: "text-[var(--accent)]",
          dotClass: "bg-[var(--accent)] animate-ping",
        };
      case "paused":
        return {
          icon: <PauseCircle className="h-3.5 w-3.5 text-[var(--fg-muted)]" />,
          label: "Stream paused",
          title: "Real-time stream paused while tab is in background",
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
          title: "WebSocket stream disconnected",
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
      title={config.title}
      data-testid="connection-indicator"
    >
      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", config.dotClass)} />
      {config.icon}
      <span className={cn("text-xs font-medium", config.colorClass)}>{config.label}</span>
      {isWaking && (
        <span className="font-mono text-[10px] text-[var(--fg-muted)]" data-testid="cold-start-eta">
          (~30s{reconnectAttempt > 0 ? ` · #${String(reconnectAttempt)}` : ""})
        </span>
      )}
    </div>
  );
}
