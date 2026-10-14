"""Health endpoint and error-handling integration tests."""

from http import HTTPStatus

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


def test_readyz_reports_starting_before_stream_hub_exists(client: TestClient) -> None:
    response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json() == {"status": "starting", "source_ready": False, "tick_age_ms": None}


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
