"use client";

import * as React from "react";
import type { ConnState, SocketInfo } from "@/types/contracts.gen";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";

export interface SocketTableProps {
  sockets: readonly SocketInfo[];
  maxHeight?: number;
  className?: string;
}

type SortColumn = "protocol" | "local" | "remote" | "state" | "pid";
type SortDirection = "asc" | "desc";

const ROW_HEIGHT = 38;
const OVERSCAN = 6;

const STATE_BADGE_CLASSES: Record<ConnState, string> = {
  ESTABLISHED: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  LISTEN: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  SYN_SENT: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  SYN_RECV: "bg-indigo-500/15 text-indigo-400 border-indigo-500/30",
  FIN_WAIT1: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  FIN_WAIT2: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  TIME_WAIT: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  CLOSE_WAIT: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  LAST_ACK: "bg-red-500/15 text-red-400 border-red-500/30",
  CLOSING: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  CLOSE: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  NONE: "bg-zinc-600/15 text-zinc-400 border-zinc-600/30",
};

export const SocketTable = React.memo(function SocketTable({
  sockets,
  maxHeight = 360,
  className,
}: SocketTableProps) {
  const [search, setSearch] = React.useState("");
  const [selectedState, setSelectedState] = React.useState<string>("ALL");
  const [sortCol, setSortCol] = React.useState<SortColumn>("state");
  const [sortDir, setSortDir] = React.useState<SortDirection>("asc");

  const [scrollTop, setScrollTop] = React.useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Filter sockets by search query & state
  const filteredSockets = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return sockets.filter((sock) => {
      if (selectedState !== "ALL" && sock.state !== selectedState) {
        return false;
      }
      if (!q) return true;

      const localStr = `${sock.local_addr}:${String(sock.local_port)}`.toLowerCase();
      const remoteStr =
        sock.remote_addr !== null && sock.remote_addr !== undefined
          ? `${sock.remote_addr}:${String(sock.remote_port ?? "")}`.toLowerCase()
          : "";
      const pidStr = sock.pid !== null && sock.pid !== undefined ? String(sock.pid) : "";
      const stateStr = sock.state.toLowerCase();
      const protoStr = sock.protocol.toLowerCase();

      return (
        localStr.includes(q) ||
        remoteStr.includes(q) ||
        pidStr.includes(q) ||
        stateStr.includes(q) ||
        protoStr.includes(q)
      );
    });
  }, [sockets, search, selectedState]);

  // Sort filtered sockets
  const sortedSockets = React.useMemo(() => {
    return [...filteredSockets].sort((a, b) => {
      let cmp = 0;
      switch (sortCol) {
        case "protocol":
          cmp = a.protocol.localeCompare(b.protocol);
          break;
        case "local": {
          const aLocal = `${a.local_addr}:${String(a.local_port)}`;
          const bLocal = `${b.local_addr}:${String(b.local_port)}`;
          cmp = aLocal.localeCompare(bLocal);
          break;
        }
        case "remote": {
          const aRemote = a.remote_addr ? `${a.remote_addr}:${String(a.remote_port ?? "")}` : "";
          const bRemote = b.remote_addr ? `${b.remote_addr}:${String(b.remote_port ?? "")}` : "";
          cmp = aRemote.localeCompare(bRemote);
          break;
        }
        case "state":
          cmp = a.state.localeCompare(b.state);
          break;
        case "pid": {
          const aPid = a.pid ?? -1;
          const bPid = b.pid ?? -1;
          cmp = aPid - bPid;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filteredSockets, sortCol, sortDir]);

  // Handle header sorting click
  const handleSort = (col: SortColumn) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
  };

  // Scroll handler for windowed virtualization
  const onScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Compute virtualized window
  const totalRows = sortedSockets.length;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(maxHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(totalRows, startIndex + visibleCount);

  const topSpacerHeight = startIndex * ROW_HEIGHT;
  const bottomSpacerHeight = Math.max(0, (totalRows - endIndex) * ROW_HEIGHT);

  const visibleSockets = sortedSockets.slice(startIndex, endIndex);

  const getAriaSort = (col: SortColumn): "ascending" | "descending" | "none" => {
    if (sortCol !== col) return "none";
    return sortDir === "asc" ? "ascending" : "descending";
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-md border border-[var(--border)] bg-[var(--surface)] p-3 text-xs",
        className,
      )}
    >
      {/* Controls & Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <div className="relative min-w-[180px] flex-1">
          <Search
            className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--fg-subtle)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Filter sockets by IP, port, PID..."
            aria-label="Filter sockets"
            className="h-8 w-full rounded-md border border-[var(--border)] bg-[var(--surface-raised)] pr-2.5 pl-8 text-xs text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label htmlFor="socket-state-filter" className="text-[11px] text-[var(--fg-subtle)]">
            State:
          </label>
          <select
            id="socket-state-filter"
            value={selectedState}
            onChange={(e) => {
              setSelectedState(e.target.value);
            }}
            className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface-raised)] px-2 text-xs text-[var(--fg)] focus:border-[var(--accent)] focus:outline-none"
          >
            <option value="ALL">All States</option>
            <option value="ESTABLISHED">ESTABLISHED</option>
            <option value="LISTEN">LISTEN</option>
            <option value="TIME_WAIT">TIME_WAIT</option>
            <option value="CLOSE_WAIT">CLOSE_WAIT</option>
            <option value="SYN_SENT">SYN_SENT</option>
            <option value="SYN_RECV">SYN_RECV</option>
            <option value="FIN_WAIT1">FIN_WAIT1</option>
            <option value="FIN_WAIT2">FIN_WAIT2</option>
            <option value="LAST_ACK">LAST_ACK</option>
            <option value="CLOSING">CLOSING</option>
            <option value="CLOSE">CLOSE</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between text-[11px] text-[var(--fg-subtle)]">
        <span>
          Showing {formatNumber(sortedSockets.length)} of {formatNumber(sockets.length)} sockets
        </span>
        {filteredSockets.length !== sockets.length && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSelectedState("ALL");
            }}
            className="text-[var(--accent)] hover:underline"
          >
            Reset filter
          </button>
        )}
      </div>

      {/* Virtualized Table Scroll Container */}
      <div
        ref={scrollContainerRef}
        onScroll={onScroll}
        style={{ maxHeight }}
        className="w-full overflow-x-auto overflow-y-auto rounded-xs border border-[var(--border)] bg-[var(--surface-solid)]"
        role="region"
        aria-label="Sockets table"
      >
        <table className="w-full border-collapse text-left" aria-rowcount={sortedSockets.length}>
          <caption className="sr-only">
            Active TCP sockets list, showing protocol, local and remote addresses, connection state,
            and process ID.
          </caption>
          <thead className="sticky top-0 z-10 border-b border-[var(--border)] bg-[var(--surface-raised)] text-[11px] font-semibold text-[var(--fg-muted)]">
            <tr>
              <th
                scope="col"
                aria-sort={getAriaSort("protocol")}
                className="w-16 px-2.5 py-2 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleSort("protocol");
                  }}
                  className="flex items-center gap-1 hover:text-[var(--fg)]"
                >
                  Proto
                  {sortCol === "protocol" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  )}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={getAriaSort("local")}
                className="min-w-[140px] px-2.5 py-2 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleSort("local");
                  }}
                  className="flex items-center gap-1 hover:text-[var(--fg)]"
                >
                  Local Address
                  {sortCol === "local" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  )}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={getAriaSort("remote")}
                className="min-w-[140px] px-2.5 py-2 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleSort("remote");
                  }}
                  className="flex items-center gap-1 hover:text-[var(--fg)]"
                >
                  Remote Address
                  {sortCol === "remote" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  )}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={getAriaSort("state")}
                className="w-28 px-2.5 py-2 whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleSort("state");
                  }}
                  className="flex items-center gap-1 hover:text-[var(--fg)]"
                >
                  State
                  {sortCol === "state" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  )}
                </button>
              </th>
              <th
                scope="col"
                aria-sort={getAriaSort("pid")}
                className="w-16 px-2.5 py-2 text-right whitespace-nowrap"
              >
                <button
                  type="button"
                  onClick={() => {
                    handleSort("pid");
                  }}
                  className="inline-flex items-center gap-1 hover:text-[var(--fg)]"
                >
                  PID
                  {sortCol === "pid" ? (
                    sortDir === "asc" ? (
                      <ArrowUp className="h-3 w-3" />
                    ) : (
                      <ArrowDown className="h-3 w-3" />
                    )
                  ) : (
                    <ArrowUpDown className="h-3 w-3 opacity-40" />
                  )}
                </button>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)] font-mono text-[11px]">
            {/* Top Virtualization Spacer */}
            {topSpacerHeight > 0 && (
              <tr style={{ height: topSpacerHeight }} aria-hidden="true">
                <td colSpan={5} />
              </tr>
            )}

            {visibleSockets.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-8 text-center font-sans text-xs text-[var(--fg-subtle)]"
                >
                  No sockets match current filter criteria.
                </td>
              </tr>
            ) : (
              visibleSockets.map((sock, i) => {
                const rowIndex = startIndex + i;
                const remoteStr =
                  sock.remote_addr !== null && sock.remote_addr !== undefined
                    ? `${sock.remote_addr}:${String(sock.remote_port ?? "")}`
                    : "—";
                const badgeClass = STATE_BADGE_CLASSES[sock.state];

                return (
                  <tr
                    key={`${sock.local_addr}:${String(sock.local_port)}-${remoteStr}-${String(sock.pid ?? "")}-${String(rowIndex)}`}
                    style={{ height: ROW_HEIGHT }}
                    aria-rowindex={rowIndex + 1}
                    className="transition-colors hover:bg-[var(--surface-raised)]/50"
                  >
                    <td className="px-2.5 py-1.5 font-medium text-[var(--fg-muted)] uppercase">
                      {sock.protocol}
                    </td>
                    <td className="truncate px-2.5 py-1.5 text-[var(--fg)] tabular-nums">
                      {sock.local_addr}:{sock.local_port}
                    </td>
                    <td className="truncate px-2.5 py-1.5 text-[var(--fg)] tabular-nums">
                      {remoteStr}
                    </td>
                    <td className="px-2.5 py-1.5 whitespace-nowrap">
                      <span
                        className={cn(
                          "inline-block rounded-xs border px-1.5 py-0.5 font-sans text-[10px] font-semibold tracking-wide",
                          badgeClass,
                        )}
                      >
                        {sock.state}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-right text-[var(--fg-subtle)] tabular-nums">
                      {sock.pid !== null && sock.pid !== undefined ? sock.pid : "—"}
                    </td>
                  </tr>
                );
              })
            )}

            {/* Bottom Virtualization Spacer */}
            {bottomSpacerHeight > 0 && (
              <tr style={{ height: bottomSpacerHeight }} aria-hidden="true">
                <td colSpan={5} />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
});
