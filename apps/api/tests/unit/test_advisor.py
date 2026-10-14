"""Unit tests for TopologyDigest, heuristic rules, Gemini client, and AdvisorService."""

import json
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from appflow.advisor.digest import (
    MAX_DIGEST_BYTES,
    DigestEdge,
    DigestNode,
    DigestTotals,
    TopologyDigest,
    build_digest,
)
from appflow.advisor.gemini_client import GeminiAdvisorClient, GeminiAdvisorError
from appflow.advisor.heuristics import generate_heuristic_report
from appflow.advisor.models import (
    Bottleneck,
    OptimizationReport,
    Recommendation,
    RecommendationCategory,
)
from appflow.advisor.prompts import SYSTEM_INSTRUCTION, build_analysis_user_prompt
from appflow.advisor.service import AdvisorService
from appflow.domain.enums import ConnState, HealthStatus, MetricQuality, NodeKind, Protocol
from appflow.domain.models import Edge, EdgeMetrics, Node, NodeMetrics, TopologyGraph


def _make_node(
    node_id: str,
    label: str,
    kind: NodeKind = NodeKind.SERVICE,
    health: HealthStatus = HealthStatus.HEALTHY,
    rps: float = 10.0,
    p99_ms: float = 20.0,
    error_rate: float = 0.0,
    saturation: float = 0.2,
    cpu_percent: float = 25.0,
    open_connections: int = 10,
) -> Node:
    return Node(
        id=node_id,
        kind=kind,
        label=label,
        health=health,
        metrics=NodeMetrics(
            rps=rps,
            p50_ms=p99_ms / 2,
            p99_ms=p99_ms,
            error_rate=error_rate,
            saturation=saturation,
            cpu_percent=cpu_percent,
            rss_bytes=100_000_000,
            open_connections=open_connections,
            quality=MetricQuality.MEASURED,
        ),
    )


def _make_edge(
    source: str,
    target: str,
    rps: float = 10.0,
    p99_ms: float = 20.0,
    error_rate: float = 0.0,
    retry_rate: float = 0.0,
    connection_count: int = 5,
    health: HealthStatus = HealthStatus.HEALTHY,
) -> Edge:
    return Edge(
        id=f"edge-{source}-{target}",
        source=source,
        target=target,
        protocol=Protocol.HTTP,
        health=health,
        metrics=EdgeMetrics(
            rps=rps,
            bytes_per_sec=1024.0,
            p99_ms=p99_ms,
            error_rate=error_rate,
            connection_count=connection_count,
            state_breakdown={ConnState.ESTABLISHED: connection_count},
            retry_rate=retry_rate,
            quality=MetricQuality.MEASURED,
        ),
    )


def _make_sample_graph() -> TopologyGraph:
    nodes = [
        _make_node("proc-gateway", "api-gateway", rps=120.0, p99_ms=45.0),
        _make_node("proc-orders", "orders-svc", rps=80.0, p99_ms=60.0),
        _make_node("proc-payments", "payments-svc", rps=40.0, p99_ms=120.0),
        _make_node("proc-db", "orders-db", kind=NodeKind.DATASTORE, rps=90.0, p99_ms=25.0),
    ]
    edges = [
        _make_edge("proc-gateway", "proc-orders", rps=80.0),
        _make_edge("proc-gateway", "proc-payments", rps=40.0),
        _make_edge("proc-orders", "proc-db", rps=90.0),
    ]
    return TopologyGraph(nodes=nodes, edges=edges)


# ---------------------------------------------------------------------------
# Digest Unit Tests
# ---------------------------------------------------------------------------


def test_build_digest_deterministic_hash() -> None:
    graph = _make_sample_graph()
    digest1 = build_digest(graph, scope="global", focus="latency")
    digest2 = build_digest(graph, scope="global", focus="latency")

    assert digest1.digest_hash == digest2.digest_hash
    assert len(digest1.digest_hash) == 64
    assert digest1.totals.node_count == 4
    assert digest1.totals.edge_count == 3


def test_build_digest_scoped_neighborhood() -> None:
    graph = _make_sample_graph()
    digest = build_digest(graph, scope="proc-orders")

    assert digest.scope == "proc-orders"
    node_ids = {n.id for n in digest.hot_nodes}
    assert "proc-orders" in node_ids
    assert "proc-gateway" in node_ids  # incident upstream
    assert "proc-db" in node_ids  # incident downstream
    assert "proc-payments" not in node_ids  # not incident to proc-orders


def test_build_digest_unknown_node_raises_key_error() -> None:
    graph = _make_sample_graph()
    with pytest.raises(KeyError, match="not found in topology graph"):
        build_digest(graph, scope="proc-unknown")


def test_build_digest_size_strictly_bounded() -> None:
    # Build large graph with 60 nodes and 120 edges
    nodes = [_make_node(f"proc-{i}", f"service-{i}", rps=float(i * 5)) for i in range(60)]
    edges = [_make_edge(f"proc-{i}", f"proc-{(i + 1) % 60}", rps=float(i)) for i in range(60)] + [
        _make_edge(f"proc-{i}", f"proc-{(i + 2) % 60}", rps=float(i)) for i in range(60)
    ]
    large_graph = TopologyGraph(nodes=nodes, edges=edges)

    digest = build_digest(large_graph, top_k=25)
    digest_json = json.dumps(digest.model_dump(mode="json"))
    assert len(digest_json.encode("utf-8")) <= MAX_DIGEST_BYTES


# ---------------------------------------------------------------------------
# Heuristics Unit Tests
# ---------------------------------------------------------------------------


def test_heuristics_all_six_categories() -> None:
    totals = DigestTotals(
        node_count=6,
        edge_count=6,
        total_rps=500.0,
        avg_p99_ms=150.0,
        avg_error_rate=0.05,
        critical_count=2,
        degraded_count=2,
    )
    hot_nodes = [
        # 1. Capacity rule trigger
        DigestNode(
            id="proc-heavy",
            label="heavy-calc",
            kind="service",
            health="critical",
            rps=100.0,
            p50_ms=50.0,
            p99_ms=120.0,
            error_rate=0.01,
            saturation=0.94,
            cpu_percent=92.0,
            open_connections=50,
        ),
        # 2. Connection pooling trigger
        DigestNode(
            id="proc-unpooled",
            label="unpooled-client",
            kind="service",
            health="degraded",
            rps=20.0,
            p50_ms=10.0,
            p99_ms=40.0,
            error_rate=0.0,
            saturation=0.3,
            cpu_percent=15.0,
            open_connections=350,
        ),
        # 4. Caching trigger (database with rps > 30)
        DigestNode(
            id="proc-db-hot",
            label="orders-db",
            kind="database",
            health="degraded",
            rps=85.0,
            p50_ms=20.0,
            p99_ms=180.0,
            error_rate=0.0,
            saturation=0.4,
            cpu_percent=30.0,
            open_connections=80,
        ),
        # 6. Timeouts trigger (p99 > 250ms)
        DigestNode(
            id="proc-slow",
            label="legacy-api",
            kind="external",
            health="critical",
            rps=15.0,
            p50_ms=100.0,
            p99_ms=1450.0,
            error_rate=0.08,
            saturation=0.2,
            cpu_percent=10.0,
            open_connections=20,
        ),
    ]

    # 3. Retry rule trigger (retry_rate > 0.10)
    # 5. Topology fan-out trigger (node-hub fans out to 6 targets)
    hot_edges = [
        DigestEdge(
            id="edge-retry",
            source="proc-heavy",
            target="proc-db-hot",
            protocol="http",
            health="critical",
            rps=50.0,
            p99_ms=80.0,
            error_rate=0.15,
            retry_rate=0.22,
            connection_count=10,
        ),
    ] + [
        DigestEdge(
            id=f"edge-fan-{i}",
            source="proc-hub",
            target=f"proc-dest-{i}",
            protocol="http",
            health="healthy",
            rps=10.0,
            p99_ms=20.0,
            error_rate=0.0,
            retry_rate=0.0,
            connection_count=5,
        )
        for i in range(6)
    ]

    digest = TopologyDigest(
        scope="global",
        focus=None,
        active_scenario=None,
        totals=totals,
        hot_nodes=hot_nodes,
        hot_edges=hot_edges,
        known_node_ids=["proc-heavy", "proc-unpooled", "proc-db-hot", "proc-slow", "proc-hub"],
        digest_hash="a" * 64,
    )

    report = generate_heuristic_report(digest)
    assert report.source == "heuristic"
    assert report.digest_hash == "a" * 64
    assert len(report.bottlenecks) >= 5
    categories = {r.category for r in report.recommendations}
    assert RecommendationCategory.CAPACITY in categories
    assert RecommendationCategory.CONNECTION_POOLING in categories
    assert RecommendationCategory.RETRY_POLICY in categories
    assert RecommendationCategory.CACHING in categories
    assert RecommendationCategory.TOPOLOGY in categories
    assert RecommendationCategory.TIMEOUTS in categories


def test_heuristics_healthy_digest() -> None:
    totals = DigestTotals(
        node_count=2,
        edge_count=1,
        total_rps=50.0,
        avg_p99_ms=15.0,
        avg_error_rate=0.0,
        critical_count=0,
        degraded_count=0,
    )
    hot_nodes = [
        DigestNode(
            id="proc-1",
            label="svc-1",
            kind="service",
            health="healthy",
            rps=25.0,
            p50_ms=5.0,
            p99_ms=15.0,
            error_rate=0.0,
            saturation=0.15,
            cpu_percent=10.0,
            open_connections=12,
        )
    ]
    hot_edges = [
        DigestEdge(
            id="edge-1",
            source="proc-1",
            target="proc-2",
            protocol="http",
            health="healthy",
            rps=25.0,
            p99_ms=15.0,
            error_rate=0.0,
            retry_rate=0.0,
            connection_count=4,
        )
    ]
    digest = TopologyDigest(
        scope="global",
        focus=None,
        active_scenario=None,
        totals=totals,
        hot_nodes=hot_nodes,
        hot_edges=hot_edges,
        known_node_ids=["proc-1", "proc-2"],
        digest_hash="b" * 64,
    )

    report = generate_heuristic_report(digest)
    assert report.source == "heuristic"
    assert len(report.bottlenecks) == 0
    assert "baseline SLOs" in report.summary


# ---------------------------------------------------------------------------
# Prompts Unit Tests
# ---------------------------------------------------------------------------


def test_prompts_strict_domain_and_formatting() -> None:
    assert "Principal Site Reliability Engineer" in SYSTEM_INSTRUCTION
    assert "cybersecurity" not in SYSTEM_INSTRUCTION.lower()
    assert "malware" not in SYSTEM_INSTRUCTION.lower()
    assert "hacking" not in SYSTEM_INSTRUCTION.lower()

    graph = _make_sample_graph()
    digest = build_digest(graph)
    user_prompt = build_analysis_user_prompt(digest, focus="caching")
    assert digest.digest_hash in user_prompt
    assert "caching" in user_prompt
    assert "proc-gateway" in user_prompt


# ---------------------------------------------------------------------------
# Gemini Client Unit Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_gemini_client_unconfigured() -> None:
    client = GeminiAdvisorClient()
    assert not client.is_configured
    digest = build_digest(_make_sample_graph())
    with pytest.raises(GeminiAdvisorError, match="not configured"):
        await client.analyze(digest)


@pytest.mark.asyncio
async def test_gemini_client_success() -> None:
    digest = build_digest(_make_sample_graph())
    mock_report = OptimizationReport(
        report_id="rep-test-01",
        source="gemini",
        digest_hash=digest.digest_hash,
        summary="Optimal architecture.",
        generated_at=datetime.now(UTC),
        model="gemini-3.8-flash",
        bottlenecks=[
            Bottleneck(
                node_id="proc-gateway",
                title="Slight tail latency",
                severity="low",
                evidence=["p99 45ms"],
            )
        ],
        recommendations=[
            Recommendation(
                id="rec-test-1",
                title="Tune connection keepalive",
                category=RecommendationCategory.CONNECTION_POOLING,
                priority=3,
                rationale="Reuse existing sockets.",
                expected_impact="Reduces handshake latency.",
                affected_node_ids=["proc-gateway"],
                effort="S",
            )
        ],
    )

    mock_resp = MagicMock()
    mock_resp.output_text = f"```json\n{mock_report.model_dump_json()}\n```"

    mock_sdk_client = MagicMock()
    mock_sdk_client.aio.interactions.create = AsyncMock(return_value=mock_resp)

    gemini_client = GeminiAdvisorClient(client=mock_sdk_client, model="gemini-3.8-flash")
    result = await gemini_client.analyze(digest)

    assert result.source == "gemini"
    assert result.model == "gemini-3.8-flash"
    assert result.digest_hash == digest.digest_hash
    assert len(result.recommendations) == 1
    assert result.recommendations[0].affected_node_ids == ["proc-gateway"]


@pytest.mark.asyncio
async def test_gemini_client_empty_response_raises_error() -> None:
    digest = build_digest(_make_sample_graph())
    mock_resp = MagicMock()
    mock_resp.output_text = ""

    mock_sdk_client = MagicMock()
    mock_sdk_client.aio.interactions.create = AsyncMock(return_value=mock_resp)

    gemini_client = GeminiAdvisorClient(client=mock_sdk_client)
    with pytest.raises(GeminiAdvisorError):
        await gemini_client.analyze(digest)


# ---------------------------------------------------------------------------
# AdvisorService Unit Tests (Grounding Guard & Caching)
# ---------------------------------------------------------------------------


def test_advisor_service_grounding_guard_purges_hallucinations() -> None:
    digest = build_digest(_make_sample_graph())
    service = AdvisorService()

    raw_report = OptimizationReport(
        report_id="rep-hallucinated",
        source="gemini",
        digest_hash=digest.digest_hash,
        summary="Review with mixed node integrity.",
        bottlenecks=[
            Bottleneck(
                node_id="proc-gateway",  # valid
                title="Real issue",
                severity="low",
                evidence=["metrics"],
            ),
            Bottleneck(
                node_id="proc-phantom-999",  # hallucinated
                title="Fake issue",
                severity="high",
                evidence=["fake"],
            ),
        ],
        recommendations=[
            Recommendation(
                id="rec-partially-valid",
                title="Mixed nodes",
                category=RecommendationCategory.CAPACITY,
                priority=2,
                rationale="Valid test",
                expected_impact="Valid impact",
                affected_node_ids=["proc-gateway", "proc-phantom-999"],  # 1 real, 1 fake
                effort="M",
            ),
            Recommendation(
                id="rec-totally-fake",
                title="All fake nodes",
                category=RecommendationCategory.TOPOLOGY,
                priority=3,
                rationale="Fake",
                expected_impact="Fake",
                affected_node_ids=["proc-ghost-1", "proc-ghost-2"],  # all fake
                effort="S",
            ),
        ],
    )

    grounded = service.apply_grounding_guard(raw_report, digest)
    # Phantom bottleneck dropped
    assert len(grounded.bottlenecks) == 1
    assert grounded.bottlenecks[0].node_id == "proc-gateway"

    # Fully hallucinated recommendation dropped, partially hallucinated sanitized
    assert len(grounded.recommendations) == 1
    assert grounded.recommendations[0].id == "rec-partially-valid"
    assert grounded.recommendations[0].affected_node_ids == ["proc-gateway"]


@pytest.mark.asyncio
async def test_advisor_service_cache_hit_and_eviction() -> None:
    graph = _make_sample_graph()
    service = AdvisorService(cache_ttl_s=60.0)

    report1 = await service.analyze(graph, scope="global")
    assert report1.source == "heuristic"

    # Second call hits in-memory cache
    report2 = await service.analyze(graph, scope="global")
    assert report1.report_id == report2.report_id

    await service.clear_cache()
    report3 = await service.analyze(graph, scope="global")
    assert report3.digest_hash == report1.digest_hash


@pytest.mark.asyncio
async def test_advisor_service_llm_failure_falls_back_to_heuristics() -> None:
    graph = _make_sample_graph()
    mock_sdk = MagicMock()
    mock_sdk.aio.interactions.create = AsyncMock(side_effect=RuntimeError("API Quota Exceeded"))

    gemini_client = GeminiAdvisorClient(client=mock_sdk)
    service = AdvisorService(client=gemini_client)

    report = await service.analyze(graph)
    assert report.source == "heuristic"
    assert report.model is None
