"use client";

import * as React from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      theme="dark"
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-[var(--surface-solid)] group-[.toaster]:text-[var(--fg)] group-[.toaster]:border-[var(--border)] group-[.toaster]:shadow-lg glass-surface",
          description: "group-[.toast]:text-[var(--fg-muted)]",
          actionButton:
            "group-[.toast]:bg-[var(--accent)] group-[.toast]:text-neutral-950 font-medium",
          cancelButton: "group-[.toast]:bg-[var(--surface)] group-[.toast]:text-[var(--fg-muted)]",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
