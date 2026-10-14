import "@testing-library/jest-dom/vitest";
import { expect, vi } from "vitest";
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";

expect.extend({ toHaveNoViolations });

// Polyfill window.matchMedia for jsdom
if (typeof window !== "undefined") {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Polyfill ResizeObserver for Radix UI and layout components
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  window.ResizeObserver = MockResizeObserver;

  // Polyfill Element.prototype.scrollIntoView for cmdk / navigation
  Element.prototype.scrollIntoView = vi.fn();

  // Polyfill WebSocket for jsdom environment
  class MockWebSocket {
    static readonly CONNECTING = 0;
    static readonly OPEN = 1;
    static readonly CLOSING = 2;
    static readonly CLOSED = 3;

    readonly CONNECTING = 0;
    readonly OPEN = 1;
    readonly CLOSING = 2;
    readonly CLOSED = 3;

    readyState = MockWebSocket.CONNECTING;
    url: string;
    onopen: ((event: unknown) => void) | null = null;
    onclose: ((event: unknown) => void) | null = null;
    onmessage: ((event: { data: string }) => void) | null = null;
    onerror: ((event: unknown) => void) | null = null;

    constructor(url: string) {
      this.url = url;
    }

    send = vi.fn();
    close = vi.fn(() => {
      this.readyState = MockWebSocket.CLOSED;
    });
  }

  // @ts-expect-error MockWebSocket satisfies test harness needs
  globalThis.WebSocket = MockWebSocket;
}
