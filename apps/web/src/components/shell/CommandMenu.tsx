"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
  Maximize2,
  ZoomIn,
  ZoomOut,
  Lock,
  Unlock,
  Clock,
  Database,
  Radio,
} from "lucide-react";
import { startViewTransition } from "@/lib/view-transition";
import { activateScenario, resetSimulation } from "@/lib/api/client";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";

export interface CommandMenuProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const router = useRouter();
  const setScenario = useTopologyStore((s) => s.setScenario);
  const nodes = useTopologyStore((s) => s.nodes);

  const selectNode = useUiStore((s) => s.selectNode);
  const setViewMode = useUiStore((s) => s.setViewMode);
  const viewMode = useUiStore((s) => s.viewMode);
  const lodCollapsed = useUiStore((s) => s.lodCollapsed);
  const setLodCollapsed = useUiStore((s) => s.setLodCollapsed);
  const layoutLocked = useUiStore((s) => s.layoutLocked);
  const toggleLayoutLocked = useUiStore((s) => s.toggleLayoutLocked);
  const triggerCanvasAction = useUiStore((s) => s.triggerCanvasAction);

  const runCommand = React.useCallback(
    (command: () => void | Promise<void>) => {
      onOpenChange(false);
      void Promise.resolve(command()).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to execute command";
        toast.error(msg);
      });
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

  const handleActivateScenario = React.useCallback(
    (id: string, name: string) => {
      runCommand(async () => {
        try {
          const scenario = await activateScenario(id);
          setScenario(scenario);
          toast.success(`Simulation activated: ${name}`);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Failed to activate scenario";
          toast.error(msg);
        }
      });
    },
    [runCommand, setScenario],
  );

  const handleResetSimulation = React.useCallback(() => {
    runCommand(async () => {
      try {
        await resetSimulation();
        setScenario(null);
        toast.success("Simulation reset to baseline steady state");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to reset simulation";
        toast.error(msg);
      }
    });
  }, [runCommand, setScenario]);

  // Derive up to 15 nodes for quick jump in search
  const nodeList = React.useMemo(() => {
    return Array.from(nodes.values()).slice(0, 15);
  }, [nodes]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="AppFlow Command Palette"
      description="Navigate to dashboard views, trigger canvas actions, or switch simulation scenarios"
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

        <CommandGroup heading="Canvas Actions">
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                navigateTo("/topology");
                triggerCanvasAction("fit-view");
              });
            }}
          >
            <Maximize2 className="mr-2 h-4 w-4 text-[var(--accent)]" />
            <span>Fit Canvas to View</span>
            <CommandShortcut>0</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                triggerCanvasAction("zoom-in");
              });
            }}
          >
            <ZoomIn className="mr-2 h-4 w-4 text-[var(--fg-muted)]" />
            <span>Zoom In</span>
            <CommandShortcut>+</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                triggerCanvasAction("zoom-out");
              });
            }}
          >
            <ZoomOut className="mr-2 h-4 w-4 text-[var(--fg-muted)]" />
            <span>Zoom Out</span>
            <CommandShortcut>-</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                triggerCanvasAction("relayout");
                toast.info("Recomputing hierarchical layout");
              });
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4 text-[var(--fg-muted)]" />
            <span>Recompute Hierarchical Layout</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                toggleLayoutLocked();
                toast.info(layoutLocked ? "Layout unlocked" : "Layout locked");
              });
            }}
          >
            {layoutLocked ? (
              <Unlock className="mr-2 h-4 w-4 text-[var(--warn)]" />
            ) : (
              <Lock className="mr-2 h-4 w-4 text-[var(--fg-muted)]" />
            )}
            <span>{layoutLocked ? "Unlock Canvas Layout" : "Lock Canvas Layout"}</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                const nextLod = lodCollapsed === true ? false : true;
                setLodCollapsed(nextLod);
                toast.info(
                  nextLod ? "LOD: Collapsed into service groups" : "LOD: Expanded full detail",
                );
              });
            }}
          >
            <Layers className="mr-2 h-4 w-4 text-[var(--accent)]" />
            <span>Toggle Level of Detail (LOD)</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              runCommand(() => {
                const nextMode = viewMode === "canvas" ? "table" : "canvas";
                setViewMode(nextMode);
                toast.info(`Switched to ${nextMode} view`);
              });
            }}
          >
            <TableProperties className="mr-2 h-4 w-4 text-[var(--accent)]" />
            <span>
              Switch to {viewMode === "canvas" ? "Accessible Table View" : "Topology Canvas"}
            </span>
            <CommandShortcut>T</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Simulation Scenarios">
          <CommandItem
            onSelect={() => {
              handleResetSimulation();
            }}
          >
            <Activity className="mr-2 h-4 w-4 text-[var(--ok)]" />
            <span>Baseline Steady State</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              handleActivateScenario("request-storm", "Request Storm (Traffic Spike)");
            }}
          >
            <Zap className="mr-2 h-4 w-4 text-[var(--warn)]" />
            <span>Request Storm (Traffic Spike)</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              handleActivateScenario("db-pool-exhaustion", "Database Pool Exhaustion");
            }}
          >
            <Database className="mr-2 h-4 w-4 text-[var(--crit)]" />
            <span>Database Pool Exhaustion</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              handleActivateScenario("cache-stampede", "Cache Stampede Anomaly");
            }}
          >
            <Flame className="mr-2 h-4 w-4 text-[var(--crit)]" />
            <span>Cache Stampede Anomaly</span>
          </CommandItem>
          <CommandItem
            onSelect={() => {
              handleActivateScenario("slow-dependency", "Slow Downstream Dependency");
            }}
          >
            <Clock className="mr-2 h-4 w-4 text-[var(--warn)]" />
            <span>Slow Downstream Dependency</span>
          </CommandItem>
        </CommandGroup>

        {nodeList.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Jump to Live Node">
              {nodeList.map((node) => (
                <CommandItem
                  key={node.id}
                  value={`node ${node.label} ${node.id} ${node.kind}`}
                  onSelect={() => {
                    runCommand(() => {
                      selectNode(node.id);
                      navigateTo("/topology");
                      triggerCanvasAction("fit-view");
                    });
                  }}
                >
                  <Radio className="mr-2 h-4 w-4 text-[var(--accent)]" />
                  <span className="font-mono text-xs">{node.label}</span>
                  <span className="ml-2 text-[10px] text-[var(--fg-muted)]">({node.kind})</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
