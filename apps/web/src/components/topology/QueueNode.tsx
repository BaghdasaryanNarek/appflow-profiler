"use client";

import * as React from "react";
import type { NodeProps, Node } from "@xyflow/react";
import { Layers } from "lucide-react";
import type { FlowNodeData } from "./types";
import { BaseNodeCard } from "./BaseNodeCard";

export type QueueNodeProps = NodeProps<Node<FlowNodeData, "queue">>;

export const QueueNode = React.memo(function QueueNode({ id, data, selected }: QueueNodeProps) {
  return (
    <BaseNodeCard
      id={id}
      label={data.label}
      kind="Queue"
      sublabel={data.group_id ?? "Message Broker"}
      health={data.health}
      metrics={data.metrics}
      selected={selected}
      icon={Layers}
    />
  );
});
