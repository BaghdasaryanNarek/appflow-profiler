# Contributing to AppFlow Profiler

Thank you for your interest in contributing to **AppFlow Profiler**. This document outlines the development workflow, quality gates, and architectural conventions enforced across the monorepo.

---

## 1. Development Environment Setup

### Prerequisites
- **Python 3.12+** managed via [`uv`](https://docs.astral.sh/uv/) (`~/.local/bin/uv`)
- **Node.js 20+** and **pnpm 9.15+**

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
