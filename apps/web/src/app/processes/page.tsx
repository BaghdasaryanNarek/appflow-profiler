import type { Metadata } from "next";
import { TableProperties } from "lucide-react";

export const metadata: Metadata = {
  title: "Processes | AppFlow Profiler",
  description: "Tabular view of observed operating system processes and active socket connections",
};

export default function ProcessesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--fg)]">
          Process & Service Table
        </h1>
        <p className="text-sm text-[var(--fg-muted)]">
          Accessible, virtualized table view of operating system processes, threads, and network
          sockets.
        </p>
      </div>

      <div
        className="glass-surface flex min-h-[400px] flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-8 text-center"
        data-testid="processes-table-placeholder"
      >
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--accent)]">
          <TableProperties className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-[var(--fg)]">Virtualized Process Table</h2>
        <p className="mt-1 max-w-md text-xs text-[var(--fg-muted)]">
          Accessible TanStack table with column sorting, process search, RSS memory usage, and
          socket status breakdown will mount here in Phase 12.
        </p>
      </div>
    </div>
  );
}
