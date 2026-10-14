"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Network,
  TableProperties,
  Sparkles,
  Info,
  Flame,
  Zap,
  Activity,
  Layers,
  RotateCcw,
} from "lucide-react";
import { startViewTransition } from "@/lib/view-transition";

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter();

  const runCommand = React.useCallback(
    (command: () => void) => {
      onOpenChange(false);
      command();
    },
    [onOpenChange],
  );

  const navigateTo = React.useCallback(
    (href: string) => {
      runCommand(() => {
        void startViewTransition(() => {
          router.push(href);
        });
      });
    },
    [router, runCommand],
  );

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="AppFlow Command Palette"
      description="Navigate to dashboard views or switch simulation scenarios"
    >
      <CommandInput placeholder="Type a command or search…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => {
              navigateTo("/topology");
            }}
          >
            <Network className="mr-2 h-4 w-4 text-[var(--accent)]" />
            <span>Topology Canvas</span>
            <CommandShortcut>G T</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigateTo("/processes");
            }}
          >
            <TableProperties className="mr-2 h-4 w-4 text-[var(--accent)]" />
            <span>Process & Socket Table</span>
            <CommandShortcut>G P</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigateTo("/insights");
            }}
          >
            <Sparkles className="mr-2 h-4 w-4 text-[var(--warn)]" />
            <span>Optimization Advisor</span>
            <CommandShortcut>G I</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              navigateTo("/about");
            }}
          >
            <Info className="mr-2 h-4 w-4 text-[var(--fg-muted)]" />
            <span>About AppFlow</span>
            <CommandShortcut>G A</CommandShortcut>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Simulation Scenarios">
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                /* Handled in simulation store */
              });
            }}
          >
            <Activity className="mr-2 h-4 w-4 text-[var(--ok)]" />
            <span>Baseline Steady State</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                /* Handled in simulation store */
              });
            }}
          >
            <Zap className="mr-2 h-4 w-4 text-[var(--warn)]" />
            <span>Traffic Spike Scenario</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                /* Handled in simulation store */
              });
            }}
          >
            <Flame className="mr-2 h-4 w-4 text-[var(--crit)]" />
            <span>Cascading Service Failure</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                /* Handled in simulation store */
              });
            }}
          >
            <Layers className="mr-2 h-4 w-4 text-[var(--warn)]" />
            <span>Gradual Memory Leak</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Canvas Actions">
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                /* Reset layout hook */
              });
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4 text-[var(--fg-muted)]" />
            <span>Reset Canvas Layout</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
