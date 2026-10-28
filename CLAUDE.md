# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working agreements

- Every change goes through OpenSpec (`/opsx:propose` → `/opsx:apply`) and a pull request. `main` is protected; never push to it directly.
- Never edit generated files by hand: `apps/web/src/types/contracts.gen.ts` and `packages/contracts/schema/`. Regenerate them with `make contracts`.
- Update `docs/HANDOFF.md` in the same PR whenever behavior, architecture, CI or deployment changes. (The file is added in a follow-up PR; until it exists, update `docs/ARCHITECTURE.md` instead.)
- The quality gate is `make ci`. Report its real output; never claim it passes without running it.

## Repository shape

Polyglot monorepo, no root package manager:

- `apps/api` — FastAPI backend, Python 3.12, managed with `uv` (`uv.lock`). Package is `appflow` under `src/`.
- `apps/web` — Next.js 15 App Router, React 19, TypeScript strict, managed with `pnpm` (`pnpm-lock.yaml` lives in `apps/web`, not the root). Path alias `@/` → `apps/web/src`.
- `packages/contracts/schema` — JSON Schemas generated from the backend's Pydantic models; the frontend's types are generated from them.
- `openspec/` — specs and change proposals (see Working agreements).

## Commands

All `make` targets run from the repo root (`make help` lists them).

```bash
make dev          # API on 127.0.0.1:8000 (reload) + Next dev on :3000
make ci           # api-check + contracts + web-check (mirrors .github/workflows/ci.yml)
make api-check    # uv sync, ruff check, ruff format --check, mypy --strict src tests, pytest (coverage >= 85%)
make contracts    # regenerate schemas + TS types, then fail on git diff
make web-check    # eslint, prettier --check, tsc, vitest, next build
make smoke        # scripts/smoke_deploy.py against API_URL / WEB_URL (defaults to demo backend)
```

Backend (from `apps/api`):

```bash
uv run pytest tests/unit/test_diff.py                 # one file
uv run pytest tests/unit/test_diff.py::test_name -q   # one test
uv run pytest -k scenario                             # by keyword
uv run uvicorn appflow.main:create_app --factory --reload
```

Frontend (from repo root, or drop `--dir apps/web` inside `apps/web`):

```bash
pnpm --dir apps/web test                               # vitest run (jsdom)
pnpm --dir apps/web exec vitest run tests/unit/ring-buffer.test.ts
pnpm --dir apps/web exec vitest run -t "resync"        # by test name
pnpm --dir apps/web e2e                                # Playwright, tests/e2e, Chromium only
```

E2E needs a production build and a running backend: Playwright's `webServer` runs `pnpm start` (so `pnpm build` first, with `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` set at build time), and CI starts the API with `ENV=test`. Set `PLAYWRIGHT_SKIP_WEBSERVER=1` to point at an already running server via `BASE_URL`.

## Hard rules from the repo

- After changing any Pydantic model in `domain/models.py`, `streaming/protocol.py` or `advisor/models.py`, run `make contracts` and commit both `packages/contracts/schema/` and the generated TS; CI fails on drift. A new top-level model must also be added to a bundle in `apps/api/scripts/export_schema.py` to be exported.
- Do not introduce new suppressions (`# noqa`, `# type: ignore`, `eslint-disable`, `@ts-ignore`). Existing ones are known tech debt: three `# type: ignore[no-any-return]` in apps/api/src/appflow/api/deps.py and `eslint-disable` in apps/web tests and the generated contracts.gen.ts. Don't touch them unless a task asks for it.
- pytest runs with `filterwarnings = ["error"]` and `--strict-markers`: any new warning fails the suite. `asyncio_mode = "auto"`.
- ESLint runs with `--max-warnings 0` and includes `jsx-a11y`. Component tests use `vitest-axe`, E2E uses `@axe-core/playwright`; new interactive UI must be keyboard-operable and pass axe with zero serious/critical violations.
- All Pydantic models use `ConfigDict(frozen=True, extra="forbid")`; follow that for new models.

## Backend architecture (`apps/api/src/appflow`)

Data flows one way per tick: **source → aggregator → diff → hub → WebSocket clients**.

- `main.create_app(settings=None)` is an app factory (always run uvicorn with `--factory`). The lifespan builds the source, `TopologyAggregator`, `StreamHub` and `AdvisorService` and stores them on `app.state`; routes read them from there via `api/deps.py`. Tests inject `Settings` directly (see `tests/conftest.py`: `env=TEST`, `tick_ms=50`, `GEMINI_API_KEY` removed).
- `config.Settings` (pydantic-settings, frozen, cached by `get_settings()`) — `ENV` picks the source: `live` → `sources/psutil_source.PsutilSource` (real OS processes/sockets), `demo`/`test` → `simulation/source.SimulationSource`. `sources/factory.build_source` imports implementations lazily so `psutil` is never loaded in demo containers; keep it that way.
- `sources/base.TopologySource` is the protocol (`start`/`sample`/`stop`/`capabilities`) returning `RawSample`. `sources/sanitize.py` redacts secrets from process `cmdline` before data leaves the source.
- `simulation/` — `blueprint.py` (fixed e-commerce service DAG), `queueing.py` (M/M/c Erlang C), `traffic.py` (OU noise, Hawkes bursts), `scenarios.py` (chaos scenarios triggered via `routes_simulation`), `engine.py` ties them together. Deterministic from `SIM_SEED`. Math is documented in `docs/SIMULATION.md`.
- `streaming/aggregator.py` turns raw samples into `TopologyGraph` with 120-tick histories and the health state machine (`domain/health.py`); `streaming/diff.py` computes deltas with 0.5% relative ε-suppression; `streaming/hub.py` runs the tick loop, sends periodic full snapshots (`SNAPSHOT_EVERY_S`) and gives each client a bounded queue (maxsize 8) — on overflow it drops deltas and forces a resync instead of blocking the loop.
- `streaming/protocol.py` + `api/ws_topology.py` — WS protocol `v=1` at `/ws/v1/topology`: `hello` → client `subscribe` → `snapshot` → `delta` (with `base_seq`) / `health_event`; client sends `resync` on a seq gap. Origin is checked with `Settings.is_origin_allowed`; reject closes with 1008.
- `advisor/` — `digest.py` builds a compact hashed `TopologyDigest`; `gemini_client.py` calls Gemini with structured output; `service.py` caches by digest hash, applies the grounding guard (drops recommendations whose evidence IDs aren't in the live graph) and falls back to `heuristics.py` when no key / timeout / rate limit. Exposed as `POST /api/v1/insights/analyze`.
- `api/errors.py` — all HTTP errors are RFC 9457 `application/problem+json` with a `correlation_id`. `api/deps.TokenBucketLimiter` instances live on `app.state` (scenario activation, insights).
- Entity IDs are prefixed strings (`svc:`, `proc:`, `ext:`, `edge:<src>-><dst>:<proto>`, `grp:`) built in `domain/ids.py`; the frontend relies on these formats.
- State is in-process: the API must run with a single worker (ADR-0005). Don't add multi-worker assumptions or per-request global state that would break seq consistency.

## Frontend architecture (`apps/web/src`)

- `lib/realtime/RealtimeClient.ts` is a module-level singleton owning the WebSocket (backoff in `backoff.ts`, seq-gap → resync, frames batched once per `requestAnimationFrame`, cold-start wake-up ping to `/healthz`). Components use it only through `useTopologyStream()`.
- `store/topology-store.ts` (Zustand) holds normalized `Map`/`Set` nodes, edges, adjacency and per-entity `RingBuffer` (`Float64Array(120)`) histories; it applies snapshots and deltas. `store/ui-store.ts` holds connection status, filters, selection. Read via `store/selectors.ts` with `useShallow`; avoid selectors that allocate new objects per render.
- Layout runs off the main thread: `workers/layout.worker.ts` (elkjs, dagre fallback) via `lib/layout/worker-bridge.ts`, memoized by `lib/layout/fingerprint.ts` so metric-only deltas don't re-layout. Changes to node/edge structure must keep the fingerprint meaningful.
- Routes: `/topology` (`@xyflow/react` canvas, custom nodes in `components/topology/`), `/processes` (virtualized table — the accessible equivalent of the canvas; keep both representations in sync), `/insights`, `/about`.
- `lib/api/client.ts` — REST client; base URLs come from `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` (baked in at build time).
- `components/ui/` are shadcn/ui primitives (`components.json`).
- Security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) are set in BOTH `apps/web/next.config.ts` and `apps/web/vercel.json`; keep them in sync. The CSP is defined only in `next.config.ts`.

## Deployment

Backend: `apps/api/Dockerfile` (non-root, `--workers 1`) deployed via `render.yaml` with `ENV=demo`. Frontend: Vercel (`apps/web/vercel.json`). Details in `docs/DEPLOYMENT.md`; design rationale in `docs/ARCHITECTURE.md` and `docs/ADR/`.
