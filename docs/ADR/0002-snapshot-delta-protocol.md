# ADR 0002: WebSocket Snapshot + Epsilon-Delta Wire Protocol (`v=1`)

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Broadcasting a full 53–500 node topology graph to every connected browser client at 1 Hz consumes excessive bandwidth and triggers full React tree reconciliations on every tick. Conversely, pure event-streaming without periodic reconciliation risks unbounded state divergence if a client drops frames or backgrounds its tab.

## Decision

1. Implement a hybrid **Snapshot + Differential Delta** protocol over `WS /ws/v1/topology` (`v: 1`) with strictly monotonic sequence numbers (`seq`).
2. Suppress metric updates whose relative change is below $\epsilon = 0.5\%$ (`DiffEngine`), emitting only changed metrics, added/removed entities, and health transitions.
3. Emit a full `snapshot` upon initial `subscribe`, every `30` ticks (`SNAPSHOT_EVERY_S`), or whenever a client sends `resync` after detecting `delta.base_seq !== client.lastAppliedSeq`.
4. Bound per-client server queues to `maxsize=8`; on overflow, drop stale deltas and schedule a full snapshot resync.

## Consequences

- **Positive:** Steady-state delta payloads average `5.18%` of full snapshot byte size (`~1.58 KB` vs `~30.5 KB`), while client state self-heals automatically from any network gap.
- **Trade-off:** Clients must maintain a sequence state machine (`RealtimeClient`) and normalized copy-on-write store (`useTopologyStore`).
