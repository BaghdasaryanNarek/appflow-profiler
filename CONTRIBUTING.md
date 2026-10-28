# Contributing to AppFlow Profiler

Thank you for your interest in contributing to **AppFlow Profiler**. This document outlines the development workflow, quality gates, and architectural conventions enforced across the monorepo.

---

## 1. Development Environment Setup

### Prerequisites
- **Python 3.12+** managed via [`uv`](https://docs.astral.sh/uv/) (`~/.local/bin/uv`)
- **Node.js 24**. The source of truth is `engines.node` in [`apps/web/package.json`](apps/web/package.json): CI (`actions/setup-node`) and Vercel both read it. Install Node 24 any way you like (system package, official installer, a version manager); none is required. The root [`.nvmrc`](.nvmrc) exists only as a convenience for nvm/fnm users and is kept on the same major by a unit test.
- **pnpm 11 or newer** on your `PATH`. The exact version is pinned in the `packageManager` field of [`apps/web/package.json`](apps/web/package.json); any pnpm 11+ downloads and runs that version automatically (pnpm's default `pmOnFail: download`), so you never upgrade pnpm by hand for this repo.

### Bootstrap
```bash
cp .env.example .env
cd apps/api && uv sync --frozen --all-extras && cd ../..
pnpm --dir apps/web install --frozen-lockfile
```

---

## 2. Contract-First Workflow (`packages/contracts`)

Never edit [`apps/web/src/types/contracts.gen.ts`](apps/web/src/types/contracts.gen.ts) by hand. When modifying any Pydantic model in `apps/api/src/appflow/domain/models.py`, `streaming/protocol.py`, or `advisor/models.py`:

```bash
make contracts
```

This exports updated JSON Schemas into `packages/contracts/` and regenerates `apps/web/src/types/contracts.gen.ts`.

---

## 3. Quality Gates & Verification

Before opening a pull request, verify that all local gates pass with zero errors or warnings:

```bash
# Run backend (ruff, mypy --strict, pytest), contract drift check, and frontend (eslint, prettier, tsc, vitest, next build)
make ci

# Run the 6-point deployment smoke verification
make smoke

# Run Playwright Chromium E2E & WCAG 2.2 AA accessibility tests
pnpm --dir apps/web e2e
```

### Coding Standards
- **Zero Linter/Type Suppressions**: Do not introduce `# noqa`, `# type: ignore`, `eslint-disable`, or `@ts-ignore`.
- **Accessibility**: Every interactive component must support full keyboard operation, visible focus indicators, and pass `vitest-axe` and `@axe-core/playwright` with zero serious or critical violations.
- **Conventional Commits**: Follow `<type>(<scope>): <summary>` (`feat`, `fix`, `perf`, `test`, `docs`, `build`, `chore`).

---

## 4. Dependency Updates

Dependency updates are proposed by Dependabot ([`.github/dependabot.yml`](.github/dependabot.yml)), weekly, for three ecosystems:

| Ecosystem | Directory | Lockfile | Labels | PR title prefix |
|-----------|-----------|----------|--------|-----------------|
| `uv` | `/apps/api` | `apps/api/uv.lock` | `dependencies`, `python` | `chore(deps):` / `chore(deps-dev):` |
| `npm` (pnpm) | `/apps/web` | `apps/web/pnpm-lock.yaml` | `dependencies`, `javascript` | `chore(deps):` / `chore(deps-dev):` |
| `github-actions` | `/` | – | `dependencies`, `github_actions` | `ci(deps):` |

### What you get
- **One grouped PR per ecosystem** (`uv-minor-patch`, `npm-minor-patch`, `actions-minor-patch`) with all minor and patch updates.
- **One PR per major update.** Majors are never grouped: they're the updates most likely to need code changes, and a separate PR is easy to review and revert.
- Labels must already exist in the repository; Dependabot silently drops unknown labels.

### How to review
1. CI must be green without manual commits: the update PR is a pure version bump, and the lockfiles are only ever written by their tools.
2. Grouped minor/patch PR: skim the lockfile diff for unexpected new packages, then merge.
3. Major PR: read the upstream changelog/migration guide, check out the branch and run `make ci` locally; fix breaking changes in the same PR or close it with a note.

### Lockfiles are tool-owned
`apps/web/pnpm-lock.yaml` and `apps/web/pnpm-workspace.yaml` are listed in [`apps/web/.prettierignore`](apps/web/.prettierignore). pnpm rewrites them in its own format on every install, so formatting them with Prettier made every Dependabot PR fail `format:check`. Never run Prettier on them; their correctness is enforced by `pnpm install --frozen-lockfile` in CI.

### Changing the Node.js or pnpm version
Change the version in one PR, in every place it's declared:
- **Node.js:** `engines.node` in `apps/web/package.json` (for example `"24.x"`) and the major in the root `.nvmrc`.
- **pnpm:** the exact version in `packageManager` in `apps/web/package.json` (for example `"pnpm@12.14.0"`; ranges are rejected). Then refresh the lockfile so its leading `packageManagerDependencies` document records the new version:

```bash
pnpm --dir apps/web install --lockfile-only
```

Then verify:

```bash
pnpm --dir apps/web exec vitest run tests/unit/toolchain.test.ts   # pins are consistent
pnpm --dir apps/web install --frozen-lockfile                       # lockfile matches
make ci
```

### If Dependabot can't update the pnpm lockfile
With `packageManager` set, pnpm 12 writes a second YAML document at the top of `pnpm-lock.yaml`. If Dependabot doesn't handle it, you'll see one of:
- the npm job under *Insights → Dependency graph → Dependabot → Recent update jobs* fails with an error about `pnpm-lock.yaml`, or no npm PRs appear at all;
- an npm PR fails CI at "Install dependencies" (`pnpm install --frozen-lockfile`);
- an npm PR's diff deletes or mangles the leading `packageManagerDependencies` document.

In that case, switch to pinning pnpm in CI instead, in one PR: remove `packageManager` from `apps/web/package.json`; in all three `pnpm/action-setup` steps of `.github/workflows/ci.yml` replace `package_json_file` with the exact `version:` (for example `version: 12.14.0`); regenerate the lockfile with that pnpm version (the leading document disappears); and point the pnpm check in `tests/unit/toolchain.test.ts` at `ci.yml`.
