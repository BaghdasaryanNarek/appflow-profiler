"use client";

import * as React from "react";
import { ModeBadge } from "./ModeBadge";
import { ConnectionIndicator, type ConnectionStatus } from "./ConnectionIndicator";
import { Button } from "@/components/ui/button";
import { Search, Menu } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TopBarProps {
  onOpenCommandMenu?: () => void;
  onOpenMobileNav?: () => void;
  connectionStatus?: ConnectionStatus;
  mode?: "live" | "demo" | "test";
  activeScenario?: string;
  className?: string;
}

export function TopBar({
  onOpenCommandMenu,
  onOpenMobileNav,
  connectionStatus = "connected",
  mode = "demo",
  activeScenario,
  className,
}: TopBarProps) {
  return (
    <header
      className={cn(
        "glass-surface flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface-solid)] px-4 select-none",
        className,
      )}
      aria-label="Top Navigation"
    >
      <div className="flex items-center gap-3">
        {onOpenMobileNav && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onOpenMobileNav}
            className="text-[var(--fg-muted)] hover:text-[var(--fg)] md:hidden"
            aria-label="Open mobile navigation"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <ModeBadge mode={mode} />
        {activeScenario && (
          <span className="hidden items-center border-l border-[var(--border)] pl-3 font-mono text-xs text-[var(--fg-muted)] sm:inline-flex">
            Scenario: <strong className="ml-1 text-[var(--fg)]">{activeScenario}</strong>
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <ConnectionIndicator status={connectionStatus} />

        {onOpenCommandMenu && (
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenCommandMenu}
            className="hidden h-8 items-center gap-2 border-[var(--border)] bg-[var(--surface)] px-2.5 text-xs font-normal text-[var(--fg-muted)] hover:text-[var(--fg)] sm:inline-flex"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Search or command…</span>
            <kbd className="pointer-events-none inline-flex h-4 items-center gap-0.5 rounded border border-[var(--border)] bg-[var(--surface-solid)] px-1.5 font-mono text-[10px] font-medium text-[var(--fg-muted)] select-none">
              ⌘K
            </kbd>
          </Button>
        )}
      </div>
    </header>
  );
}
