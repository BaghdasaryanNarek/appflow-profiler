# Proposal

## Why

Two open Dependabot alerts affect `next@15.5.27`, the exact version pinned in `apps/web/package.json`: a critical RCE in the Image Optimization API (SVG processed by sharp on glibc Linux) and a high-severity DoS in the App Router via Server Actions. Both are fixed in `15.5.28`. Dependabot only offers the Next 16 major (#36), which is out of scope until stage 1 ends, so the patch has to be applied by hand within 15.x.

## What Changes

- Bump `next` from `15.5.27` to `15.5.28`, keeping the exact pin.
- Bump `eslint-config-next` from `15.5.27` to `15.5.28` (published on the registry) so the lint config matches the framework version.
- Regenerate `apps/web/pnpm-lock.yaml` with pnpm; no other dependency changes.
- Add toolchain tests that fail if `next` is not exact-pinned, if `eslint-config-next` drifts from it, if the lockfile resolves a different `next`, or if any resolved `sharp` is below `0.35.5`.
- Record the exploitability assessment (image optimizer and Server Actions exposure, Vercel image handling) in `design.md`.
- Document in `docs/ARCHITECTURE.md` (Toolchain section) why `next` stays exact-pinned and that 15.x security patches are applied by hand until the Next 16 change.

Out of scope: the Next 16 upgrade and Dependabot PRs #35/#36.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `dependency-pipeline`: adds requirements that the framework is exact-pinned with its lint config in lockstep, and that resolved versions stay at or above the patched security floor.

## Impact

- `apps/web/package.json`, `apps/web/pnpm-lock.yaml` (dependency versions only).
- `apps/web/tests/unit/toolchain.test.ts` (new assertions).
- `docs/ARCHITECTURE.md` (Toolchain section).
- Runtime: Next.js server code changes only within the 15.5 patch line; no app code changes.
