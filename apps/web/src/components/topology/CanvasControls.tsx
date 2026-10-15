"use client";

import * as React from "react";
import { useReactFlow } from "@xyflow/react";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Lock, Unlock } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";

export interface CanvasControlsProps {
  className?: string | undefined;
  onRelayout?: (() => void) | undefined;
}

export const CanvasControls = React.memo(function CanvasControls({
  className,
  onRelayout,
}: CanvasControlsProps) {
  const { zoomIn, zoomOut, fitView } = useReactFlow();
  const layoutLocked = useUiStore((s) => s.layoutLocked);
  const toggleLayoutLocked = useUiStore((s) => s.toggleLayoutLocked);

  const handleFitView = React.useCallback(() => {
    void fitView({ padding: 0.15, duration: 400 });
  }, [fitView]);

  return (
    <div
      className={cn(
        "glass-surface pointer-events-auto flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface-solid)]/85 p-1 shadow-lg backdrop-blur-md select-none",
        className,
      )}
      role="toolbar"
      aria-label="Canvas Navigation Controls"
    >
      <button
        type="button"
        onClick={() => {
          void zoomIn({ duration: 250 });
        }}
        className="flex h-8 w-8 items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        title="Zoom In (+)"
        aria-label="Zoom In"
      >
        <ZoomIn className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => {
          void zoomOut({ duration: 250 });
        }}
        className="flex h-8 w-8 items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        title="Zoom Out (-)"
        aria-label="Zoom Out"
      >
        <ZoomOut className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={handleFitView}
        className="flex h-8 w-8 items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
        title="Fit to View (0)"
        aria-label="Fit to View"
      >
        <Maximize2 className="h-4 w-4" />
      </button>

      <div className="h-4 w-[1px] bg-[var(--border)]" />

      {onRelayout && (
        <button
          type="button"
          onClick={onRelayout}
          className="flex h-8 w-8 items-center justify-center rounded text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)]"
          title="Recompute Hierarchical Layout"
          aria-label="Recompute Hierarchical Layout"
        >
          <RotateCcw className="h-4 w-4" />
        </button>
      )}

      <button
        type="button"
        onClick={toggleLayoutLocked}
        className={cn(
          "flex h-8 w-8 items-center justify-center rounded transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)]",
          layoutLocked
            ? "text-[var(--warn)] hover:bg-[var(--warn)]/10"
            : "text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]",
        )}
        title={layoutLocked ? "Unlock Canvas Layout" : "Lock Canvas Layout"}
        aria-label={layoutLocked ? "Unlock Canvas Layout" : "Lock Canvas Layout"}
        aria-pressed={layoutLocked}
      >
        {layoutLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
      </button>
    </div>
  );
});
