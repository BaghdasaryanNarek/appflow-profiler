"use client";

import * as React from "react";
import type { NodeProps, Node } from "@xyflow/react";
import { Globe } from "lucide-react";
import type { FlowNodeData } from "./types";
import { BaseNodeCard } from "./BaseNodeCard";

export type ExternalNodeProps = NodeProps<Node<FlowNodeData, "external">>;

export const ExternalNode = React.memo(function ExternalNode({
  id,
  data,
  selected,
}: ExternalNodeProps) {
  return (
    <BaseNodeCard
      id={id}
      label={data.label}
      kind="External"
      sublabel={data.group_id ?? "External Service"}
      health={data.health}
      metrics={data.metrics}
      selected={selected}
      icon={Globe}
    />
  );
});
