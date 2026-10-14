# appflow (backend)

FastAPI daemon for AppFlow Profiler. See [`docs/MASTER_PLAN.md`](../../docs/MASTER_PLAN.md).

- Install: `uv sync`
- Run: `uv run uvicorn appflow.main:create_app --factory --reload`
- Check: `make api-check` (from repository root)
