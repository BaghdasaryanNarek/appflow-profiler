/**
 * Typed HTTP REST client for AppFlow Profiler daemon endpoints.
 */

import type {
  AnalyzeRequest,
  EdgeDetail,
  MetaResponse,
  NodeDetail,
  NodeKind,
  OptimizationReport,
  ScenarioInfo,
  SnapshotResponse,
  TopologySummary,
} from "@/types/contracts.gen";
import { ApiProblemError } from "./errors";

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  headers?: Record<string, string>;
  params?: Record<string, string | number | boolean | (string | number)[] | null | undefined>;
}

/**
 * Resolve the API base URL from NEXT_PUBLIC_API_URL or default to localhost:8000.
 */
export function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
}

/**
 * Execute a typed fetch request with timeout, abort propagation, and RFC 9457 error handling.
 */
export async function request<T>(path: string, init?: RequestInit & RequestOptions): Promise<T> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${baseUrl}${normalizedPath}`);

  if (init?.params) {
    for (const [key, value] of Object.entries(init.params)) {
      if (value === undefined || value === null) {
        continue;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          url.searchParams.append(key, String(item));
        }
      } else {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const timeoutMs = init?.timeoutMs ?? 10_000;
  const timeoutController = new AbortController();
  const timer = setTimeout(() => {
    timeoutController.abort(new Error(`Request timed out after ${String(timeoutMs)}ms`));
  }, timeoutMs);

  let combinedSignal: AbortSignal = timeoutController.signal;
  if (init?.signal) {
    combinedSignal = AbortSignal.any([init.signal, timeoutController.signal]);
  }

  const headers = new Headers();
  headers.set("Accept", "application/json, application/problem+json");
  if (init?.headers) {
    for (const [key, val] of Object.entries(init.headers)) {
      headers.set(key, val);
    }
  }

  try {
    const response = await fetch(url.toString(), {
      ...init,
      signal: combinedSignal,
      headers,
    });

    if (!response.ok) {
      let problemData: unknown = null;
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("json")) {
        try {
          problemData = await response.json();
        } catch {
          // Graceful fallback if JSON body parsing fails
        }
      }

      let retryAfterMs: number | undefined;
      const retryAfterHeader = response.headers.get("retry-after");
      if (retryAfterHeader) {
        const seconds = Number(retryAfterHeader);
        if (Number.isFinite(seconds)) {
          retryAfterMs = seconds * 1000;
        } else {
          const parsedDate = Date.parse(retryAfterHeader);
          if (!Number.isNaN(parsedDate)) {
            retryAfterMs = Math.max(0, parsedDate - Date.now());
          }
        }
      }

      if (
        problemData !== null &&
        typeof problemData === "object" &&
        ("title" in problemData || "detail" in problemData || "status" in problemData)
      ) {
        const obj = problemData as Record<string, unknown>;
        const title =
          typeof obj.title === "string" ? obj.title : response.statusText || "HTTP Error";
        const status = typeof obj.status === "number" ? obj.status : response.status;
        const type = typeof obj.type === "string" ? obj.type : undefined;
        const detail = typeof obj.detail === "string" ? obj.detail : undefined;
        const instance = typeof obj.instance === "string" ? obj.instance : undefined;

        throw new ApiProblemError(
          {
            title,
            status,
            ...(type !== undefined ? { type } : {}),
            ...(detail !== undefined ? { detail } : {}),
            ...(instance !== undefined ? { instance } : {}),
            ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
          },
          problemData,
        );
      }

      const text =
        typeof problemData === "string" ? problemData : await response.text().catch(() => "");
      throw new ApiProblemError({
        title: response.statusText || "HTTP Error",
        status: response.status,
        ...(text ? { detail: text } : {}),
        ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
      });
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET /api/v1/meta - Server capabilities, runtime mode, and limits.
 */
export async function fetchMeta(options?: RequestOptions): Promise<MetaResponse> {
  return request<MetaResponse>("/api/v1/meta", {
    method: "GET",
    ...options,
  });
}

/**
 * GET /api/v1/topology/summary - Compact fleet summary (SSR LCP payload).
 */
export async function fetchTopologySummary(options?: RequestOptions): Promise<TopologySummary> {
  return request<TopologySummary>("/api/v1/topology/summary", {
    method: "GET",
    ...options,
  });
}

/**
 * GET /api/v1/topology/snapshot - Point-in-time full topology snapshot.
 */
export async function fetchTopologySnapshot(
  params?: {
    kinds?: NodeKind[];
    minRps?: number;
    group?: string;
  },
  options?: RequestOptions,
): Promise<SnapshotResponse> {
  return request<SnapshotResponse>("/api/v1/topology/snapshot", {
    method: "GET",
    ...options,
    params: {
      ...(params?.kinds ? { kinds: params.kinds } : {}),
      ...(params?.minRps !== undefined ? { min_rps: params.minRps } : {}),
      ...(params?.group !== undefined ? { group: params.group } : {}),
      ...options?.params,
    },
  });
}

/**
 * GET /api/v1/nodes/{nodeId} - Detailed telemetry, sockets, neighbours, and history.
 */
export async function fetchNodeDetail(
  nodeId: string,
  options?: RequestOptions,
): Promise<NodeDetail> {
  return request<NodeDetail>(`/api/v1/nodes/${encodeURIComponent(nodeId)}`, {
    method: "GET",
    ...options,
  });
}

/**
 * GET /api/v1/edges/{edgeId} - Detailed telemetry, connection states, and history.
 */
export async function fetchEdgeDetail(
  edgeId: string,
  options?: RequestOptions,
): Promise<EdgeDetail> {
  return request<EdgeDetail>(`/api/v1/edges/${encodeURIComponent(edgeId)}`, {
    method: "GET",
    ...options,
  });
}

/**
 * GET /api/v1/simulation/scenarios - Registered anomaly scenarios in demo mode.
 */
export async function fetchScenarios(options?: RequestOptions): Promise<ScenarioInfo[]> {
  return request<ScenarioInfo[]>("/api/v1/simulation/scenarios", {
    method: "GET",
    ...options,
  });
}

/**
 * POST /api/v1/simulation/scenarios/{id}/activate - Trigger scenario activation.
 */
export async function activateScenario(
  id: string,
  options?: RequestOptions,
): Promise<ScenarioInfo> {
  return request<ScenarioInfo>(`/api/v1/simulation/scenarios/${encodeURIComponent(id)}/activate`, {
    method: "POST",
    ...options,
  });
}

/**
 * POST /api/v1/simulation/reset - Reset simulated environment to baseline steady state.
 */
export async function resetSimulation(options?: RequestOptions): Promise<void> {
  await request<undefined>("/api/v1/simulation/reset", {
    method: "POST",
    ...options,
  });
}

/**
 * POST /api/v1/insights/analyze - Gemini/heuristic optimization report generation.
 */
export async function analyzeTopology(
  body: AnalyzeRequest,
  options?: RequestOptions,
): Promise<OptimizationReport> {
  return request<OptimizationReport>("/api/v1/insights/analyze", {
    method: "POST",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    body: JSON.stringify(body),
  });
}
