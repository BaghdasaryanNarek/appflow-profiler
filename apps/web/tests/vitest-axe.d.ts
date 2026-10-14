import "vitest";

declare module "vitest-axe/matchers.js" {
  import type { RawMatcherFn } from "vitest";
  export const toHaveNoViolations: RawMatcherFn;
}

declare module "vitest" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Assertion<_T = any> {
    toHaveNoViolations(): void;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

export {};
