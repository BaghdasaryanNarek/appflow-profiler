# Design

## Context

See proposal.md - Why. The frontend pins `next` and `eslint-config-next` to `15.5.27` exactly. The lockfile already resolves `sharp@0.35.5` (an optional dependency of `next`), and `next@15.5.28` narrows its `sharp` range from `^0.34.3 || ^0.35.4` to `^0.34.3 || ^0.35.5` (checked with `pnpm view`). Production runs on Vercel (`apps/web/vercel.json`, `pnpm install --frozen-lockfile` + `pnpm build`); CI and E2E run `next start` locally.

## Exploitability assessment

Facts were checked against the code at the base of this change. Items marked **unverified** were not confirmed and must not be relied on.

### Image Optimization API (critical, SVG via sharp)

- `next/image`, `next/legacy/image` and `getImageProps` are not imported anywhere in `apps/web/src`; nothing references `/_next/image`.
- `next.config.ts` has no `images` block: the default loader is active, `images.unoptimized` is not set, `dangerouslyAllowSVG` is not set (default `false`), and `remotePatterns` is not set.
- The optimizer route is still served even though the app does not use it: Next's server returns 404 for `/_next/image` only when `images.unoptimized` is true or a non-default loader is configured (`packages/next/src/server/next-server.ts`, via Context7). So `next start` (CI, E2E, any self-hosted run) exposes the endpoint.
- `apps/web/public/` contains five SVG files (`file.svg`, `globe.svg`, `next.svg`, `vercel.svg`, `window.svg`), so local SVG sources exist for that endpoint.
- By default Next does not optimize SVGs without `dangerouslyAllowSVG`. **Unverified:** whether the advisory's attack path needs `dangerouslyAllowSVG`, remote patterns, or neither. The advisory text was not read in this change.
- The stated workaround (`sharp >= 0.35.5`) was already met by the lockfile before this change.
- **Unverified:** how Vercel serves `/_next/image` for this project, in particular whether requests are handled by Vercel's image optimization infrastructure instead of the Next server's `sharp`. A Vercel docs search did not answer it. Verify in the Vercel dashboard (project → Images / usage) or in Vercel's Image Optimization docs.

Assessment: exposure is reduced (no app usage, no SVG opt-in, patched `sharp` already resolved) but not ruled out, because the endpoint is live by default.

### Server Actions (high, App Router DoS)

- No file in `apps/web/src` contains a `"use server"` directive; there are no `useActionState`/`useFormStatus` hooks or `action={...}` form props.
- **Unverified:** whether the vulnerable request handling is reachable when an app defines no Server Actions (for example, a POST carrying a `Next-Action` header to any App Router page).

Assessment: the app does not use Server Actions; reachability without them is unknown, so the patch is applied regardless.

## Goals / Non-Goals

**Goals:**
- Run on `next@15.5.28`, keep the exact pin, and lock that in with tests (see specs).

**Non-Goals:**
- Disabling the optimizer (`images.unoptimized: true`) or other hardening; that changes behavior and belongs in its own change.
- Any Next 16 work.

## Decisions

- **Bump in place instead of merging #36.** Next 16 is a major with breaking changes and is scheduled after stage 1; the patch release fixes both advisories with no API changes.
- **Keep the exact pin.** A range (`^15.5.28`) would let a fresh lock resolution pull new 15.x code without review. With an exact pin, every framework change is a reviewed diff in `package.json`. The cost is that patches are manual while Dependabot proposes only the major.
- **`eslint-config-next` in lockstep.** It is versioned with `next`; equal versions avoid lint rules drifting from the framework.
- **Floor checks in `toolchain.test.ts`, parsing the lockfile as text.** It reuses the existing test file and needs no YAML dependency. The check matches the lockfile's package keys (`next@x.y.z`, `sharp@x.y.z`), so it is a regression guard, not a full lockfile parser.
- **Update with `pnpm add --save-exact`** so pnpm rewrites the lockfile in its native format (required by the existing `dependency-pipeline` spec).

## Risks / Trade-offs

- [Patch release regresses runtime behavior] → full `make ci` plus the Playwright suite against a production build before merge.
- [Text matching misses a renamed lockfile key format after a pnpm upgrade] → the tests also assert that at least one `next` and one `sharp` entry were found, so a format change fails loudly instead of passing vacuously.
- [Next 15.x gets further advisories] → handled by hand per `docs/ARCHITECTURE.md` until the Next 16 change.

## Migration Plan

Merge, and Vercel redeploys from `main`. Rollback is a revert of the commit (restores `15.5.27` and the old lockfile).
