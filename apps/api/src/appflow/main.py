"""Application factory.

Run with: ``uvicorn appflow.main:create_app --factory``
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from appflow import __version__
from appflow.api import (
    routes_health,
    routes_meta,
    routes_simulation,
    routes_topology,
    ws_topology,
)
from appflow.api.deps import TokenBucketLimiter
from appflow.api.errors import register_error_handlers
from appflow.config import Settings, get_settings
from appflow.logging import configure_logging, get_logger
from appflow.sources.factory import build_source
from appflow.streaming import StreamHub, TopologyAggregator

_log = get_logger(__name__)


def create_app(settings: Settings | None = None) -> FastAPI:
    """Build a configured FastAPI application.

    ``settings`` may be injected (tests); otherwise they are read from the environment.
    """
    resolved = settings if settings is not None else get_settings()
    configure_logging(resolved.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        _log.info("startup", version=__version__, env=resolved.env.value, tick_ms=resolved.tick_ms)
        source = build_source(resolved)
        await source.start()
        aggregator = TopologyAggregator()
        hub = StreamHub(source=source, aggregator=aggregator, settings=resolved)
        await hub.start()

        app.state.source = source
        app.state.aggregator = aggregator
        app.state.hub = hub

        yield

        await hub.stop()
        await source.stop()
        _log.info("shutdown")

    app = FastAPI(
        title="AppFlow Profiler API",
        version=__version__,
        summary="Network topology and observability daemon.",
        lifespan=lifespan,
    )
    app.state.settings = resolved
    app.state.source = None
    app.state.aggregator = None
    app.state.hub = None
    # Per-app isolated token-bucket limiter for scenario activations (1 req / 10s)
    app.state.scenario_limiter = TokenBucketLimiter(rate_per_second=0.1, capacity=1.0)

    # CORS configuration per ALLOWED_ORIGINS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=resolved.allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    register_error_handlers(app)
    app.include_router(routes_health.router)
    app.include_router(routes_meta.router)
    app.include_router(routes_topology.router)
    app.include_router(routes_simulation.router)
    app.include_router(ws_topology.router)

    return app
