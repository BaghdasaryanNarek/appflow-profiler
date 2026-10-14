"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Network,
  TableProperties,
  Sparkles,
  Info,
  ChevronLeft,
  ChevronRight,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TransitionLink } from "@/lib/view-transition";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
}

const navItems: NavItem[] = [
  { name: "Topology", href: "/topology", icon: Network, shortcut: "⌘1" },
  {
    name: "Processes",
    href: "/processes",
    icon: TableProperties,
    shortcut: "⌘2",
  },
  { name: "Insights", href: "/insights", icon: Sparkles, shortcut: "⌘3" },
  { name: "About", href: "/about", icon: Info, shortcut: "⌘4" },
];

export interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  className?: string;
}

export function Sidebar({ collapsed = false, onToggleCollapse, className }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "glass-surface flex h-full flex-col border-r border-[var(--border)] bg-[var(--surface-solid)] transition-all duration-300 select-none",
        collapsed ? "w-16" : "w-64",
        className,
      )}
      aria-label="Primary Navigation"
    >
      {/* Brand Header */}
      <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
        <TransitionLink
          href="/topology"
          className="flex items-center gap-2.5 font-semibold tracking-tight text-[var(--fg)] focus:outline-none"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent)] font-bold text-neutral-950 shadow-sm">
            <Activity className="h-5 w-5" />
          </div>
          {!collapsed && <span className="text-base font-semibold tracking-tight">AppFlow</span>}
        </TransitionLink>

        {onToggleCollapse && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleCollapse}
            className="hidden h-8 w-8 text-[var(--fg-muted)] hover:text-[var(--fg)] md:inline-flex"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        )}
      </div>

      {/* Nav Links */}
      <TooltipProvider delayDuration={200}>
        <nav className="flex-1 space-y-1 p-2" aria-label="Main Navigation">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            const Icon = item.icon;

            const linkContent = (
              <TransitionLink
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex min-h-[36px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:outline-none",
                  isActive
                    ? "border-l-2 border-[var(--accent)] bg-[var(--surface)] pl-2.5 font-semibold text-[var(--fg)] shadow-sm"
                    : "text-[var(--fg-muted)] hover:bg-[var(--surface)] hover:text-[var(--fg)]",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-[var(--accent)]" : "text-[var(--fg-muted)]",
                  )}
                />
                {!collapsed && <span>{item.name}</span>}
              </TransitionLink>
            );

            if (collapsed) {
              return (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                  <TooltipContent side="right" sideOffset={12}>
                    <p className="font-medium">{item.name}</p>
                  </TooltipContent>
                </Tooltip>
              );
            }

            return linkContent;
          })}
        </nav>
      </TooltipProvider>

      {/* Footer Info */}
      {!collapsed && (
        <div className="border-t border-[var(--border)] p-3 text-xs text-[var(--fg-muted)]">
          <p className="font-mono text-[10px] tracking-wider text-neutral-400 uppercase">
            Engine v1.0 • Profiler
          </p>
        </div>
      )}
    </aside>
  );
}
