"use client";

import * as React from "react";
import type { NodeProps, Node } from "@xyflow/react";
import { Database } from "lucide-react";
import type { FlowNodeData } from "./types";
import { BaseNodeCard } from "./BaseNodeCard";

export type DatastoreNodeProps = NodeProps<Node<FlowNodeData, "datastore">>;

export const DatastoreNode = React.memo(function DatastoreNode({
  id,
  data,
  selected,
}: DatastoreNodeProps) {
  return (
    <BaseNodeCard
      id={id}
      label={data.label}
      kind="Datastore"
      sublabel={data.group_id ?? "Database"}
      health={data.health}
      metrics={data.metrics}
      selected={selected}
      icon={Database}
    />
  );
});
