"""Integration tests for Phase 7 REST API surface.

Covers:
- /api/v1/meta
- /api/v1/topology/summary (including Cache-Control)
- /api/v1/topology/snapshot (unfiltered, kinds, min_rps, group, and 422 validation)
- /api/v1/nodes/{node_id} (Level-2 detail, neighbours, 404 problem+json)
- /api/v1/edges/{edge_id} (Level-2 detail, history, 404 problem+json)
- /api/v1/simulation/scenarios (listing, 409 in live mode)
- /api/v1/simulation/scenarios/{id}/activate (activation, 429 rate limit, 404 unknown, 409 live)
- /api/v1/simulation/reset (204 No Content, 409 live)
- CORS preflight and allowed origins verification
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from appflow.api.errors import PROBLEM_JSON
from appflow.config import Environment, Settings
from appflow.main import create_app


def test_meta_endpoint(client: TestClient) -> None:
    """Verify GET /api/v1/meta capability declarations."""
    response = client.get("/api/v1/meta")
    assert response.status_code == 200
    data = response.json()
    assert "version" in data
    assert data["mode"] == "demo"
    assert data["tick_ms"] == 50
    caps = data["capabilities"]
    assert caps["per_process_io"] is True
    assert caps["connection_owner"] is True
    assert caps["ai_advisor"] is True
    assert caps["scenarios"] is True
    assert data["limits"]["max_nodes"] == 2000


def test_topology_summary_endpoint(client: TestClient) -> None:
    """Verify GET /api/v1/topology/summary SSR payload and caching header."""
    response = client.get("/api/v1/topology/summary")
    assert response.status_code == 200
    assert response.headers.get("cache-control") == "max-age=2"
    data = response.json()
    assert data["mode"] == "demo"
    assert data["node_count"] > 0
    assert data["edge_count"] > 0
    assert data["total_rps"] >= 0.0
    assert data["global_p99_ms"] >= 0.0
    assert 0.0 <= data["global_error_rate"] <= 1.0
    assert data["critical_count"] >= 0
    assert data["degraded_count"] >= 0
    assert "generated_at" in data


def test_topology_snapshot_unfiltered(client: TestClient) -> None:
    """Verify GET /api/v1/topology/snapshot returns full graph with sequence tag."""
    response = client.get("/api/v1/topology/snapshot")
    assert response.status_code == 200
    data = response.json()
    assert "seq" in data
    assert isinstance(data["seq"], int)
    graph = data["graph"]
    assert len(graph["nodes"]) > 0
    assert len(graph["edges"]) > 0
    assert "timestamp" in graph


def test_topology_snapshot_filtered_by_kinds(client: TestClient) -> None:
    """Verify filtering snapshot by repeated and comma-separated kinds."""
    # 1. Comma-separated
    resp1 = client.get("/api/v1/topology/snapshot?kinds=service,cache")
    assert resp1.status_code == 200
    nodes1 = resp1.json()["graph"]["nodes"]
    assert len(nodes1) > 0
    assert all(n["kind"] in ("service", "cache") for n in nodes1)

    # 2. Repeated query params
    resp2 = client.get("/api/v1/topology/snapshot?kinds=service&kinds=datastore")
    assert resp2.status_code == 200
    nodes2 = resp2.json()["graph"]["nodes"]
    assert len(nodes2) > 0
    assert all(n["kind"] in ("service", "datastore") for n in nodes2)

    # 3. Invalid kind produces 422 problem+json
    resp_err = client.get("/api/v1/topology/snapshot?kinds=non_existent_kind")
    assert resp_err.status_code == 422
    assert resp_err.headers["content-type"].startswith(PROBLEM_JSON)


def test_topology_snapshot_filtered_by_min_rps_and_group(client: TestClient) -> None:
    """Verify filtering snapshot by min_rps and group identifier."""
    # Filter by group
    resp_group = client.get("/api/v1/topology/snapshot?group=order-svc")
    assert resp_group.status_code == 200
    nodes_group = resp_group.json()["graph"]["nodes"]
    for n in nodes_group:
        assert n["id"] == "order-svc" or n["group_id"] == "order-svc"

    # Filter by min_rps
    resp_rps = client.get("/api/v1/topology/snapshot?min_rps=10000.0")
    assert resp_rps.status_code == 200
    nodes_rps = resp_rps.json()["graph"]["nodes"]
    # Very high RPS should retain 0 nodes
    assert len(nodes_rps) == 0


def test_node_detail_and_not_found(client: TestClient) -> None:
    """Verify GET /api/v1/nodes/{node_id} Level-2 disclosure and 404 problem+json."""
    # 1. Retrieve a valid node from snapshot
    snapshot_resp = client.get("/api/v1/topology/snapshot")
    assert snapshot_resp.status_code == 200
    nodes = snapshot_resp.json()["graph"]["nodes"]
    assert len(nodes) > 0
    target_id = nodes[0]["id"]

    resp = client.get(f"/api/v1/nodes/{target_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["node"]["id"] == target_id
    assert "sockets" in detail
    assert "history" in detail
    assert "neighbours" in detail
    assert "up" in detail["neighbours"]
    assert "down" in detail["neighbours"]

    # 2. 404 for unknown node
    err_resp = client.get("/api/v1/nodes/svc:does-not-exist")
    assert err_resp.status_code == 404
    assert err_resp.headers["content-type"].startswith(PROBLEM_JSON)
    err_body = err_resp.json()
    assert err_body["status"] == 404
    assert err_body["title"] == "Not Found"
    assert "does-not-exist" in err_body["detail"]


def test_edge_detail_and_not_found(client: TestClient) -> None:
    """Verify GET /api/v1/edges/{edge_id} Level-2 disclosure and 404 problem+json."""
    # 1. Retrieve a valid edge from snapshot
    snapshot_resp = client.get("/api/v1/topology/snapshot")
    edges = snapshot_resp.json()["graph"]["edges"]
    assert len(edges) > 0
    target_edge_id = edges[0]["id"]

    resp = client.get(f"/api/v1/edges/{target_edge_id}")
    assert resp.status_code == 200
    detail = resp.json()
    assert detail["edge"]["id"] == target_edge_id
    assert "history" in detail

    # 2. 404 for unknown edge
    err_resp = client.get("/api/v1/edges/edge:does-not-exist->nowhere:tcp")
    assert err_resp.status_code == 404
    assert err_resp.headers["content-type"].startswith(PROBLEM_JSON)
    err_body = err_resp.json()
    assert err_body["status"] == 404
    assert err_body["title"] == "Not Found"


def test_simulation_scenarios_listing(client: TestClient) -> None:
    """Verify GET /api/v1/simulation/scenarios lists registered scenarios."""
    response = client.get("/api/v1/simulation/scenarios")
    assert response.status_code == 200
    scenarios = response.json()
    assert len(scenarios) >= 2
    scenario_ids = [s["id"] for s in scenarios]
    assert "request-storm" in scenario_ids
    assert "db-pool-exhaustion" in scenario_ids


def test_simulation_scenario_activation_and_rate_limiting(client: TestClient) -> None:
    """Verify scenario activation, 429 rate limit on rapid calls, and 404 on unknown ID."""
    # 1. Successful activation
    resp = client.post(
        "/api/v1/simulation/scenarios/request-storm/activate",
        headers={"x-forwarded-for": "198.51.100.1"},
    )
    assert resp.status_code == 200
    scen = resp.json()
    assert scen["id"] == "request-storm"
    assert scen["active"] is True

    # 2. Second immediate call from the same IP should trigger 429 rate limit
    resp_rate = client.post(
        "/api/v1/simulation/scenarios/request-storm/activate",
        headers={"x-forwarded-for": "198.51.100.1"},
    )
    assert resp_rate.status_code == 429
    assert resp_rate.headers["content-type"].startswith(PROBLEM_JSON)
    assert "retry-after" in resp_rate.headers
    body = resp_rate.json()
    assert body["status"] == 429
    assert "rate limit exceeded" in body["detail"].lower()

    # 3. Call from a different IP should succeed (per-IP bucket isolation)
    resp_diff_ip = client.post(
        "/api/v1/simulation/scenarios/request-storm/activate",
        headers={"x-forwarded-for": "198.51.100.2"},
    )
    assert resp_diff_ip.status_code == 200

    # 4. Unknown scenario ID returns 404 problem+json (from another fresh IP)
    resp_unknown = client.post(
        "/api/v1/simulation/scenarios/unknown-scenario-xyz/activate",
        headers={"x-forwarded-for": "198.51.100.3"},
    )
    assert resp_unknown.status_code == 404
    assert resp_unknown.headers["content-type"].startswith(PROBLEM_JSON)


def test_simulation_reset_endpoint(client: TestClient) -> None:
    """Verify POST /api/v1/simulation/reset returns 204 No Content."""
    # Activate scenario first
    _ = client.post(
        "/api/v1/simulation/scenarios/request-storm/activate",
        headers={"x-forwarded-for": "198.51.100.4"},
    )
    reset_resp = client.post("/api/v1/simulation/reset")
    assert reset_resp.status_code == 204
    assert reset_resp.text == ""


def test_simulation_endpoints_disabled_in_live_mode() -> None:
    """Verify simulation routes return 409 Conflict problem+json when ENV=live."""
    live_settings = Settings(
        env=Environment.LIVE,
        tick_ms=1000,
        log_level="WARNING",
    )
    # create_app without entering simulation lifespan or with PsutilSource
    live_app = create_app(live_settings)
    with TestClient(live_app) as live_client:
        # 1. Scenarios listing returns 409
        r1 = live_client.get("/api/v1/simulation/scenarios")
        assert r1.status_code == 409
        assert r1.headers["content-type"].startswith(PROBLEM_JSON)
        assert "disabled in live" in r1.json()["detail"].lower()

        # 2. Scenario activation returns 409
        r2 = live_client.post("/api/v1/simulation/scenarios/request-storm/activate")
        assert r2.status_code == 409
        assert r2.headers["content-type"].startswith(PROBLEM_JSON)

        # 3. Reset returns 409
        r3 = live_client.post("/api/v1/simulation/reset")
        assert r3.status_code == 409
        assert r3.headers["content-type"].startswith(PROBLEM_JSON)


def test_cors_middleware_headers(client: TestClient) -> None:
    """Verify CORS preflight and allowed origins behavior."""
    # Allowed origin
    resp = client.get("/api/v1/meta", headers={"origin": "http://localhost:3000"})
    assert resp.status_code == 200
    assert resp.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert resp.headers.get("access-control-allow-credentials") == "true"

    # Preflight OPTIONS request
    preflight = client.options(
        "/api/v1/meta",
        headers={
            "origin": "http://localhost:3000",
            "access-control-request-method": "GET",
        },
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == "http://localhost:3000"
