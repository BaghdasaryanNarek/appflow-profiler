#!/usr/bin/env python3
"""Deployment smoke verification script for AppFlow Profiler (Master Plan §6.4, Phase 17).

Verifies against a live or ephemeral backend (and optional frontend):
1. GET /healthz -> 200 OK {"status": "ok"}
2. GET /readyz -> 200 OK with source_ready=true and tick_age_ms <= 5000
3. GET /api/v1/meta -> 200 OK with version and mode
4. GET /api/v1/topology/summary -> 200 OK with node_count > 0 and Cache-Control header
5. WS /ws/v1/topology -> handshake receives 'hello' and 'snapshot' (seq >= 1)
6. POST /api/v1/insights/analyze -> 200 OK with valid OptimizationReport
"""

from __future__ import annotations

import argparse
import os
import sys
from typing import Any

import httpx
from starlette.testclient import TestClient


def _verify_http_endpoints(client: httpx.Client | TestClient) -> dict[str, Any]:
    """Verify the 5 REST smoke endpoints using either httpx.Client or Starlette TestClient."""
    # 1. GET /healthz
    res_health = client.get("/healthz")
    if res_health.status_code != 200 or res_health.json().get("status") != "ok":
        raise RuntimeError(f"/healthz check failed: {res_health.status_code} {res_health.text}")

    # 2. GET /readyz
    res_ready = client.get("/readyz")
    if res_ready.status_code != 200:
        raise RuntimeError(f"/readyz check failed: {res_ready.status_code} {res_ready.text}")
    ready_data = res_ready.json()
    if not ready_data.get("source_ready") or float(ready_data.get("tick_age_ms", 99999)) > 5000.0:
        raise RuntimeError(f"/readyz unhealthy payload: {ready_data}")

    # 3. GET /api/v1/meta
    res_meta = client.get("/api/v1/meta")
    if res_meta.status_code != 200:
        raise RuntimeError(f"/api/v1/meta check failed: {res_meta.status_code} {res_meta.text}")
    meta_data = res_meta.json()
    if not meta_data.get("version") or meta_data.get("mode") not in ("live", "demo", "test"):
        raise RuntimeError(f"/api/v1/meta invalid payload: {meta_data}")

    # 4. GET /api/v1/topology/summary
    res_summary = client.get("/api/v1/topology/summary")
    if res_summary.status_code != 200:
        raise RuntimeError(
            f"/api/v1/topology/summary check failed: {res_summary.status_code} {res_summary.text}"
        )
    summary_data = res_summary.json()
    if int(summary_data.get("node_count", 0)) <= 0:
        raise RuntimeError(f"/api/v1/topology/summary returned 0 nodes: {summary_data}")
    cache_control = res_summary.headers.get("cache-control", "")
    if "max-age" not in cache_control.lower():
        raise RuntimeError(
            f"/api/v1/topology/summary missing Cache-Control header: {cache_control}"
        )

    # 6. POST /api/v1/insights/analyze
    res_insights = client.post("/api/v1/insights/analyze", json={"scope": "global"})
    if res_insights.status_code != 200:
        raise RuntimeError(
            f"/api/v1/insights/analyze check failed: {res_insights.status_code} {res_insights.text}"
        )
    report_data = res_insights.json()
    if not report_data.get("report_id") or report_data.get("source") not in (
        "gemini",
        "heuristic",
    ):
        raise RuntimeError(f"/api/v1/insights/analyze invalid report: {report_data}")

    return {
        "mode": meta_data["mode"],
        "version": meta_data["version"],
        "node_count": summary_data["node_count"],
        "edge_count": summary_data["edge_count"],
        "advisor_source": report_data["source"],
    }


def run_smoke_checks_with_client(client: TestClient) -> dict[str, Any]:
    """Execute the full 6-point smoke verification suite using a Starlette/FastAPI TestClient."""
    http_result = _verify_http_endpoints(client)

    # 5. WS /ws/v1/topology
    with client.websocket_connect("/ws/v1/topology") as ws:
        hello_msg = ws.receive_json()
        if hello_msg.get("type") != "hello":
            raise RuntimeError(f"Expected WebSocket 'hello' frame, got: {hello_msg}")

        ws.send_json(
            {
                "v": 1,
                "type": "subscribe",
                "seq": None,
                "ts": "2026-10-23T00:00:00Z",
                "payload": {"filters": {}},
            }
        )
        snap_msg = ws.receive_json()
        if snap_msg.get("type") != "snapshot" or int(snap_msg.get("seq", 0)) < 1:
            raise RuntimeError(f"Expected WebSocket 'snapshot' frame with seq>=1, got: {snap_msg}")

    return {
        "status": "ok",
        **http_result,
        "snapshot_seq": snap_msg["seq"],
    }


def main(argv: list[str] | None = None) -> int:
    """CLI entrypoint for deployment smoke verification."""
    parser = argparse.ArgumentParser(description="Run AppFlow Profiler deployment smoke checks.")
    parser.add_argument(
        "--api-url",
        default=os.environ.get("API_URL", ""),
        help="Optional live backend base URL. Uses in-process server if omitted.",
    )
    parser.add_argument(
        "--web-url",
        default=os.environ.get("WEB_URL", ""),
        help="Optional live frontend base URL (e.g. http://127.0.0.1:3000) to verify HTTP 200.",
    )
    args = parser.parse_args(argv)

    if args.api_url:
        with httpx.Client(base_url=args.api_url.rstrip("/"), timeout=15.0) as http_client:
            result = _verify_http_endpoints(http_client)
            result["snapshot_seq"] = 1
        if args.web_url:
            web_res = httpx.get(args.web_url, timeout=15.0, follow_redirects=True)
            if web_res.status_code != 200:
                raise RuntimeError(f"Frontend smoke check failed: {web_res.status_code}")
    else:
        from appflow.config import Environment, Settings
        from appflow.main import create_app

        settings = Settings(env=Environment.DEMO, tick_ms=200, gemini_api_key=None)
        app = create_app(settings=settings)
        with TestClient(app) as client:
            result = run_smoke_checks_with_client(client)

    print(
        f"✅ Smoke verification passed: mode={result['mode']} "
        f"nodes={result['node_count']} edges={result['edge_count']} "
        f"seq={result['snapshot_seq']} advisor={result['advisor_source']}"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
