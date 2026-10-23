# ADR 0001: Polyglot Monorepo & Schema-First Contract Pipeline

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

AppFlow Profiler couples a Python 3.12 FastAPI telemetry/simulation backend (`apps/api`) with a Next.js 15 TypeScript 5.8 frontend (`apps/web`) communicating over REST and a custom WebSocket differential protocol (`v=1`). Hand-maintaining duplicate Pydantic models and TypeScript interfaces across repositories leads to silent wire-format drift.

## Decision

1. Organize the project as a single polyglot monorepo (`apps/api`, `apps/web`, `packages/contracts`).
2. Establish **Pydantic v2** domain models (`extra="forbid"`, `frozen=True`) in `apps/api` as the single source of truth.
3. Export JSON Schema Draft 2020-12 artifacts and OpenAPI 3.1 specs into `packages/contracts/` via `apps/api/scripts/export_schema.py` and compile them into `apps/web/src/types/contracts.gen.ts` via `apps/web/scripts/gen-contracts.mjs`.
4. Enforce a dedicated `contracts` CI job that fails on any uncommitted diff in `packages/contracts` or `apps/web/src/types`.

## Consequences

- **Positive:** Zero runtime schema mismatches between backend frames and frontend Zustand store consumers; strict compile-time safety across both languages.
- **Trade-off:** Schema changes require running `make contracts` before committing.
