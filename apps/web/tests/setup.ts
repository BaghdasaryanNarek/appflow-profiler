import "@testing-library/jest-dom/vitest";
import { expect, vi } from "vitest";
import { toHaveNoViolations } from "vitest-axe/dist/matchers.js";

expect.extend({ toHaveNoViolations });

import * as React from "react";

// Mock next/link to render clean semantic anchors without background prefetch state updates in JSDOM
vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...rest
  }: {
    children?: React.ReactNode;
    href: string;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    return React.createElement("a", { href, ...rest }, children);
  },
}));

// Mock next/navigation for App Router hooks in JSDOM
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => "/topology",
  useSearchParams: () => new URLSearchParams(),
}));

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

  // Polyfill ResizeObserver for Radix UI, React Flow and layout components
  class MockResizeObserver {
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
  }
  window.ResizeObserver = MockResizeObserver;

  // Polyfill HTMLCanvasElement.prototype.getContext for React Flow and MiniMap
  if (typeof HTMLCanvasElement !== "undefined") {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((contextId: string) => {
      if (contextId === "2d") {
        return {
          fillRect: vi.fn(),
          clearRect: vi.fn(),
          getImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(0) }),
          putImageData: vi.fn(),
          createImageData: vi.fn().mockReturnValue({ data: new Uint8ClampedArray(0) }),
          setTransform: vi.fn(),
          drawImage: vi.fn(),
          save: vi.fn(),
          fillText: vi.fn(),
          restore: vi.fn(),
          beginPath: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          closePath: vi.fn(),
          stroke: vi.fn(),
          translate: vi.fn(),
          scale: vi.fn(),
          rotate: vi.fn(),
          arc: vi.fn(),
          fill: vi.fn(),
          measureText: vi.fn().mockReturnValue({ width: 0, height: 0 }),
          transform: vi.fn(),
          rect: vi.fn(),
          clip: vi.fn(),
        };
      }
      return null;
    });
  }

  // Polyfill DOMMatrixReadOnly for React Flow coordinate math
  if (typeof window.DOMMatrixReadOnly === "undefined") {
    class MockDOMMatrixReadOnly {
      readonly a = 1;
      readonly b = 0;
      readonly c = 0;
      readonly d = 1;
      readonly e = 0;
      readonly f = 0;
      readonly m11 = 1;
      readonly m12 = 0;
      readonly m13 = 0;
      readonly m14 = 0;
      readonly m21 = 0;
      readonly m22 = 1;
      readonly m23 = 0;
      readonly m24 = 0;
      readonly m31 = 0;
      readonly m32 = 0;
      readonly m33 = 1;
      readonly m34 = 0;
      readonly m41 = 0;
      readonly m42 = 0;
      readonly m43 = 0;
      readonly m44 = 1;
      readonly is2D = true;
      readonly isIdentity = true;
      inverse() {
        return this;
      }
      multiply() {
        return this;
      }
      translate() {
        return this;
      }
      scale() {
        return this;
      }
      rotate() {
        return this;
      }
      transformPoint(point?: DOMPointInit) {
        return {
          x: point?.x ?? 0,
          y: point?.y ?? 0,
          z: point?.z ?? 0,
          w: point?.w ?? 1,
        } as DOMPoint;
      }
    }
    window.DOMMatrixReadOnly = MockDOMMatrixReadOnly as unknown as typeof DOMMatrixReadOnly;
  }

  // Polyfill getBBox and getComputedTextLength for React Flow edge paths
  if (typeof SVGElement !== "undefined") {
    const graphicsProto = (typeof SVGGraphicsElement !== "undefined"
      ? SVGGraphicsElement.prototype
      : SVGElement.prototype) as unknown as {
      getBBox?: () => unknown;
      getComputedTextLength?: () => number;
    };

    if (!graphicsProto.getBBox) {
      graphicsProto.getBBox = vi.fn().mockReturnValue({
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        top: 0,
        bottom: 50,
        left: 0,
        right: 100,
        toJSON: () => ({}),
      });
    }

    if (!graphicsProto.getComputedTextLength) {
      graphicsProto.getComputedTextLength = vi.fn().mockReturnValue(50);
    }
  }

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

  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
}
