import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 select-none min-h-[32px] min-w-[32px]",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--accent)] text-neutral-950 hover:bg-[oklch(0.75_0.15_255)] shadow-sm font-semibold",
        destructive: "bg-[var(--crit)] text-white hover:bg-[oklch(0.70_0.22_25)] shadow-sm",
        outline:
          "border border-[var(--border)] bg-transparent hover:bg-[var(--surface)] text-[var(--fg)]",
        secondary: "bg-[var(--surface-solid)] text-[var(--fg)] hover:bg-[oklch(0.24_0.012_260)]",
        ghost: "hover:bg-[var(--surface)] text-[var(--fg-muted)] hover:text-[var(--fg)]",
        link: "text-[var(--accent)] underline-offset-4 hover:underline p-0 min-h-0 min-w-0",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-md px-3 text-xs",
        lg: "h-10 rounded-md px-8",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
