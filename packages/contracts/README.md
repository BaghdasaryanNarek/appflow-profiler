# AppFlow Profiler Contracts

This package houses the shared API and protocol contract schemas governing the communication
between the Python backend (`apps/api`) and Next.js frontend (`apps/web`).

## Single Source of Truth

All contracts are authored strictly as Pydantic v2 models in `apps/api`:
- **Domain & REST Models:** `apps/api/src/appflow/domain/models.py`
- **Realtime WebSocket Protocol:** `apps/api/src/appflow/streaming/protocol.py`
- **Optimization Advisor:** `apps/api/src/appflow/advisor/models.py`

## Schema Generation Pipeline

JSON Schemas are generated deterministically using:
```bash
# From repository root:
make contracts
# Or directly via uv:
uv run --project apps/api python apps/api/scripts/export_schema.py
```

Generated schema files:
- `schema/topology.schema.json`: Graph entities, metrics, summaries, and REST payloads.
- `schema/ws-protocol.schema.json`: WebSocket message envelopes, server/client discriminated unions, and delta patches.
- `schema/insights.schema.json`: Optimization Advisor request parameters, diagnostic bottlenecks, and recommendations.

## Frontend Consumption

In `apps/web`, TypeScript types are compiled from these JSON Schemas into `src/types/contracts.gen.ts` via `json-schema-to-typescript`.

Hand-editing schema JSON or generated TypeScript files is strictly forbidden. CI enforces zero drift.
