import * as React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { AppShell } from "@/components/shell/AppShell";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { ModeBadge } from "@/components/shell/ModeBadge";
import { ConnectionIndicator } from "@/components/shell/ConnectionIndicator";
import { CommandMenu } from "@/components/shell/CommandMenu";
import { SkipLink } from "@/components/a11y/SkipLink";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/topology"),
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  })),
}));

describe("Shell Components & Accessibility", () => {
  describe("ModeBadge", () => {
    it("renders SIMULATION mode badge by default", async () => {
      const { container } = render(<ModeBadge mode="demo" />);
      expect(screen.getByText("SIMULATION")).toBeInTheDocument();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("renders LIVE mode badge when mode is live", async () => {
      const { container } = render(<ModeBadge mode="live" />);
      expect(screen.getByText("LIVE")).toBeInTheDocument();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("ConnectionIndicator", () => {
    it("renders connected status with icon and label", async () => {
      const { container } = render(<ConnectionIndicator status="connected" />);
      expect(screen.getByText("Connected")).toBeInTheDocument();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("renders reconnecting status", async () => {
      const { container } = render(<ConnectionIndicator status="reconnecting" />);
      expect(screen.getByText("Reconnecting…")).toBeInTheDocument();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("renders waking status for cold starts", async () => {
      const { container } = render(<ConnectionIndicator status="waking" />);
      expect(screen.getByText("Waking up demo backend…")).toBeInTheDocument();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });

    it("renders disconnected status", async () => {
      const { container } = render(<ConnectionIndicator status="disconnected" />);
      expect(screen.getByText("Disconnected")).toBeInTheDocument();
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("SkipLink", () => {
    it("renders with correct targetId and text", async () => {
      const { container } = render(<SkipLink targetId="main-content">Skip to content</SkipLink>);
      const link = screen.getByRole("link", { name: "Skip to content" });
      expect(link).toHaveAttribute("href", "#main-content");
      const results = await axe(container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("Sidebar", () => {
    it("renders primary navigation links", async () => {
      let renderResult: ReturnType<typeof render> | undefined;
      act(() => {
        renderResult = render(<Sidebar />);
      });
      expect(screen.getByText("AppFlow")).toBeInTheDocument();
      expect(screen.getByText("Topology")).toBeInTheDocument();
      expect(screen.getByText("Processes")).toBeInTheDocument();
      expect(screen.getByText("Insights")).toBeInTheDocument();
      expect(screen.getByText("About")).toBeInTheDocument();

      if (!renderResult) {
        throw new Error("Sidebar render failed");
      }
      const results = await axe(renderResult.container);
      expect(results).toHaveNoViolations();
    });

    it("supports collapsible mode", () => {
      const onToggle = vi.fn();
      act(() => {
        render(<Sidebar collapsed={true} onToggleCollapse={onToggle} />);
      });
      const expandBtn = screen.getByRole("button", {
        name: "Expand sidebar",
      });
      act(() => {
        fireEvent.click(expandBtn);
      });
      expect(onToggle).toHaveBeenCalledTimes(1);
    });
  });

  describe("TopBar", () => {
    it("renders mode badge, connection status, and command button", async () => {
      const onCommand = vi.fn();
      let renderResult: ReturnType<typeof render> | undefined;
      act(() => {
        renderResult = render(
          <TopBar onOpenCommandMenu={onCommand} mode="live" connectionStatus="connected" />,
        );
      });
      expect(screen.getByText("LIVE")).toBeInTheDocument();
      expect(screen.getByText("Connected")).toBeInTheDocument();

      const cmdBtn = screen.getByRole("button", {
        name: /search or command/i,
      });
      act(() => {
        fireEvent.click(cmdBtn);
      });
      expect(onCommand).toHaveBeenCalledTimes(1);

      if (!renderResult) {
        throw new Error("TopBar render failed");
      }
      const results = await axe(renderResult.container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("CommandMenu", () => {
    it("renders command palette when open with zero a11y violations", async () => {
      const onOpenChange = vi.fn();
      let renderResult: ReturnType<typeof render> | undefined;
      act(() => {
        renderResult = render(<CommandMenu open={true} onOpenChange={onOpenChange} />);
      });

      expect(screen.getByPlaceholderText("Type a command or search…")).toBeInTheDocument();
      expect(screen.getByText("Topology Canvas")).toBeInTheDocument();
      expect(screen.getByText("Process & Socket Table")).toBeInTheDocument();

      if (!renderResult) {
        throw new Error("CommandMenu render failed");
      }
      const results = await axe(renderResult.container);
      expect(results).toHaveNoViolations();
    });
  });

  describe("AppShell", () => {
    it("renders semantic landmarks and child content cleanly", async () => {
      let renderResult: ReturnType<typeof render> | undefined;
      act(() => {
        renderResult = render(
          <AppShell>
            <div data-testid="test-child">Dashboard Main Content</div>
          </AppShell>,
        );
      });

      expect(screen.getByRole("banner")).toBeInTheDocument(); // <header>
      expect(screen.getByRole("navigation")).toBeInTheDocument(); // <nav>
      expect(screen.getByRole("main")).toBeInTheDocument(); // <main>
      expect(screen.getByTestId("test-child")).toBeInTheDocument();

      if (!renderResult) {
        throw new Error("AppShell render failed");
      }
      const results = await axe(renderResult.container);
      expect(results).toHaveNoViolations();
    });

    it("opens CommandMenu on ⌘K keyboard shortcut", () => {
      act(() => {
        render(
          <AppShell>
            <div>Child</div>
          </AppShell>,
        );
      });

      act(() => {
        fireEvent.keyDown(window, { key: "k", metaKey: true });
      });

      expect(screen.getByPlaceholderText("Type a command or search…")).toBeInTheDocument();
    });
  });
});
