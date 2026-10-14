import * as React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { axe } from "vitest-axe";
import { startViewTransition, TransitionLink } from "@/lib/view-transition";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("View Transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("startViewTransition", () => {
    it("calls callback directly when startViewTransition is unsupported", async () => {
      const callback = vi.fn();
      // Ensure document.startViewTransition is undefined
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      delete (document as any).startViewTransition;

      await startViewTransition(callback);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it("bypasses transition when prefers-reduced-motion is true", async () => {
      const callback = vi.fn();
      const mockStartViewTransition = vi.fn();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (document as any).startViewTransition = mockStartViewTransition;

      // Mock matchMedia returning matches: true
      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: query.includes("prefers-reduced-motion"),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      await startViewTransition(callback);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(mockStartViewTransition).not.toHaveBeenCalled();
    });

    it("invokes document.startViewTransition when supported and motion is enabled", async () => {
      const callback = vi.fn();
      const mockFinished = Promise.resolve();
      const mockStartViewTransition = vi.fn().mockImplementation((fn: () => Promise<void>) => {
        void fn();
        return { finished: mockFinished };
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      (document as any).startViewTransition = mockStartViewTransition;

      window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      await startViewTransition(callback);
      expect(mockStartViewTransition).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
    });
  });

  describe("TransitionLink", () => {
    it("renders as an accessible link with zero violations", async () => {
      const { container } = render(<TransitionLink href="/topology">Topology Link</TransitionLink>);
      const link = screen.getByRole("link", { name: "Topology Link" });
      expect(link).toHaveAttribute("href", "/topology");

      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("triggers router.push on click", async () => {
      render(<TransitionLink href="/processes">Processes Link</TransitionLink>);
      const link = screen.getByRole("link", { name: "Processes Link" });
      fireEvent.click(link);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith("/processes");
      });
    });

    it("allows modified clicks (meta/ctrl) to bypass client transition", () => {
      render(<TransitionLink href="/about">About Link</TransitionLink>);
      const link = screen.getByRole("link", { name: "About Link" });
      fireEvent.click(link, { metaKey: true });

      // Does not prevent default or call router.push
      expect(mockPush).not.toHaveBeenCalled();
    });
  });
});
