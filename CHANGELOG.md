# Changelog

All notable changes to **AppFlow Profiler** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-23

### Added

- **Polyglot Monorepo & Schema-First Contract Pipeline (`packages/contracts`)**:
  - Canonical Pydantic v2 domain models (`extra="forbid"`, `frozen=True`) for topology graphs, differential WebSocket frames (`v=1`), optimization advisor reports, and RFC 9457 Problem Details.
  - Automated JSON Schema (2020-12) and OpenAPI 3.1 exporter (`apps/api/scripts/export_schema.py`) paired with TypeScript contract codegen (`apps/web/scripts/gen-contracts.mjs` $\rightarrow$ `contracts.gen.ts`) and CI drift verification.
- **Dual-Source Telemetry Engine (`apps/api/src/appflow/sources/` & `simulation/`)**:
  - `PsutilSource` (`ENV=live`) for real-time OS process and TCP/UDP socket discovery with EMA-smoothed CPU tracking, graceful non-root permission fallback (`MetricQuality.PARTIAL`), and regex-based `cmdline` secret redaction.
  - `SimulationSource` (`ENV=demo` / `ENV=test`) modeling a 16-service e-commerce DAG (`53` nodes, `17` edges across 5 service groups) powered by M/M/c Erlang C queueing, Little's Law, Ornstein-Uhlenbeck noise, and Hawkes self-exciting bursts.
  - Four interactive chaos scenarios (`request-storm`, `db-pool-exhaustion`, `cache-stampede`, `slow-dependency`) with auto-cycle mode (`SIM_AUTOPLAY=true`) and on-demand activation/reset REST endpoints.
- **Differential WebSocket Streaming Engine (`apps/api/src/appflow/streaming/`)**:
  - `TopologyAggregator` with 120-tick bounded ring-buffer deques, deterministic multi-signal health state machine (`healthy`, `degraded`, `critical`), and automatic dead-PID history pruning.
  - `DiffEngine` with $0.5\%$ relative $\epsilon$-suppression (`5.18%` steady-state delta-to-snapshot byte ratio) and 30-second periodic full-snapshot reconciliation.
  - `StreamHub` with bounded per-client queues (`maxsize=8`), non-blocking drop-and-resync backpressure, and origin-validated WebSocket upgrades (`WS /ws/v1/topology`).
- **Two-Tier AI & Heuristic Optimization Advisor (`apps/api/src/appflow/advisor/`)**:
  - Privacy-preserving `TopologyDigest` builder (`≤ 6 KB` JSON, SHA-256 `digest_hash`) ranking top anomalous nodes and edges.
  - `GeminiAdvisorClient` (`gemini-3.8-flash` via `google-genai` Structured Outputs) with strict wall-clock timeout enforcement, 60s TTL digest caching, and a Grounding Guard that strips hallucinated node IDs.
  - Deterministic SRE heuristic engine (`heuristics.py`) across 7 rule categories (`capacity`, `connection_pooling`, `retry_policy`, `caching`, `topology`, `timeouts`) providing `< 2 ms` zero-downtime fallback.
- **Next.js 15 App Router Frontend (`apps/web/`)**:
  - **Design System & Shell**: Dark-first OKLCH semantic tokens, `TopBar` with live connection state, scenario injector, snapshot JSON import/export, `CommandMenu` (`⌘K`), and `HealthAnnouncer` (`aria-live="polite"` with 5s sliding-window deduplication).
  - **Interactive Topology Canvas (`/topology`)**: `@xyflow/react` island with custom `ServiceNode`, `ProcessNode`, `DatabaseNode`, `QueueNode`, `ExternalNode`, and `ClusterNode` cards, animated `TrafficEdge` strokes, off-main-thread `elkjs` Web Worker layout (`layout.worker.ts`) with `dagre` fallback, and SSR-to-live hydrated `KpiStrip`.
  - **Progressive Disclosure Detail Sheet (`NodeDetailSheet`)**: Resizable (`360px–680px`) `@container`-responsive inspector with `Overview`, `Sockets`, `Neighbours`, and `Advisor` tabs, hand-rolled accessible SVG `Sparkline`, TCP `StateBar`, and virtualized `SocketTable`.
  - **WCAG 2.2 AA Accessibility & Virtualized Table View (`/processes`)**: Severity-ordered `Tab` stop ordering, angular-cone `Arrow` key neighbour navigation, deterministic focus restoration, and a full keyboard/screen-reader equivalent table (`TopologyTable`) powered by `@tanstack/react-virtual`.
  - **Optimization Advisor View (`/insights`) & Architecture Disclosure (`/about`)**: Global and node-scoped diagnostic runner with clickable `EvidenceChip` deep-linking via View Transitions and runtime capability telemetry on `/about`.
- **Production Deployment, Verification & Soak Suite**:
  - Multi-stage non-root `apps/api/Dockerfile` (`USER appflow`), declarative `render.yaml` Blueprint, `apps/web/vercel.json` + CSP security headers, `.vercel.app` preview origin suffix allowlist, cold-start `/healthz` wake-up ping, 6-point `scripts/smoke_deploy.py` (`make smoke`), 1,800-tick memory soak suite, and 4-job GitHub Actions CI pipeline (`api`, `contracts`, `web`, `e2e`).
