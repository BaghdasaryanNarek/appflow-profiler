/// <reference lib="webworker" />

/**
 * Dedicated Web Worker executing off-main-thread graph layout computation (§3.6, §3.7).
 */

import { computeGraphLayout } from "@/lib/layout/layout-engine";
import type { LayoutWorkerRequest, LayoutWorkerResponse } from "@/lib/layout/types";

addEventListener("message", (event: MessageEvent<LayoutWorkerRequest>) => {
  const data = event.data;
  try {
    const positions = computeGraphLayout(data.nodes, data.edges, data.options);
    const response: LayoutWorkerResponse = {
      id: data.id,
      type: "LAYOUT_SUCCESS",
      positions,
      fingerprint: data.fingerprint,
    };
    postMessage(response);
  } catch (err: unknown) {
    const error = err instanceof Error ? err.message : String(err);
    const response: LayoutWorkerResponse = {
      id: data.id,
      type: "LAYOUT_ERROR",
      error,
      fingerprint: data.fingerprint,
    };
    postMessage(response);
  }
});
