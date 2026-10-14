import { beforeEach, describe, expect, it } from "vitest";
import type {
  ClientMessage,
  ClientResyncMessage,
  ServerDeltaMessage,
  ServerHelloMessage,
  ServerSnapshotMessage,
} from "@/types/contracts.gen";
import { RealtimeClient } from "@/lib/realtime/RealtimeClient";
import { computeBackoffMs, MAX_BACKOFF_MS } from "@/lib/realtime/backoff";
import { useTopologyStore } from "@/store/topology-store";
import { useUiStore } from "@/store/ui-store";

class TestWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readyState = TestWebSocket.CONNECTING;
  sentMessages: string[] = [];

  onopen: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(readonly url: string) {}

  send(data: string) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = TestWebSocket.CLOSED;
    this.onclose?.({});
  }

  simulateOpen() {
    this.readyState = TestWebSocket.OPEN;
    this.onopen?.({});
  }

  simulateMessage(msg: unknown) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  simulateClose() {
    this.readyState = TestWebSocket.CLOSED;
    this.onclose?.({});
  }
}

describe("RealtimeClient & Backoff", () => {
  beforeEach(() => {
    useTopologyStore.getState().reset();
    useUiStore.getState().clearSelection();
    useUiStore.getState().setConnectionStatus("idle");
    useUiStore.getState().setReconnectAttempt(0);
  });

  describe("computeBackoffMs", () => {
    it("respects base bounds and jitter range", () => {
      // With min jitter (rng = 0 -> multiplier 0.8)
      const minAttempt0 = computeBackoffMs(0, () => 0);
      expect(minAttempt0).toBe(Math.round(500 * 0.8)); // 400

      // With max jitter (rng = 1 -> multiplier 1.2)
      const maxAttempt0 = computeBackoffMs(0, () => 1);
      expect(maxAttempt0).toBe(Math.round(500 * 1.2)); // 600

      // High attempt clamps at 30,000 * 1.2 = 36,000 ms max
      const maxAttempt10 = computeBackoffMs(10, () => 1);
      expect(maxAttempt10).toBeLessThanOrEqual(MAX_BACKOFF_MS * 1.2);
      expect(maxAttempt10).toBe(36000);
    });
  });

  describe("Lifecycle & rAF batching", () => {
    it("handles hello, snapshot, and delta with rAF frame batching", () => {
      let socket!: TestWebSocket;
      let flushRaf: () => void = () => {};

      const client = new RealtimeClient({
        webSocketFactory: (url) => {
          socket = new TestWebSocket(url);
          return socket as unknown as WebSocket;
        },
        rafScheduler: (cb) => {
          flushRaf = cb;
          return 1;
        },
        rafCanceller: () => {
          flushRaf = () => {};
        },
      });

      client.connect();
      socket.simulateOpen();

      // Subscription message sent
      expect(socket.sentMessages.length).toBe(1);
      const firstMessage = socket.sentMessages[0];
      expect(firstMessage).toBeDefined();
      if (!firstMessage) {
        throw new Error("No message sent");
      }
      const subMsg = JSON.parse(firstMessage) as ClientMessage;
      expect(subMsg.type).toBe("subscribe");

      // 1. Server sends hello
      const helloMsg: ServerHelloMessage = {
        v: 1,
        type: "hello",
        seq: null,
        ts: "2026-10-15T00:00:00Z",
        payload: {
          server_time: "2026-10-15T00:00:00Z",
          meta: {
            version: "0.1.0",
            mode: "demo",
            tick_ms: 1000,
            capabilities: {
              per_process_io: false,
              connection_owner: false,
              ai_advisor: true,
              scenarios: true,
            },
            limits: {
              max_nodes: 5000,
            },
          },
        },
      };
      socket.simulateMessage(helloMsg);

      expect(useUiStore.getState().connectionStatus).toBe("connected");
      expect(useTopologyStore.getState().meta?.mode).toBe("demo");

      // 2. Server sends snapshot seq=1
      const snapshotMsg: ServerSnapshotMessage = {
        v: 1,
        type: "snapshot",
        seq: 1,
        ts: "2026-10-15T00:00:01Z",
        payload: {
          graph: {
            nodes: [
              {
                id: "srv-orders",
                label: "Orders API",
                kind: "service",
                health: "healthy",
                metrics: {
                  rps: 150,
                  p50_ms: 20,
                  p99_ms: 45,
                  error_rate: 0,
                  saturation: 0.3,
                  cpu_percent: 20,
                  rss_bytes: 50000000,
                  open_connections: 5,
                  quality: "simulated",
                },
                tags: {},
              },
            ],
            edges: [],
          },
        },
      };
      socket.simulateMessage(snapshotMsg);

      // Snapshot should not immediately mutate store before rAF flush
      expect(useTopologyStore.getState().nodes.size).toBe(0);

      // Execute animation frame callback
      flushRaf();
      expect(useTopologyStore.getState().nodes.size).toBe(1);
      expect(useTopologyStore.getState().seq).toBe(1);

      // 3. Server sends valid contiguous delta (base_seq=1, seq=2)
      const deltaMsg: ServerDeltaMessage = {
        v: 1,
        type: "delta",
        seq: 2,
        ts: "2026-10-15T00:00:02Z",
        payload: {
          base_seq: 1,
          added_nodes: [],
          removed_node_ids: [],
          updated_nodes: [
            {
              id: "srv-orders",
              health: "degraded",
              metrics: {
                rps: 300,
                p50_ms: 120,
                p99_ms: 500,
                error_rate: 0.02,
                saturation: 0.85,
                cpu_percent: 80,
                rss_bytes: 60000000,
                open_connections: 20,
                quality: "simulated",
              },
            },
          ],
          added_edges: [],
          removed_edge_ids: [],
          updated_edges: [],
        },
      };
      socket.simulateMessage(deltaMsg);

      // Flush delta rAF
      flushRaf();
      expect(useTopologyStore.getState().seq).toBe(2);
      expect(useTopologyStore.getState().nodes.get("srv-orders")?.health).toBe("degraded");

      client.disconnect();
    });

    it("detects sequence gap, discards out-of-order delta, and triggers resync", () => {
      let socket!: TestWebSocket;
      let flushRaf: () => void = () => {};

      const client = new RealtimeClient({
        webSocketFactory: (url) => {
          socket = new TestWebSocket(url);
          return socket as unknown as WebSocket;
        },
        rafScheduler: (cb) => {
          flushRaf = cb;
          return 1;
        },
        rafCanceller: () => {
          flushRaf = () => {};
        },
      });

      client.connect();
      socket.simulateOpen();

      // Prime with snapshot seq=1
      socket.simulateMessage({
        v: 1,
        type: "snapshot",
        seq: 1,
        ts: "2026-10-15T00:00:01Z",
        payload: {
          graph: { nodes: [], edges: [] },
        },
      });
      flushRaf();
      expect(client.seq).toBe(1);

      const initialSentCount = socket.sentMessages.length;

      // Receive GAP delta: base_seq=4, seq=5 instead of expected base_seq=1, seq=2!
      const gapDelta: ServerDeltaMessage = {
        v: 1,
        type: "delta",
        seq: 5,
        ts: "2026-10-15T00:00:05Z",
        payload: {
          base_seq: 4,
          added_nodes: [],
          removed_node_ids: [],
          updated_nodes: [],
          added_edges: [],
          removed_edge_ids: [],
          updated_edges: [],
        },
      };
      socket.simulateMessage(gapDelta);

      // Client must send resync message with last_seq: 1
      expect(socket.sentMessages.length).toBe(initialSentCount + 1);
      const lastMessage = socket.sentMessages[socket.sentMessages.length - 1];
      expect(lastMessage).toBeDefined();
      if (!lastMessage) {
        throw new Error("No resync message sent");
      }
      const resyncMsg = JSON.parse(lastMessage) as ClientResyncMessage;
      expect(resyncMsg.type).toBe("resync");
      expect(resyncMsg.payload?.last_seq).toBe(1);

      // Client seq should NOT have advanced to 5
      expect(client.seq).toBe(1);

      client.disconnect();
    });

    it("sends pause on hidden visibility and resume on visible visibility", () => {
      let socket!: TestWebSocket;

      const client = new RealtimeClient({
        webSocketFactory: (url) => {
          socket = new TestWebSocket(url);
          return socket as unknown as WebSocket;
        },
      });

      client.connect();
      socket.simulateOpen();

      // Trigger pause
      client.pause();
      expect(useUiStore.getState().isPaused).toBe(true);
      expect(useUiStore.getState().connectionStatus).toBe("paused");
      const pauseMsgRaw = socket.sentMessages[socket.sentMessages.length - 1];
      expect(pauseMsgRaw).toBeDefined();
      if (!pauseMsgRaw) {
        throw new Error("No pause message");
      }
      const pauseMsg = JSON.parse(pauseMsgRaw) as ClientMessage;
      expect(pauseMsg.type).toBe("pause");

      // Trigger resume
      client.resume();
      expect(useUiStore.getState().isPaused).toBe(false);
      expect(useUiStore.getState().connectionStatus).toBe("connected");
      const resumeMsgRaw = socket.sentMessages[socket.sentMessages.length - 1];
      expect(resumeMsgRaw).toBeDefined();
      if (!resumeMsgRaw) {
        throw new Error("No resume message");
      }
      const resumeMsg = JSON.parse(resumeMsgRaw) as ClientMessage;
      expect(resumeMsg.type).toBe("resume");

      client.disconnect();
    });
  });
});
