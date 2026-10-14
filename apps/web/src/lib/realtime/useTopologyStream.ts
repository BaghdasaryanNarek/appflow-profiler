/**
 * React hook connecting to the RealtimeClient singleton (§3.6, §3.7).
 * Synchronizes UI filter changes and manages stream pause/resume lifecycles.
 */

"use client";

import { useEffect, useRef } from "react";
import { useShallow } from "zustand/react/shallow";
import type { TopologyFilters } from "@/types/contracts.gen";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore, type ConnectionStatus } from "@/store/ui-store";
import { realtimeClient } from "./RealtimeClient";

export interface TopologyStreamState {
  status: ConnectionStatus;
  isPaused: boolean;
  reconnectAttempt: number;
  lastError: string | null;
  tickAgeMs: number | null;
  seq: number | null;
  version: number;
  pause: () => void;
  resume: () => void;
  resync: () => void;
}

export function useTopologyStream(): TopologyStreamState {
  const { status, isPaused, reconnectAttempt, lastError, kinds, minRps, groupId } = useUiStore(
    useShallow((state) => ({
      status: state.connectionStatus,
      isPaused: state.isPaused,
      reconnectAttempt: state.reconnectAttempt,
      lastError: state.lastError,
      kinds: state.kinds,
      minRps: state.minRps,
      groupId: state.groupId,
    })),
  );

  const { tickAgeMs, seq, version } = useTopologyStore(
    useShallow((state) => ({
      tickAgeMs: state.tickAgeMs,
      seq: state.seq,
      version: state.version,
    })),
  );

  // Initialize and connect stream singleton on first mount
  useEffect(() => {
    realtimeClient.connect();
  }, []);

  // Sync filter changes over WebSocket
  const isFirstFilterRun = useRef(true);
  useEffect(() => {
    if (isFirstFilterRun.current) {
      isFirstFilterRun.current = false;
      return;
    }

    const filters: TopologyFilters = {
      ...(kinds.length > 0 ? { kinds } : {}),
      ...(minRps > 0 ? { min_rps: minRps } : {}),
      ...(groupId ? { group: groupId } : {}),
    };
    realtimeClient.updateFilters(filters);
  }, [kinds, minRps, groupId]);

  return {
    status,
    isPaused,
    reconnectAttempt,
    lastError,
    tickAgeMs,
    seq,
    version,
    pause: () => {
      realtimeClient.pause();
    },
    resume: () => {
      realtimeClient.resume();
    },
    resync: () => {
      realtimeClient.resync();
    },
  };
}
