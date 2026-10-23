# ADR 0003: Queueing-Theoretic Simulation Source (`ENV=demo`)

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

In local Linux/macOS environments (`ENV=live`), AppFlow Profiler inspects real operating system processes and sockets via `psutil`. However, a public cloud demo hosted inside an isolated PaaS container (Render) has no multi-service production fleet on localhost and restricted `/proc` visibility. Static JSON mocks fail to exercise differential streaming, sparkline ring buffers, or realistic bottleneck cascades.

## Decision

1. Abstract telemetry collection behind the `TelemetrySource` protocol (`apps/api/src/appflow/sources/base.py`).
2. Implement `SimulationSource` (`ENV=demo` / `ENV=test`) backed by a 16-service e-commerce microservice DAG (`53` nodes, `17` edges across 5 groups) using:
   - **Diurnal + Ornstein-Uhlenbeck + Hawkes self-exciting arrival processes** for realistic traffic bursts.
   - **M/M/c Erlang C queueing formulas and Little's Law** ($L = \lambda W$) to derive queue wait times, tail latencies (`p50`/`p95`/`p99`), thread saturation, and error rates from first principles.
   - **Four interactive chaos scenarios** (`request-storm`, `db-pool-exhaustion`, `cache-stampede`, `slow-dependency`).
3. Ensure `ENV=demo` never imports `psutil` at runtime.

## Consequences

- **Positive:** Cloud evaluators experience realistic, mathematically consistent cascading failures and recovery dynamics while exercising 100% of the production aggregation, diffing, and advisor pipeline.
- **Trade-off:** Additional simulation physics module (`apps/api/src/appflow/simulation/`) maintained alongside `PsutilSource`.
