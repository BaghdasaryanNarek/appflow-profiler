"""Shared pytest fixtures."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from appflow.config import Environment, Settings, get_settings
from appflow.main import create_app


@pytest.fixture
def settings() -> Settings:
    """Deterministic settings for tests, independent of the host environment."""
    return Settings(env=Environment.TEST, tick_ms=50, log_level="WARNING")


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    """A TestClient running the full lifespan."""
    with TestClient(create_app(settings)) as test_client:
        yield test_client


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
