import * as React from "react";
import { cn } from "@/lib/utils";

export interface VisuallyHiddenProps extends React.HTMLAttributes<HTMLSpanElement> {
  as?: React.ElementType;
}

export function VisuallyHidden({
  as: Component = "span",
  className,
  children,
  ...props
}: VisuallyHiddenProps) {
  return (
    <Component className={cn("sr-only", className)} {...props}>
      {children}
    </Component>
  );
}
