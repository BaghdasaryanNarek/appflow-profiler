/**
 * Types for Web Worker and synchronous graph layout calculation (§3.6, §3.7).
 */

export interface NodePosition {
  x: number;
  y: number;
}

export interface LayoutNodeInput {
  id: string;
  width?: number | undefined;
  height?: number | undefined;
  parentId?: string | undefined;
  kind?: string | undefined;
}

export interface LayoutEdgeInput {
  id: string;
  source: string;
  target: string;
}

export interface LayoutOptions {
  direction?: "RIGHT" | "DOWN" | undefined;
  nodeSpacing?: number | undefined;
  rankSpacing?: number | undefined;
}

export interface LayoutWorkerRequest {
  id: string;
  type: "LAYOUT";
  nodes: LayoutNodeInput[];
  edges: LayoutEdgeInput[];
  options?: LayoutOptions | undefined;
  fingerprint: string;
}

export interface LayoutWorkerSuccessResponse {
  id: string;
  type: "LAYOUT_SUCCESS";
  positions: Record<string, NodePosition>;
  fingerprint: string;
}

export interface LayoutWorkerErrorResponse {
  id: string;
  type: "LAYOUT_ERROR";
  error: string;
  fingerprint: string;
}

export type LayoutWorkerResponse = LayoutWorkerSuccessResponse | LayoutWorkerErrorResponse;
