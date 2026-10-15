/**
 * UI state store managing selections, filters, canvas controls,
 * and throttled accessibility live announcements (§3.5, §3.7).
 */

import { create } from "zustand";
import type { HealthEventPayload, NodeKind } from "@/types/contracts.gen";

export type ConnectionStatus =
  "idle" | "connecting" | "connected" | "reconnecting" | "waking_up" | "paused" | "error";

export interface UiAnnouncement {
  id: string;
  message: string;
  timestamp: number;
}

export interface UiStoreState {
  // Selection & Detail Sheet
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  detailSheetOpen: boolean;

  // Filters
  kinds: NodeKind[];
  minRps: number;
  groupId: string | null;
  searchQuery: string;

  // View & Canvas Controls
  viewMode: "canvas" | "table";
  lodCollapsed: boolean | "auto";
  isPaused: boolean;
  connectionStatus: ConnectionStatus;
  reconnectAttempt: number;
  lastError: string | null;
  layoutLocked: boolean;
  canvasActionTrigger: {
    type: "fit-view" | "zoom-in" | "zoom-out" | "relayout";
    timestamp: number;
  } | null;

  // Health Announcements (LiveAnnouncer)
  announcements: UiAnnouncement[];
  latestAnnouncement: string | null;
  lastAnnouncedAt: number;

  // Actions
  selectNode: (nodeId: string | null) => void;
  selectEdge: (edgeId: string | null) => void;
  setDetailSheetOpen: (open: boolean) => void;
  clearSelection: () => void;

  setKinds: (kinds: NodeKind[]) => void;
  setMinRps: (minRps: number) => void;
  setGroupId: (groupId: string | null) => void;
  setSearchQuery: (query: string) => void;
  resetFilters: () => void;

  setViewMode: (mode: "canvas" | "table") => void;
  setLodCollapsed: (lod: boolean | "auto") => void;
  setIsPaused: (paused: boolean) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setReconnectAttempt: (attempt: number) => void;
  setLastError: (error: string | null) => void;
  setLayoutLocked: (locked: boolean) => void;
  toggleLayoutLocked: () => void;
  triggerCanvasAction: (type: "fit-view" | "zoom-in" | "zoom-out" | "relayout") => void;

  queueHealthEvent: (payload: HealthEventPayload) => void;
  clearAnnouncements: () => void;
}

export const useUiStore = create<UiStoreState>((set) => ({
  selectedNodeId: null,
  selectedEdgeId: null,
  detailSheetOpen: false,

  kinds: [],
  minRps: 0,
  groupId: null,
  searchQuery: "",

  viewMode: "canvas",
  lodCollapsed: "auto",
  isPaused: false,
  connectionStatus: "idle",
  reconnectAttempt: 0,
  lastError: null,
  layoutLocked: false,
  canvasActionTrigger: null,

  announcements: [],
  latestAnnouncement: null,
  lastAnnouncedAt: 0,

  selectNode: (nodeId) => {
    set({
      selectedNodeId: nodeId,
      selectedEdgeId: null,
      detailSheetOpen: nodeId !== null,
    });
  },

  selectEdge: (edgeId) => {
    set({
      selectedEdgeId: edgeId,
      selectedNodeId: null,
      detailSheetOpen: edgeId !== null,
    });
  },

  setDetailSheetOpen: (open) => {
    set((state) => ({
      detailSheetOpen: open,
      selectedNodeId: open ? state.selectedNodeId : null,
      selectedEdgeId: open ? state.selectedEdgeId : null,
    }));
  },

  clearSelection: () => {
    set({
      selectedNodeId: null,
      selectedEdgeId: null,
      detailSheetOpen: false,
    });
  },

  setKinds: (kinds) => {
    set({ kinds });
  },
  setMinRps: (minRps) => {
    set({ minRps });
  },
  setGroupId: (groupId) => {
    set({ groupId });
  },
  setSearchQuery: (searchQuery) => {
    set({ searchQuery });
  },

  resetFilters: () => {
    set({
      kinds: [],
      minRps: 0,
      groupId: null,
      searchQuery: "",
    });
  },

  setViewMode: (viewMode) => {
    set({ viewMode });
  },
  setLodCollapsed: (lodCollapsed) => {
    set({ lodCollapsed });
  },
  setIsPaused: (isPaused) => {
    set({ isPaused });
  },
  setConnectionStatus: (connectionStatus) => {
    set({ connectionStatus });
  },
  setReconnectAttempt: (reconnectAttempt) => {
    set({ reconnectAttempt });
  },
  setLastError: (lastError) => {
    set({ lastError });
  },
  setLayoutLocked: (layoutLocked) => {
    set({ layoutLocked });
  },
  toggleLayoutLocked: () => {
    set((state) => ({ layoutLocked: !state.layoutLocked }));
  },
  triggerCanvasAction: (type) => {
    set({ canvasActionTrigger: { type, timestamp: Date.now() } });
  },

  queueHealthEvent: (payload) => {
    const now = Date.now();
    set((state) => {
      // Throttle to at most one announcement every 5 seconds (5,000 ms) per §3.5
      if (now - state.lastAnnouncedAt < 5000) {
        return state;
      }

      const reasonsText =
        payload.reasons && payload.reasons.length > 0
          ? ` due to ${payload.reasons.join(", ")}`
          : "";
      const message = `${payload.entity_id} became ${payload.to}${reasonsText}.`;

      const announcement: UiAnnouncement = {
        id: `${payload.entity_id}-${String(now)}`,
        message,
        timestamp: now,
      };

      // Cap announcements buffer to max 50 items
      const nextAnnouncements = [announcement, ...state.announcements].slice(0, 50);

      return {
        announcements: nextAnnouncements,
        latestAnnouncement: message,
        lastAnnouncedAt: now,
      };
    });
  },

  clearAnnouncements: () => {
    set({
      announcements: [],
      latestAnnouncement: null,
      lastAnnouncedAt: 0,
    });
  },
}));
