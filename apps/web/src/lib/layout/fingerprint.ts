/**
 * Deterministic structural fingerprint calculation for topology graphs (§3.6, §3.7).
 * Ensures layout computation runs ONLY when topology structure changes (nodes/edges added or removed)
 * and NEVER on 1 Hz metric-only delta updates.
 */

export interface FingerprintEdge {
  source: string;
  target: string;
}

export function computeStructuralFingerprint(
  nodeIds: Iterable<string>,
  edges: Iterable<FingerprintEdge>,
  lodCollapsed: boolean | "auto" = "auto",
): string {
  const sortedNodes = Array.from(nodeIds).sort();
  const sortedEdges = Array.from(edges)
    .map((e) => `${e.source}->${e.target}`)
    .sort();

  return `nodes:[${sortedNodes.join(",")}]|edges:[${sortedEdges.join(",")}]|lod:${String(lodCollapsed)}`;
}
