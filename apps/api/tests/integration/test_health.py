"""Health endpoint and error-handling integration tests."""

import time
from http import HTTPStatus
from typing import cast

from fastapi import FastAPI
from fastapi.testclient import TestClient

from appflow import __version__
from appflow.api.errors import PROBLEM_JSON
from appflow.config import Settings
from appflow.main import create_app


def test_healthz_returns_ok(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_readyz_reports_ok_when_hub_is_fresh(client: TestClient) -> None:
    response = client.get("/readyz")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["source_ready"] is True
    assert isinstance(data["tick_age_ms"], int)
    assert data["tick_age_ms"] <= 5000


def test_readyz_reports_503_when_hub_uninitialized(settings: Settings) -> None:
    # Build app without entering lifespan context
    app = create_app(settings)
    raw_client = TestClient(app, raise_server_exceptions=False)
    response = raw_client.get("/readyz")
    assert response.status_code == 503
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    data = response.json()
    assert data["status"] == 503
    assert data["source_ready"] is False


def test_readyz_reports_503_when_tick_loop_stalled(client: TestClient) -> None:
    # Artificially simulate stalled tick loop (> 5000 ms)
    app = cast("FastAPI", client.app)
    hub = app.state.hub
    assert hub is not None
    original_running = hub._running
    original_tick = hub._last_tick_monotonic
    try:
        hub._running = False
        hub._last_tick_monotonic = time.monotonic() - 10.0  # 10s age
        response = client.get("/readyz")
        assert response.status_code == 503
        assert response.headers["content-type"].startswith(PROBLEM_JSON)
        data = response.json()
        assert data["status"] == 503
        assert data["source_ready"] is False
        assert data["tick_age_ms"] >= 5000
    finally:
        hub._running = original_running
        hub._last_tick_monotonic = original_tick


def test_app_exposes_settings_and_version(settings: Settings) -> None:
    app = create_app(settings)
    assert app.state.settings is settings
    assert app.version == __version__


def test_unknown_route_returns_problem_json(client: TestClient) -> None:
    response = client.get("/does-not-exist")
    assert response.status_code == 404
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    assert body["status"] == 404
    assert body["title"] == "Not Found"
    assert body["instance"] == "/does-not-exist"


def _app_with_probe_routes(settings: Settings) -> FastAPI:
    app = create_app(settings)

    @app.get("/_probe/items/{item_id}")
    async def probe_item(item_id: int) -> dict[str, int]:
        return {"item_id": item_id}

    @app.get("/_probe/boom")
    async def probe_boom() -> None:
        raise RuntimeError("synthetic failure")

    return app


def test_validation_error_returns_problem_json(settings: Settings) -> None:
    with TestClient(_app_with_probe_routes(settings)) as test_client:
        response = test_client.get("/_probe/items/not-an-int")
    assert response.status_code == 422
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    body = response.json()
    assert body["title"] == HTTPStatus.UNPROCESSABLE_ENTITY.phrase
    assert body["errors"][0]["loc"] == ["path", "item_id"]


def test_unhandled_error_returns_problem_json(settings: Settings) -> None:
    app = _app_with_probe_routes(settings)
    with TestClient(app, raise_server_exceptions=False) as test_client:
        response = test_client.get("/_probe/boom")
    assert response.status_code == 500
    assert response.headers["content-type"].startswith(PROBLEM_JSON)
    assert response.json()["detail"] == "An unexpected error occurred."
