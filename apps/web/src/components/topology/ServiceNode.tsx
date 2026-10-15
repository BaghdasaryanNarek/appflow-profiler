"use client";

import * as React from "react";
import type { NodeProps, Node } from "@xyflow/react";
import { Server } from "lucide-react";
import type { FlowNodeData } from "./types";
import { BaseNodeCard } from "./BaseNodeCard";

export type ServiceNodeProps = NodeProps<Node<FlowNodeData, "service">>;

export const ServiceNode = React.memo(function ServiceNode({
  id,
  data,
  selected,
}: ServiceNodeProps) {
  return (
    <BaseNodeCard
      id={id}
      label={data.label}
      kind="Service"
      sublabel={data.group_id ?? "Service"}
      health={data.health}
      metrics={data.metrics}
      selected={selected}
      icon={Server}
    />
  );
});
