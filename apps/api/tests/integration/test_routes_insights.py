"""Integration tests for POST /api/v1/insights/analyze endpoint (Master Plan §4.4, §7 Phase 8)."""

from datetime import UTC, datetime
from typing import TYPE_CHECKING, cast
from unittest.mock import AsyncMock, MagicMock, PropertyMock, patch

from fastapi.testclient import TestClient

if TYPE_CHECKING:
    from fastapi import FastAPI

from appflow.advisor.gemini_client import GeminiAdvisorClient
from appflow.advisor.models import (
    Bottleneck,
    OptimizationReport,
    Recommendation,
    RecommendationCategory,
)
from appflow.api.errors import PROBLEM_JSON


def test_analyze_heuristic_fallback_when_unconfigured(client: TestClient) -> None:
    """Verify fallback to deterministic heuristics when GEMINI_API_KEY is not set."""
    response = client.post("/api/v1/insights/analyze", json={"scope": "global"})
    assert response.status_code == 200
    data = response.json()

    assert data["source"] == "heuristic"
    assert data["model"] is None
    assert len(data["digest_hash"]) == 64
    assert "summary" in data
    assert len(data["summary"]) <= 600
    assert isinstance(data["bottlenecks"], list)
    assert isinstance(data["recommendations"], list)
    assert isinstance(data["caveats"], list)


def test_analyze_gemini_success_when_configured(client: TestClient) -> None:
    """Verify Gemini LLM report generation when Gemini client is configured."""
    app = cast("FastAPI", client.app)
    advisor_service = app.state.advisor_service

    # Retrieve valid node from snapshot to satisfy grounding guard
    snapshot_resp = client.get("/api/v1/topology/snapshot")
    assert snapshot_resp.status_code == 200
    valid_node_id = snapshot_resp.json()["graph"]["nodes"][0]["id"]

    mock_llm_report = OptimizationReport(
        report_id="rep-gemini-live",
        source="gemini",
        digest_hash="f" * 64,
        summary="Executive architecture assessment from Gemini.",
        generated_at=datetime.now(UTC),
        model="gemini-3.8-flash",
        bottlenecks=[
            Bottleneck(
                node_id=valid_node_id,
                title="Frontend connection saturation",
                severity="medium",
                evidence=["connections 150"],
            )
        ],
        recommendations=[
            Recommendation(
                id="rec-gemini-1",
                title="Increase gateway worker concurrency",
                category=RecommendationCategory.CAPACITY,
                priority=1,
                rationale="Alleviates request wait queuing.",
                expected_impact="30% tail latency reduction.",
                affected_node_ids=[valid_node_id],
                effort="S",
            )
        ],
        caveats=["Sample test caveat."],
    )

    mock_sdk = MagicMock()
    mock_resp = MagicMock()
    mock_resp.output_text = mock_llm_report.model_dump_json()
    mock_sdk.aio.interactions.create = AsyncMock(return_value=mock_resp)

    # Attach mocked client to the service
    mock_client = GeminiAdvisorClient(client=mock_sdk, model="gemini-3.8-flash")
    advisor_service._client = mock_client

    response = client.post(
        "/api/v1/insights/analyze",
        json={"scope": "global", "focus": "capacity"},
    )
    assert response.status_code == 200
    data = response.json()

    assert data["source"] == "gemini"
    assert data["model"] == "gemini-3.8-flash"
    assert data["summary"] == "Executive architecture assessment from Gemini."
    assert len(data["recommendations"]) == 1
    assert data["recommendations"][0]["id"] == "rec-gemini-1"
    assert data["recommendations"][0]["affected_node_ids"] == [valid_node_id]


def test_analyze_scoped_to_valid_node(client: TestClient) -> None:
    """Verify scoping analysis to a specific node."""
    snapshot_resp = client.get("/api/v1/topology/snapshot")
    assert snapshot_resp.status_code == 200
    nodes = snapshot_resp.json()["graph"]["nodes"]
    assert len(nodes) > 0
    target_node_id = nodes[0]["id"]

    response = client.post(
        "/api/v1/insights/analyze",
        json={"scope": target_node_id, "focus": "latency"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["source"] == "heuristic"
    assert "digest_hash" in data


def test_analyze_scoped_to_unknown_node_returns_404(client: TestClient) -> None:
    """Verify 404 problem details when scoped to an unmonitored node ID."""
    response = client.post(
        "/api/v1/insights/analyze",
        json={"scope": "proc-nonexistent-node-999"},
    )
    assert response.status_code == 404
    assert response.headers["content-type"] == PROBLEM_JSON
    data = response.json()
    assert data["status"] == 404
    assert "proc-nonexistent-node-999" in data["detail"]


def test_analyze_cache_hit_returns_cached_report(client: TestClient) -> None:
    """Verify that multiple identical requests within TTL return the cached instance."""
    app = cast("FastAPI", client.app)
    app.state.advisor_service._cache.clear()
    frozen_graph = app.state.aggregator.latest_graph

    with patch.object(
        type(app.state.aggregator),
        "latest_graph",
        new_callable=PropertyMock,
        return_value=frozen_graph,
    ):
        resp1 = client.post("/api/v1/insights/analyze", json={"scope": "global"})
        assert resp1.status_code == 200

        resp2 = client.post("/api/v1/insights/analyze", json={"scope": "global"})
        assert resp2.status_code == 200

        assert resp1.json()["report_id"] == resp2.json()["report_id"]
        assert resp1.json()["digest_hash"] == resp2.json()["digest_hash"]


def test_analyze_rate_limiting_exceeded(client: TestClient) -> None:
    """Verify that exceeding 5 requests per minute returns HTTP 429 Too Many Requests."""
    app = cast("FastAPI", client.app)
    app.state.insights_limiter._buckets.clear()

    # First 5 calls must succeed
    for _ in range(5):
        res = client.post("/api/v1/insights/analyze", json={"scope": "global"})
        assert res.status_code == 200

    # 6th call from same client must be rate-limited
    blocked = client.post("/api/v1/insights/analyze", json={"scope": "global"})
    assert blocked.status_code == 429
    assert blocked.headers["content-type"] == PROBLEM_JSON
    assert "Retry-After" in blocked.headers
    assert "Rate limit exceeded" in blocked.json()["detail"]


def test_analyze_service_unavailable_without_graph(client: TestClient) -> None:
    """Verify 503 response if the aggregator has not yet ingested topology ticks."""
    app = cast("FastAPI", client.app)
    original_graph = app.state.aggregator._latest_graph
    try:
        app.state.aggregator._latest_graph = None
        res = client.post("/api/v1/insights/analyze", json={"scope": "global"})
        assert res.status_code == 503
        assert res.headers["content-type"] == PROBLEM_JSON
        assert "not yet initialized" in res.json()["detail"]
    finally:
        app.state.aggregator._latest_graph = original_graph
