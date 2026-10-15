/**
 * Comlink-free postMessage RPC bridge for layout Web Worker (§3.6, §3.7).
 * Provides automatic fallback to synchronous computation when Worker is unavailable (JSDOM / SSR)
 * and guarantees clean worker termination on unmount.
 */

import { computeGraphLayout } from "./layout-engine";
import type {
  LayoutEdgeInput,
  LayoutNodeInput,
  LayoutOptions,
  LayoutWorkerRequest,
  LayoutWorkerResponse,
  NodePosition,
} from "./types";

interface PendingRequest {
  resolve: (positions: Record<string, NodePosition>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class LayoutWorkerBridge {
  private worker: Worker | null = null;
  private isTerminated: boolean = false;
  private pendingRequests = new Map<string, PendingRequest>();
  private lastFingerprint: string | null = null;
  private lastPositions: Record<string, NodePosition> | null = null;

  constructor() {
    this.initWorker();
  }

  private initWorker(): void {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      return;
    }

    try {
      this.worker = new Worker(new URL("../../workers/layout.worker.ts", import.meta.url), {
        type: "module",
      });

      this.worker.onmessage = (event: MessageEvent<LayoutWorkerResponse>) => {
        const msg = event.data;
        if (!msg.id) {
          return;
        }

        const pending = this.pendingRequests.get(msg.id);
        if (!pending) {
          return;
        }

        clearTimeout(pending.timer);
        this.pendingRequests.delete(msg.id);

        if (msg.type === "LAYOUT_SUCCESS") {
          this.lastFingerprint = msg.fingerprint;
          this.lastPositions = msg.positions;
          pending.resolve(msg.positions);
        } else {
          pending.reject(new Error(msg.error || "Layout worker computation error"));
        }
      };

      this.worker.onerror = (err) => {
        // Fallback for all pending requests
        for (const [id, pending] of this.pendingRequests.entries()) {
          clearTimeout(pending.timer);
          pending.reject(
            new Error(`Layout worker crashed: ${err instanceof Error ? err.message : "unknown"}`),
          );
          this.pendingRequests.delete(id);
        }
      };
    } catch {
      // Worker creation might fail in restricted sandboxes; fallback to sync execution
      this.worker = null;
    }
  }

  /**
   * Request graph layout computation.
   * If topology structure has not changed (matching fingerprint), returns cached positions instantly.
   */
  async computeLayout(
    nodes: LayoutNodeInput[],
    edges: LayoutEdgeInput[],
    options?: LayoutOptions,
    fingerprint?: string,
  ): Promise<Record<string, NodePosition>> {
    if (this.isTerminated) {
      throw new Error("LayoutWorkerBridge has been terminated.");
    }

    if (fingerprint && fingerprint === this.lastFingerprint && this.lastPositions) {
      return this.lastPositions;
    }

    // Direct synchronous fallback if Worker is not supported or not running
    if (!this.worker) {
      const positions = computeGraphLayout(nodes, edges, options);
      if (fingerprint) {
        this.lastFingerprint = fingerprint;
        this.lastPositions = positions;
      }
      return positions;
    }

    const id = `layout-${String(Date.now())}-${Math.random().toString(36).slice(2, 8)}`;
    const effectiveFingerprint = fingerprint ?? id;

    return new Promise<Record<string, NodePosition>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        // Fallback to sync on timeout
        try {
          const fallbackPositions = computeGraphLayout(nodes, edges, options);
          resolve(fallbackPositions);
        } catch (err: unknown) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }, 5000);

      this.pendingRequests.set(id, { resolve, reject, timer });

      const req: LayoutWorkerRequest = {
        id,
        type: "LAYOUT",
        nodes,
        edges,
        fingerprint: effectiveFingerprint,
        ...(options !== undefined ? { options } : {}),
      };

      this.worker?.postMessage(req);
    });
  }

  /**
   * Terminate worker and clear pending request timers.
   */
  terminate(): void {
    this.isTerminated = true;
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("Layout worker bridge terminated."));
    }
    this.pendingRequests.clear();

    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
  }
}
