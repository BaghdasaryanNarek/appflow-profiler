"""Unit and integration tests for Phase 17 deployment manifests, origins, and smoke checks."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from appflow.config import Environment, Settings
from appflow.main import create_app

REPO_ROOT = Path(__file__).resolve().parents[4]


def test_render_blueprint_manifest_structure() -> None:
    """Verify render.yaml exists and defines the expected appflow-api demo service."""
    render_path = REPO_ROOT / "render.yaml"
    assert render_path.is_file(), "render.yaml must exist at repository root"

    content = render_path.read_text(encoding="utf-8")
    assert "name: appflow-api" in content
    assert "rootDir: apps/api" in content
    assert "healthCheckPath: /healthz" in content
    assert "autoDeployTrigger: checksPass" in content
    assert "key: ENV" in content
    assert 'value: "demo"' in content
    assert "key: ALLOWED_ORIGIN_SUFFIXES" in content
    assert 'value: ".vercel.app"' in content
    assert "key: GEMINI_API_KEY" in content
    assert "sync: false" in content


def test_backend_dockerfile_and_dockerignore_hardening() -> None:
    """Verify apps/api/Dockerfile uses multi-stage build, non-root user, and healthcheck."""
    dockerfile_path = REPO_ROOT / "apps" / "api" / "Dockerfile"
    dockerignore_path = REPO_ROOT / "apps" / "api" / ".dockerignore"

    assert dockerfile_path.is_file()
    assert dockerignore_path.is_file()

    dockerfile = dockerfile_path.read_text(encoding="utf-8")
    assert "FROM python:3.12-slim AS builder" in dockerfile
    assert "FROM python:3.12-slim AS runtime" in dockerfile
    assert "uv sync --frozen --no-dev --no-editable" in dockerfile
    assert "USER appflow" in dockerfile
    assert "HEALTHCHECK" in dockerfile
    assert "--workers 1" in dockerfile
    assert "--proxy-headers" in dockerfile

    dockerignore = dockerignore_path.read_text(encoding="utf-8")
    assert ".env" in dockerignore
    assert ".venv/" in dockerignore
    assert "tests/" in dockerignore


def test_vercel_json_and_env_examples_exist_and_valid() -> None:
    """Verify apps/web/vercel.json and .env.example templates exist and contain required keys."""
    vercel_path = REPO_ROOT / "apps" / "web" / "vercel.json"
    assert vercel_path.is_file()

    vercel_cfg = json.loads(vercel_path.read_text(encoding="utf-8"))
    assert vercel_cfg["framework"] == "nextjs"
    header_rules = vercel_cfg.get("headers", [])
    assert len(header_rules) >= 1
    header_keys = {h["key"] for h in header_rules[0]["headers"]}
    assert "X-Content-Type-Options" in header_keys
    assert "X-Frame-Options" in header_keys
    assert "Referrer-Policy" in header_keys
    assert "Permissions-Policy" in header_keys

    api_env_example = (REPO_ROOT / "apps" / "api" / ".env.example").read_text(encoding="utf-8")
    assert "ALLOWED_ORIGINS=" in api_env_example
    assert "ALLOWED_ORIGIN_SUFFIXES=" in api_env_example
    assert "GEMINI_API_KEY=" in api_env_example

    web_env_example = (REPO_ROOT / "apps" / "web" / ".env.example").read_text(encoding="utf-8")
    assert "NEXT_PUBLIC_API_URL=" in web_env_example
    assert "NEXT_PUBLIC_WS_URL=" in web_env_example


def test_allowed_origin_suffixes_and_trailing_slash_normalization(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify Settings normalizes origins and validates HTTPS Vercel preview suffixes."""
    monkeypatch.setenv(
        "ALLOWED_ORIGINS",
        "http://localhost:3000/ , https://appflow-profiler.vercel.app/",
    )
    monkeypatch.setenv(
        "ALLOWED_ORIGIN_SUFFIXES",
        "*.vercel.app , .onrender.com/",
    )
    settings = Settings()

    assert settings.allowed_origins == [
        "http://localhost:3000",
        "https://appflow-profiler.vercel.app",
    ]
    assert settings.allowed_origin_suffixes == [".vercel.app", ".onrender.com"]

    # Exact origins (with or without trailing slash)
    assert settings.is_origin_allowed("http://localhost:3000") is True
    assert settings.is_origin_allowed("http://localhost:3000/") is True
    assert settings.is_origin_allowed("https://appflow-profiler.vercel.app") is True

    # Dynamic Vercel preview deployment origins over HTTPS
    assert (
        settings.is_origin_allowed("https://appflow-profiler-git-feat-preview-user.vercel.app")
        is True
    )
    assert settings.is_origin_allowed("https://staging.appflow-api.onrender.com") is True

    # Disallowed: HTTP on preview suffix, domain spoofing, or unlisted origin
    assert settings.is_origin_allowed("http://appflow-profiler-preview.vercel.app") is False
    assert settings.is_origin_allowed("https://vercel.app.evil.example.com") is False
    assert settings.is_origin_allowed("https://malicious-site.org") is False


def test_cors_and_websocket_accept_vercel_preview_origin() -> None:
    """Verify FastAPI CORSMiddleware and WebSocket /ws/v1/topology accept .vercel.app previews."""
    settings = Settings(
        env=Environment.TEST,
        tick_ms=100,
        allowed_origins=["http://localhost:3000"],
        allowed_origin_suffixes=[".vercel.app"],
        gemini_api_key=None,
    )
    app = create_app(settings=settings)
    preview_origin = "https://appflow-profiler-pr-42-baghdasaryan.vercel.app"

    with TestClient(app) as client:
        # 1. HTTP CORS preflight from Vercel preview URL
        cors_res = client.options(
            "/api/v1/meta",
            headers={
                "Origin": preview_origin,
                "Access-Control-Request-Method": "GET",
            },
        )
        assert cors_res.status_code == 200
        assert cors_res.headers.get("access-control-allow-origin") == preview_origin

        # 2. WebSocket handshake from Vercel preview URL succeeds
        with client.websocket_connect(
            "/ws/v1/topology",
            headers={"Origin": preview_origin},
        ) as ws:
            hello = ws.receive_json()
            assert hello["type"] == "hello"

        # 3. WebSocket handshake from untrusted origin is rejected with 1008
        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            client.websocket_connect(
                "/ws/v1/topology",
                headers={"Origin": "https://evil-origin.example.com"},
            ),
        ):
            pass
        assert exc_info.value.code == 1008


def test_smoke_verification_suite_end_to_end() -> None:
    """Verify the 6-point deployment smoke check suite passes against demo mode."""
    settings = Settings(env=Environment.DEMO, tick_ms=100, gemini_api_key=None)
    app = create_app(settings=settings)

    with TestClient(app) as client:
        # 1. /healthz
        r_health = client.get("/healthz")
        assert r_health.status_code == 200
        assert r_health.json()["status"] == "ok"

        # 2. /readyz
        r_ready = client.get("/readyz")
        assert r_ready.status_code == 200
        assert r_ready.json()["source_ready"] is True

        # 3. /api/v1/meta
        r_meta = client.get("/api/v1/meta")
        assert r_meta.status_code == 200
        assert r_meta.json()["mode"] == "demo"

        # 4. /api/v1/topology/summary
        r_sum = client.get("/api/v1/topology/summary")
        assert r_sum.status_code == 200
        assert r_sum.json()["node_count"] == 53
        assert "max-age" in r_sum.headers.get("cache-control", "")

        # 5. WebSocket handshake + snapshot
        with client.websocket_connect("/ws/v1/topology") as ws:
            hello = ws.receive_json()
            assert hello["type"] == "hello"
            ws.send_json(
                {
                    "v": 1,
                    "type": "subscribe",
                    "seq": None,
                    "ts": "2026-10-23T00:00:00Z",
                    "payload": {"filters": {}},
                }
            )
            snapshot = ws.receive_json()
            assert snapshot["type"] == "snapshot"
            assert snapshot["seq"] >= 1

        # 6. /api/v1/insights/analyze
        r_insights = client.post("/api/v1/insights/analyze", json={"scope": "global"})
        assert r_insights.status_code == 200
        assert r_insights.json()["source"] == "heuristic"
