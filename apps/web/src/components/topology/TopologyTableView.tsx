"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { TopologyTable } from "@/components/table";

export interface TopologyTableViewProps {
  className?: string | undefined;
}

export const TopologyTableView = React.memo(function TopologyTableView({
  className,
}: TopologyTableViewProps) {
  return (
    <div className={cn("h-full w-full", className)}>
      <TopologyTable showToolbar={false} />
    </div>
  );
});
