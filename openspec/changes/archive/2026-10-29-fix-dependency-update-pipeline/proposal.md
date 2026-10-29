# Proposal

## Why

Every Dependabot PR fails CI at "Check formatting with Prettier": `prettier --check .` in `apps/web` also checks `pnpm-lock.yaml`, which was once committed in Prettier's style (`lockfileVersion: "9.0"`), while pnpm rewrites it in its own style on every update. 25 dependency PRs are blocked. The toolchain has also drifted: CI runs Node 22 with `pnpm version: 12` (floating, currently 12.14.0), Vercel builds with Node 24.x, local dev uses pnpm 12.11.2, and CONTRIBUTING still says "Node 20+, pnpm 9.15+". Separately, `apps/api` is locked with `uv.lock`, but Dependabot watches it through the `pip` ecosystem, which does not maintain `uv.lock`.

## What Changes

- Exclude tool-owned files (`pnpm-lock.yaml`, `pnpm-workspace.yaml`) from Prettier in `apps/web` via a new `.prettierignore`, and regenerate `pnpm-lock.yaml` in pnpm's native format (no dependency changes).
- Pin pnpm with `"packageManager": "pnpm@12.14.0"` in `apps/web/package.json`; CI's `pnpm/action-setup` reads it (`package_json_file: apps/web/package.json`) instead of the hard-coded `version: 12`.
- Standardize on Node 24 (LTS) for CI, Vercel and local dev: `"engines": { "node": "24.x" }` is the source of truth (read by Vercel and by `actions/setup-node` via `node-version-file`); a root `.nvmrc` (`24`) is a convenience for nvm/fnm users.
- Add a Vitest test that keeps `.nvmrc`, `engines.node`, `packageManager` and `.prettierignore` consistent.
- `dependabot.yml`: switch `/apps/api` from `pip` to `uv`; group minor+patch updates per ecosystem (majors stay separate PRs); set labels to the existing `dependencies` + `javascript` / `python` / `github_actions`; add Conventional Commits prefixes (`chore(deps)`, `chore(deps-dev)`, `ci(deps)`).
- Document the dependency update flow and toolchain pinning in `CONTRIBUTING.md` (no nvm requirement), plus a short toolchain/CI note in `docs/ARCHITECTURE.md`.

**BREAKING** (contributors only): local development and CI now expect Node 24; Node 22 is no longer the tested runtime.

## Capabilities

### New Capabilities
- `dependency-pipeline`: how dependency updates are proposed (Dependabot grouping, labels, commit prefixes, ecosystems) and how the toolchain (Node, pnpm) is pinned so that tool-generated updates pass the quality gate unchanged.

### Modified Capabilities
<!-- None: openspec/specs/ has no existing capabilities. -->

## Impact

- Files: `apps/web/.prettierignore` (new), `apps/web/pnpm-lock.yaml` (reformatted), `apps/web/package.json`, `.nvmrc` (new), `.github/workflows/ci.yml` (contracts, web, e2e jobs), `.github/dependabot.yml`, `apps/web/tests/unit/toolchain.test.ts` (new), `CONTRIBUTING.md`, `docs/ARCHITECTURE.md`.
- No application code, API or contract changes; no dependency version changes.
- Vercel build: Node already 24.x; the pnpm version now comes from `packageManager` (to verify in the Preview build log).
- Existing Dependabot `pip` PRs may be left orphaned after the switch to `uv` and need closing by hand.
- Out of scope: merging the existing 25 Dependabot PRs, major upgrades (Next.js 16, TypeScript 6, `@types/node` 20→24), pinning actions by SHA.
