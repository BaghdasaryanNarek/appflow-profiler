/**
 * Singleton RealtimeClient managing WebSocket connection, backoff reconnects,
 * sequence validation, frame buffering via requestAnimationFrame, and visibility pause/resume (§3.6, §3.7, §4.5, §5.5).
 */

import type {
  ClientMessage,
  DeltaPayload,
  ServerMessage,
  TopologyFilters,
  TopologyGraph,
} from "@/types/contracts.gen";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";
import { computeBackoffMs } from "./backoff";

export interface RealtimeClientOptions {
  url?: string;
  autoConnect?: boolean;
  rafScheduler?: (callback: () => void) => number;
  rafCanceller?: (id: number) => void;
  webSocketFactory?: (url: string) => WebSocket;
  rng?: () => number;
}

export function getDefaultWsUrl(): string {
  return process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/v1/topology";
}

export class RealtimeClient {
  private readonly url: string;
  private readonly rafScheduler: (callback: () => void) => number;
  private readonly rafCanceller: (id: number) => void;
  private readonly webSocketFactory: (url: string) => WebSocket;
  private readonly rng: () => number;

  private ws: WebSocket | null = null;
  private lastAppliedSeq: number | null = null;
  private reconnectAttempt: number = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private coldStartTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatWatchdogTimer: ReturnType<typeof setTimeout> | null = null;
  private isManuallyClosed: boolean = false;

  private pendingSnapshot: { graph: TopologyGraph; seq: number } | null = null;
  private pendingDeltas: Array<{ delta: DeltaPayload; seq: number }> = [];
  private rafId: number | null = null;
  private activeFilters: TopologyFilters = {};
  private visibilityListenerAttached: boolean = false;

  constructor(options?: RealtimeClientOptions) {
    this.url = options?.url ?? getDefaultWsUrl();
    this.rafScheduler =
      options?.rafScheduler ??
      ((cb: () => void) => {
        if (typeof requestAnimationFrame !== "undefined") {
          return requestAnimationFrame(cb);
        }
        return setTimeout(cb, 16) as unknown as number;
      });
    this.rafCanceller =
      options?.rafCanceller ??
      ((id: number) => {
        if (typeof cancelAnimationFrame !== "undefined") {
          cancelAnimationFrame(id);
        } else {
          clearTimeout(id as unknown as ReturnType<typeof setTimeout>);
        }
      });
    this.webSocketFactory = options?.webSocketFactory ?? ((url: string) => new WebSocket(url));
    this.rng = options?.rng ?? Math.random;

    if (options?.autoConnect) {
      this.connect();
    }
  }

  get seq(): number | null {
    return this.lastAppliedSeq;
  }

  get attempt(): number {
    return this.reconnectAttempt;
  }

  /**
   * Establish WebSocket connection to backend streaming hub.
   */
  connect(): void {
    if (
      this.ws &&
      (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    this.isManuallyClosed = false;
    this.clearReconnectTimer();
    this.startColdStartTimer();

    const initialStatus =
      this.reconnectAttempt >= 2
        ? "waking_up"
        : this.reconnectAttempt > 0
          ? "reconnecting"
          : "connecting";
    useUiStore.getState().setConnectionStatus(initialStatus);

    try {
      this.ws = this.webSocketFactory(this.url);
      this.setupSocketHandlers(this.ws);
      this.attachVisibilityListener();
    } catch (_err) {
      this.scheduleReconnect();
    }
  }

  /**
   * Terminate connection, cancel timers and frame buffers.
   */
  disconnect(): void {
    this.isManuallyClosed = true;
    this.clearReconnectTimer();
    this.clearColdStartTimer();
    this.clearHeartbeatWatchdog();
    this.cancelRafFlush();
    this.detachVisibilityListener();

    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      try {
        this.ws.close();
      } catch {
        // Safe suppression of close exceptions
      }
      this.ws = null;
    }

    this.pendingSnapshot = null;
    this.pendingDeltas = [];
    useUiStore.getState().setConnectionStatus("idle");
  }

  /**
   * Send initial subscription payload.
   */
  subscribe(filters?: TopologyFilters): void {
    if (filters) {
      this.activeFilters = filters;
    }
    const message: ClientMessage = {
      v: 1,
      type: "subscribe",
      seq: null,
      ts: new Date().toISOString(),
      payload: {
        filters: this.activeFilters,
      },
    };
    this.sendMessage(message);
  }

  /**
   * Send update_filters message when UI filters change.
   */
  updateFilters(filters: TopologyFilters): void {
    this.activeFilters = filters;
    const message: ClientMessage = {
      v: 1,
      type: "update_filters",
      seq: null,
      ts: new Date().toISOString(),
      payload: {
        filters: this.activeFilters,
      },
    };
    this.sendMessage(message);
  }

  /**
   * Pause stream (triggered when document becomes hidden).
   */
  pause(): void {
    useUiStore.getState().setIsPaused(true);
    useUiStore.getState().setConnectionStatus("paused");
    const message: ClientMessage = {
      v: 1,
      type: "pause",
      seq: null,
      ts: new Date().toISOString(),
      payload: {},
    };
    this.sendMessage(message);
  }

  /**
   * Resume stream (triggered when document becomes visible).
   */
  resume(): void {
    useUiStore.getState().setIsPaused(false);
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      useUiStore.getState().setConnectionStatus("connected");
    }
    const message: ClientMessage = {
      v: 1,
      type: "resume",
      seq: null,
      ts: new Date().toISOString(),
      payload: {},
    };
    this.sendMessage(message);
  }

  /**
   * Discard out-of-order delta and request immediate fresh snapshot from last known seq.
   */
  resync(): void {
    const message: ClientMessage = {
      v: 1,
      type: "resync",
      seq: null,
      ts: new Date().toISOString(),
      payload: {
        last_seq: this.lastAppliedSeq,
      },
    };
    this.sendMessage(message);
  }

  /**
   * Ping daemon to refresh liveness watchdog.
   */
  ping(): void {
    const message: ClientMessage = {
      v: 1,
      type: "ping",
      seq: null,
      ts: new Date().toISOString(),
      payload: {},
    };
    this.sendMessage(message);
  }

  /**
   * Send client message over active WebSocket if OPEN.
   */
  private sendMessage(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        // Socket write failure will trigger onerror/onclose
      }
    }
  }

  private setupSocketHandlers(socket: WebSocket): void {
    socket.onopen = () => {
      this.clearColdStartTimer();
      this.reconnectAttempt = 0;
      useUiStore.getState().setReconnectAttempt(0);
      this.subscribe(this.activeFilters);
      this.resetHeartbeatWatchdog();
    };

    socket.onmessage = (event: MessageEvent) => {
      this.resetHeartbeatWatchdog();
      try {
        const raw = typeof event.data === "string" ? event.data : "";
        if (!raw) return;
        const msg = JSON.parse(raw) as ServerMessage;
        this.handleServerMessage(msg);
      } catch (_err) {
        // Invalid JSON frame dropped
      }
    };

    socket.onclose = () => {
      this.handleSocketTermination();
    };

    socket.onerror = () => {
      this.handleSocketTermination();
    };
  }

  private handleServerMessage(msg: ServerMessage): void {
    switch (msg.type) {
      case "hello": {
        useTopologyStore.getState().setMeta(msg.payload.meta);
        useUiStore.getState().setConnectionStatus("connected");
        useUiStore.getState().setLastError(null);
        break;
      }

      case "snapshot": {
        this.lastAppliedSeq = msg.seq;
        this.pendingSnapshot = {
          graph: msg.payload.graph,
          seq: msg.seq,
        };
        // Snapshot supersedes all queued deltas before it
        this.pendingDeltas = [];
        this.scheduleRafFlush();
        break;
      }

      case "delta": {
        const delta = msg.payload;
        const baseSeq = delta.base_seq;
        const seq = msg.seq;

        // Sequence continuity verification (§4.5):
        // Discard delta and resync if baseSeq != lastAppliedSeq or seq != lastAppliedSeq + 1
        if (
          this.lastAppliedSeq === null ||
          baseSeq !== this.lastAppliedSeq ||
          seq !== this.lastAppliedSeq + 1
        ) {
          this.resync();
          return;
        }

        this.lastAppliedSeq = seq;
        this.pendingDeltas.push({ delta, seq });
        this.scheduleRafFlush();
        break;
      }

      case "health_event": {
        useUiStore.getState().queueHealthEvent(msg.payload);
        break;
      }

      case "scenario": {
        useTopologyStore.getState().setScenario(msg.payload.active ?? null);
        break;
      }

      case "heartbeat": {
        useTopologyStore.getState().setTickAge(msg.payload.tick_age_ms);
        break;
      }

      case "error": {
        useUiStore.getState().setLastError(msg.payload.detail);
        break;
      }
    }
  }

  private scheduleRafFlush(): void {
    if (this.rafId !== null) {
      return;
    }
    this.rafId = this.rafScheduler(() => {
      this.rafId = null;
      this.flushFrameBuffer();
    });
  }

  /**
   * Flush queued snapshots and deltas into Zustand state once per animation frame (§3.6).
   */
  flushFrameBuffer(): void {
    if (this.pendingSnapshot) {
      useTopologyStore
        .getState()
        .applySnapshot(this.pendingSnapshot.graph, this.pendingSnapshot.seq);
      this.pendingSnapshot = null;
    }

    if (this.pendingDeltas.length > 0) {
      useTopologyStore.getState().applyDeltas(this.pendingDeltas);
      this.pendingDeltas = [];
    }
  }

  private cancelRafFlush(): void {
    if (this.rafId !== null) {
      this.rafCanceller(this.rafId);
      this.rafId = null;
    }
  }

  private handleSocketTermination(): void {
    this.clearHeartbeatWatchdog();
    this.clearColdStartTimer();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws = null;
    }
    if (this.isManuallyClosed) {
      return;
    }
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempt++;
    useUiStore.getState().setReconnectAttempt(this.reconnectAttempt);

    const isColdStart = this.reconnectAttempt >= 2;
    useUiStore.getState().setConnectionStatus(isColdStart ? "waking_up" : "reconnecting");

    const delayMs = computeBackoffMs(this.reconnectAttempt, this.rng);
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delayMs);
  }

  private startColdStartTimer(): void {
    this.clearColdStartTimer();
    this.coldStartTimer = setTimeout(() => {
      if (this.reconnectAttempt >= 1 || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
        useUiStore.getState().setConnectionStatus("waking_up");
      }
    }, 3000);
  }

  private clearColdStartTimer(): void {
    if (this.coldStartTimer) {
      clearTimeout(this.coldStartTimer);
      this.coldStartTimer = null;
    }
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private resetHeartbeatWatchdog(): void {
    this.clearHeartbeatWatchdog();
    this.heartbeatWatchdogTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ping();
      } else {
        this.handleSocketTermination();
      }
    }, 35_000);
  }

  private clearHeartbeatWatchdog(): void {
    if (this.heartbeatWatchdogTimer) {
      clearTimeout(this.heartbeatWatchdogTimer);
      this.heartbeatWatchdogTimer = null;
    }
  }

  private handleVisibilityChange = (): void => {
    if (typeof document === "undefined") {
      return;
    }
    if (document.visibilityState === "hidden") {
      this.pause();
    } else {
      this.resume();
    }
  };

  private attachVisibilityListener(): void {
    if (typeof document !== "undefined" && !this.visibilityListenerAttached) {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
      this.visibilityListenerAttached = true;
    }
  }

  private detachVisibilityListener(): void {
    if (typeof document !== "undefined" && this.visibilityListenerAttached) {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
      this.visibilityListenerAttached = false;
    }
  }
}

/**
 * Global singleton client instance used across the browser runtime (§3.7).
 */
export const realtimeClient = new RealtimeClient();
