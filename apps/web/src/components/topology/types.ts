/**
 * Flow data types bridging AppFlow contracts to @xyflow/react generics (§3.6, §3.7).
 */

import type { Node as AppFlowNode, Edge as AppFlowEdge } from "@/types/contracts.gen";

export type GroupNodeData = AppFlowNode & {
  memberCount?: number | undefined;
  isCollapsed?: boolean | undefined;
} & Record<string, unknown>;

export type FlowNodeData = (AppFlowNode | GroupNodeData) & Record<string, unknown>;
export type FlowEdgeData = AppFlowEdge & Record<string, unknown>;
