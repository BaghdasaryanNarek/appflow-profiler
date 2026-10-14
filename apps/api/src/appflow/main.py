"""Application factory.

Run with: ``uvicorn appflow.main:create_app --factory``
"""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from appflow import __version__
from appflow.api import routes_health
from appflow.api.errors import register_error_handlers
from appflow.config import Settings, get_settings
from appflow.logging import configure_logging, get_logger

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
        yield
        _log.info("shutdown")

    app = FastAPI(
        title="AppFlow Profiler API",
        version=__version__,
        summary="Network topology and observability daemon.",
        lifespan=lifespan,
    )
    app.state.settings = resolved

    register_error_handlers(app)
    app.include_router(routes_health.router)

    return app
