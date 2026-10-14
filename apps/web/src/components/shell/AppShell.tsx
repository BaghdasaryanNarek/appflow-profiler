"use client";

import * as React from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { CommandMenu } from "./CommandMenu";
import { SkipLink } from "@/components/a11y/SkipLink";
import { LiveAnnouncerProvider } from "@/components/a11y/LiveAnnouncer";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

export interface AppShellProps {
  children: React.ReactNode;
  className?: string;
}

export function AppShell({ children, className }: AppShellProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = React.useState(false);

  // Global ⌘K / Ctrl+K keyboard shortcut listener
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandMenuOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <LiveAnnouncerProvider>
      <div className="flex h-dvh w-full overflow-hidden bg-[var(--bg)] text-[var(--fg)]">
        <SkipLink targetId="main-content" />

        {/* Desktop Sidebar */}
        <div className="hidden h-full shrink-0 md:flex">
          <Sidebar
            collapsed={collapsed}
            onToggleCollapse={() => {
              setCollapsed((prev) => !prev);
            }}
          />
        </div>

        {/* Mobile Navigation Drawer */}
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetContent side="left" className="w-72 p-0">
            <SheetTitle className="sr-only">Mobile Navigation</SheetTitle>
            <SheetDescription className="sr-only">
              Navigation menu for smaller screens
            </SheetDescription>
            <Sidebar
              onToggleCollapse={() => {
                setMobileNavOpen(false);
              }}
            />
          </SheetContent>
        </Sheet>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar
            onOpenCommandMenu={() => {
              setCommandMenuOpen(true);
            }}
            onOpenMobileNav={() => {
              setMobileNavOpen(true);
            }}
          />

          <main
            id="main-content"
            tabIndex={-1}
            className={cn("@container flex-1 overflow-y-auto p-4 outline-none md:p-6", className)}
          >
            {children}
          </main>
        </div>

        {/* ⌘K Command Palette */}
        <CommandMenu open={commandMenuOpen} onOpenChange={setCommandMenuOpen} />
      </div>
    </LiveAnnouncerProvider>
  );
}
