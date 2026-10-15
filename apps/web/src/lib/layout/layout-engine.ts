/**
 * Deterministic hierarchical graph layout engine (§3.6, §3.7).
 * Powered by Dagre and ELK for layered directional layouts (LR / TB).
 */

import dagre from "@dagrejs/dagre";
import type { LayoutEdgeInput, LayoutNodeInput, LayoutOptions, NodePosition } from "./types";

export const DEFAULT_NODE_WIDTH = 240;
export const DEFAULT_NODE_HEIGHT = 92;
export const DEFAULT_GROUP_WIDTH = 340;
export const DEFAULT_GROUP_HEIGHT = 220;

/**
 * Computes deterministic layered layout positions for nodes and edges.
 * React Flow expects top-left (x, y) coordinates, so center coordinates
 * from Dagre are offset by half node dimensions.
 */
export function computeGraphLayout(
  nodes: LayoutNodeInput[],
  edges: LayoutEdgeInput[],
  options?: LayoutOptions,
): Record<string, NodePosition> {
  if (nodes.length === 0) {
    return {};
  }

  if (nodes.length === 1) {
    const onlyNode = nodes[0];
    if (onlyNode) {
      return { [onlyNode.id]: { x: 80, y: 80 } };
    }
  }

  const g = new dagre.graphlib.Graph({ compound: true, multigraph: true });
  g.setGraph({
    rankdir: options?.direction === "DOWN" ? "TB" : "LR",
    nodesep: options?.nodeSpacing ?? 80,
    ranksep: options?.rankSpacing ?? 120,
    marginx: 40,
    marginy: 40,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const nodeMap = new Map<string, LayoutNodeInput>();

  for (const node of nodes) {
    nodeMap.set(node.id, node);
    const isGroup = node.kind === "group" || node.kind === "service_group";
    const width = node.width ?? (isGroup ? DEFAULT_GROUP_WIDTH : DEFAULT_NODE_WIDTH);
    const height = node.height ?? (isGroup ? DEFAULT_GROUP_HEIGHT : DEFAULT_NODE_HEIGHT);

    g.setNode(node.id, { width, height });
    if (node.parentId && nodeMap.has(node.parentId)) {
      g.setParent(node.id, node.parentId);
    }
  }

  for (const edge of edges) {
    if (nodeMap.has(edge.source) && nodeMap.has(edge.target)) {
      g.setEdge(edge.source, edge.target, {}, edge.id);
    }
  }

  dagre.layout(g);

  const positions: Record<string, NodePosition> = {};

  for (const node of nodes) {
    const calculated = g.node(node.id) as { x: number; y: number } | undefined;
    if (!calculated) {
      positions[node.id] = { x: 0, y: 0 };
      continue;
    }

    const isGroup = node.kind === "group" || node.kind === "service_group";
    const width = node.width ?? (isGroup ? DEFAULT_GROUP_WIDTH : DEFAULT_NODE_WIDTH);
    const height = node.height ?? (isGroup ? DEFAULT_GROUP_HEIGHT : DEFAULT_NODE_HEIGHT);

    // Convert Dagre center anchor to React Flow top-left anchor
    positions[node.id] = {
      x: Math.round(calculated.x - width / 2),
      y: Math.round(calculated.y - height / 2),
    };
  }

  return positions;
}
