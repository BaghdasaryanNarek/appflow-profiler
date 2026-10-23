# ADR 0005: Single-Worker Stateful Deployment on Render (`--workers 1`)

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

AppFlow Profiler maintains in-memory 120-tick ring buffers (`TopologyAggregator`), monotonic sequence numbers (`StreamHub`), and interactive chaos scenario state (`SimulationEngine`). Running multiple `uvicorn` worker processes without an external distributed pub/sub broker would cause different WebSocket and REST clients to hit different worker processes with divergent sequence numbers and scenario states.

## Decision

1. Run the FastAPI container with `--workers 1` and `numInstances: 1` in `apps/api/Dockerfile` and `render.yaml`, handling concurrency via Python `asyncio` coroutines and bounded per-client queues.
2. Pair the Render free-tier web service with client-side cold-start detection (`> 3,500 ms` handshake threshold in `RealtimeClient`), triggering an HTTP `GET /healthz` wake-up ping and displaying a transparent `"Waking up demo backend… (~30s)"` status badge in the top bar.

## Consequences

- **Positive:** Zero external infrastructure dependencies (no Redis/Kafka required for the demo), strongly consistent sequence numbers across REST and WebSocket requests, and graceful UX across free-tier sleep cycles.
- **Trade-off:** Vertical concurrency is bounded by a single Python event loop (`MAX_WS_CLIENTS=50` by default).
