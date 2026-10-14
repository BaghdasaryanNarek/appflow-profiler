"use client";

import * as React from "react";
import Link, { type LinkProps } from "next/link";
import { useRouter } from "next/navigation";

export async function startViewTransition(callback: () => void | Promise<void>): Promise<void> {
  if (
    typeof document === "undefined" ||
    !("startViewTransition" in document) ||
    typeof document.startViewTransition !== "function" ||
    (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches)
  ) {
    await callback();
    return;
  }

  const transition = document.startViewTransition(async () => {
    await callback();
  });

  try {
    await transition.finished;
  } catch {
    // Gracefully handle aborted or skipped transitions
  }
}

export interface TransitionLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, keyof LinkProps>, LinkProps {
  children: React.ReactNode;
  className?: string;
}

export function TransitionLink({
  href,
  children,
  onClick,
  className,
  ...props
}: TransitionLinkProps): React.ReactElement {
  const router = useRouter();

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);

    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }

    const targetUrl =
      typeof href === "string"
        ? href
        : `${href.pathname ?? "/"}${href.search ?? ""}${href.hash ?? ""}`;

    e.preventDefault();
    void startViewTransition(() => {
      router.push(targetUrl);
    });
  };

  return React.createElement(
    Link,
    {
      href,
      onClick: handleClick,
      className,
      ...props,
    },
    children,
  );
}
