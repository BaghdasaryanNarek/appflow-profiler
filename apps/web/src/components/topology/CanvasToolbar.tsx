"use client";

import * as React from "react";
import {
  Search,
  Server,
  Database,
  Layers,
  Globe,
  TableProperties,
  Network,
  RotateCcw,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui-store";
import type { NodeKind } from "@/types/contracts.gen";

export interface CanvasToolbarProps {
  className?: string | undefined;
}

export const CanvasToolbar = React.memo(function CanvasToolbar({ className }: CanvasToolbarProps) {
  const kinds = useUiStore((s) => s.kinds);
  const setKinds = useUiStore((s) => s.setKinds);
  const minRps = useUiStore((s) => s.minRps);
  const setMinRps = useUiStore((s) => s.setMinRps);
  const searchQuery = useUiStore((s) => s.searchQuery);
  const setSearchQuery = useUiStore((s) => s.setSearchQuery);
  const resetFilters = useUiStore((s) => s.resetFilters);

  const viewMode = useUiStore((s) => s.viewMode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const lodCollapsed = useUiStore((s) => s.lodCollapsed);
  const setLodCollapsed = useUiStore((s) => s.setLodCollapsed);

  const searchInputRef = React.useRef<HTMLInputElement>(null);

  // Keyboard shortcut '/' focuses search
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "/" && document.activeElement?.tagName !== "INPUT") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleKindToggle = (kind: NodeKind) => {
    if (kinds.includes(kind)) {
      setKinds(kinds.filter((k) => k !== kind));
    } else {
      setKinds([...kinds, kind]);
    }
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    React.startTransition(() => {
      setSearchQuery(val);
    });
  };

  const hasActiveFilters = kinds.length > 0 || minRps > 0 || searchQuery.trim().length > 0;

  // Shared by the visible label and aria-label so the name always starts with it (WCAG 2.5.3)
  const lodText = lodCollapsed === true ? "LOD: Grouped" : "LOD: Detail";

  return (
    <div
      className={cn(
        "glass-surface pointer-events-auto flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-solid)]/85 p-2 shadow-lg backdrop-blur-md select-none",
        className,
      )}
      role="search"
      aria-label="Topology Canvas Filters & Controls"
    >
      {/* Search Input */}
      <div className="relative flex min-w-[200px] flex-1 items-center sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-[var(--fg-muted)]" />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          onChange={handleSearchChange}
          placeholder="Filter nodes… (press /)"
          className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] pr-8 pl-8 text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none"
          aria-label="Filter nodes by name or ID"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
            }}
            className="absolute right-1.5 flex h-6 min-h-[24px] w-6 min-w-[24px] items-center justify-center rounded text-sm text-[var(--fg-muted)] hover:text-[var(--fg)] focus-visible:ring-1 focus-visible:ring-[var(--accent)] focus-visible:outline-none"
            aria-label="Clear search query"
          >
            ×
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {/* Node Kind Toggles */}
        <div
          className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
          role="group"
          aria-label="Filter by Node Type"
        >
          <button
            type="button"
            onClick={() => {
              handleKindToggle("service");
            }}
            className={cn(
              "flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors",
              kinds.includes("service")
                ? "bg-[var(--accent)] font-semibold text-[var(--primary-foreground)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
            aria-pressed={kinds.includes("service")}
            title="Toggle Services"
          >
            <Server className="h-3 w-3" />
            <span className="hidden sm:inline">Service</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleKindToggle("datastore");
            }}
            className={cn(
              "flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors",
              kinds.includes("datastore")
                ? "bg-[var(--accent)] font-semibold text-[var(--primary-foreground)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
            aria-pressed={kinds.includes("datastore")}
            title="Toggle Datastores"
          >
            <Database className="h-3 w-3" />
            <span className="hidden sm:inline">Data</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleKindToggle("queue");
            }}
            className={cn(
              "flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors",
              kinds.includes("queue")
                ? "bg-[var(--accent)] font-semibold text-[var(--primary-foreground)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
            aria-pressed={kinds.includes("queue")}
            title="Toggle Queues"
          >
            <Layers className="h-3 w-3" />
            <span className="hidden sm:inline">Queue</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleKindToggle("external");
            }}
            className={cn(
              "flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors",
              kinds.includes("external")
                ? "bg-[var(--accent)] font-semibold text-[var(--primary-foreground)]"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
            aria-pressed={kinds.includes("external")}
            title="Toggle External Services"
          >
            <Globe className="h-3 w-3" />
            <span className="hidden sm:inline">Ext</span>
          </button>
        </div>

        {/* Min RPS Filter Presets */}
        <div
          className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
          role="group"
          aria-label="Filter by minimum RPS"
        >
          {[0, 10, 50, 200].map((threshold) => (
            <button
              key={threshold}
              type="button"
              onClick={() => {
                setMinRps(threshold);
              }}
              className={cn(
                "h-7 rounded px-2 font-mono text-[11px] transition-colors",
                minRps === threshold
                  ? "bg-[var(--surface-solid)] font-bold text-[var(--accent)] shadow-sm"
                  : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
              )}
              aria-pressed={minRps === threshold}
            >
              {threshold === 0 ? "All" : `>${String(threshold)}`}
            </button>
          ))}
        </div>

        {/* LOD Toggle */}
        <button
          type="button"
          onClick={() => {
            const next = lodCollapsed === true ? false : true;
            setLodCollapsed(next);
          }}
          className={cn(
            "flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-xs transition-colors",
            lodCollapsed === true
              ? "bg-[var(--surface)] font-semibold text-[var(--accent)]"
              : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
          )}
          title="Toggle Level of Detail Grouping"
          aria-label={`${lodText}, toggle level of detail grouping`}
          aria-pressed={lodCollapsed === true}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{lodText}</span>
        </button>

        {/* View Mode Toggle (Canvas vs Accessible Table) */}
        <div
          className="flex items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] p-0.5"
          role="group"
          aria-label="Toggle View Presentation"
        >
          <button
            type="button"
            onClick={() => {
              setViewMode("canvas");
            }}
            className={cn(
              "flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors",
              viewMode === "canvas"
                ? "bg-[var(--surface-solid)] font-bold text-[var(--accent)] shadow-sm"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
            title="Topology Canvas View"
            aria-label="Topology Canvas View"
            aria-pressed={viewMode === "canvas"}
          >
            <Network className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Canvas</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setViewMode("table");
            }}
            className={cn(
              "flex h-7 items-center gap-1 rounded px-2 text-xs transition-colors",
              viewMode === "table"
                ? "bg-[var(--surface-solid)] font-bold text-[var(--accent)] shadow-sm"
                : "text-[var(--fg-muted)] hover:text-[var(--fg)]",
            )}
            title="Accessible Table View (T)"
            aria-label="Accessible Table View"
            aria-pressed={viewMode === "table"}
          >
            <TableProperties className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Table</span>
          </button>
        </div>

        {/* Reset Filters */}
        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-xs text-[var(--warn)] hover:bg-[var(--surface-solid)]"
            title="Reset active filters"
            aria-label="Reset active filters"
          >
            <RotateCcw className="h-3 w-3" />
            <span className="hidden lg:inline">Reset</span>
          </button>
        )}
      </div>
    </div>
  );
});
