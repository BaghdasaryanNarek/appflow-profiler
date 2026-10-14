import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2 select-none",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[var(--accent)] text-neutral-950 shadow-sm",
        secondary: "border-transparent bg-[var(--surface-solid)] text-[var(--fg)]",
        destructive: "border-transparent bg-[var(--crit)] text-white shadow-sm",
        outline: "text-[var(--fg)] border-[var(--border)]",
        ok: "border-[oklch(0.72_0.16_145_/_0.3)] bg-[oklch(0.72_0.16_145_/_0.15)] text-[var(--ok)]",
        warn: "border-[oklch(0.75_0.16_75_/_0.3)] bg-[oklch(0.75_0.16_75_/_0.15)] text-[var(--warn)]",
        crit: "border-[oklch(0.65_0.22_25_/_0.3)] bg-[oklch(0.65_0.22_25_/_0.15)] text-[var(--crit)]",
        unknown:
          "border-[oklch(0.68_0.04_260_/_0.3)] bg-[oklch(0.68_0.04_260_/_0.15)] text-[var(--unknown)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
