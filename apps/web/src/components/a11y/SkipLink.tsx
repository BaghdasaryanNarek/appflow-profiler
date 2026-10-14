import * as React from "react";
import { cn } from "@/lib/utils";

export interface SkipLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  targetId?: string;
}

export function SkipLink({
  targetId = "main-content",
  children = "Skip to topology",
  className,
  ...props
}: SkipLinkProps) {
  return (
    <a
      href={`#${targetId}`}
      className={cn(
        "sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded-md focus:bg-[var(--accent)] focus:px-4 focus:py-2 focus:font-semibold focus:text-neutral-950 focus:shadow-lg focus:ring-2 focus:ring-white focus:outline-none",
        className,
      )}
      {...props}
    >
      {children}
    </a>
  );
}
