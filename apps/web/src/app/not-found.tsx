import type { Metadata } from "next";
import { TransitionLink } from "@/lib/view-transition";
import { Button } from "@/components/ui/button";
import { AlertCircle, ArrowLeft } from "lucide-react";

export const metadata: Metadata = {
  title: "404 - Page Not Found | AppFlow Profiler",
  description: "The requested dashboard view could not be located.",
};

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4 p-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface-solid)] text-[var(--warn)]">
        <AlertCircle className="h-7 w-7" />
      </div>

      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">Page Not Found</h1>
        <p className="max-w-sm text-sm text-[var(--fg-muted)]">
          The requested view does not exist in the AppFlow dashboard topology.
        </p>
      </div>

      <Button asChild variant="outline" className="mt-4">
        <TransitionLink href="/topology" className="flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" />
          <span>Return to Topology</span>
        </TransitionLink>
      </Button>
    </div>
  );
}
