"""Unit tests for DiffEngine and delta payload generation (Master Plan Phase 6)."""

from datetime import UTC, datetime

from appflow.domain.enums import ConnState, HealthStatus, MetricQuality, NodeKind, Protocol
from appflow.domain.models import Edge, EdgeMetrics, Node, NodeMetrics, TopologyGraph
from appflow.simulation.engine import SimulationEngine
from appflow.streaming.aggregator import TopologyAggregator
from appflow.streaming.diff import DELTA_EPSILON, DiffEngine


def _sample_node_metrics(rps: float = 100.0, open_conns: int = 10) -> NodeMetrics:
    return NodeMetrics(
        rps=rps,
        p50_ms=5.0,
        p99_ms=23.0,
        error_rate=0.001,
        saturation=0.5,
        cpu_percent=50.0,
        rss_bytes=100 * 1024 * 1024,
        open_connections=open_conns,
        quality=MetricQuality.MEASURED,
    )


def _sample_edge_metrics(rps: float = 100.0) -> EdgeMetrics:
    return EdgeMetrics(
        rps=rps,
        bytes_per_sec=102400.0,
        p99_ms=23.0,
        error_rate=0.001,
        connection_count=10,
        quality=MetricQuality.MEASURED,
        state_breakdown={ConnState.ESTABLISHED: 10},
        retry_rate=0.0,
    )


def test_diff_identical_graphs_returns_none() -> None:
    diff_engine = DiffEngine()
    node = Node(
        id="svc:api",
        kind=NodeKind.SERVICE,
        label="api",
        health=HealthStatus.HEALTHY,
        metrics=_sample_node_metrics(),
    )
    edge = Edge(
        id="edge:svc:api->svc:auth:http",
        source="svc:api",
        target="svc:auth",
        protocol=Protocol.HTTP,
        health=HealthStatus.HEALTHY,
        metrics=_sample_edge_metrics(),
    )
    graph = TopologyGraph(nodes=[node], edges=[edge], timestamp=datetime.now(UTC))

    delta = diff_engine.diff(graph, graph, base_seq=1)
    assert delta is None


def test_diff_added_and_removed_nodes_and_edges() -> None:
    diff_engine = DiffEngine()
    n1 = Node(
        id="svc:1",
        kind=NodeKind.SERVICE,
        label="1",
        health=HealthStatus.HEALTHY,
        metrics=_sample_node_metrics(),
    )
    n2 = Node(
        id="svc:2",
        kind=NodeKind.SERVICE,
        label="2",
        health=HealthStatus.HEALTHY,
        metrics=_sample_node_metrics(),
    )
    e1 = Edge(
        id="edge:svc:1->svc:2:http",
        source="svc:1",
        target="svc:2",
        protocol=Protocol.HTTP,
        health=HealthStatus.HEALTHY,
        metrics=_sample_edge_metrics(),
    )

    prev_graph = TopologyGraph(nodes=[n1], edges=[], timestamp=datetime.now(UTC))
    curr_graph = TopologyGraph(nodes=[n2], edges=[e1], timestamp=datetime.now(UTC))

    delta = diff_engine.diff(prev_graph, curr_graph, base_seq=5)
    assert delta is not None
    assert delta.base_seq == 5
    assert [n.id for n in delta.added_nodes] == ["svc:2"]
    assert delta.removed_node_ids == ["svc:1"]
    assert [e.id for e in delta.added_edges] == [e1.id]
    assert delta.removed_edge_ids == []


def test_diff_epsilon_metric_suppression() -> None:
    diff_engine = DiffEngine(epsilon=DELTA_EPSILON)
    m_base = _sample_node_metrics(rps=100.0)

    # 1. Metric change < 0.5% (0.2% change): should be suppressed
    m_tiny_change = m_base.model_copy(update={"rps": 100.2})
    n_prev = Node(
        id="svc:1",
        kind=NodeKind.SERVICE,
        label="1",
        health=HealthStatus.HEALTHY,
        metrics=m_base,
    )
    n_curr_tiny = Node(
        id="svc:1",
        kind=NodeKind.SERVICE,
        label="1",
        health=HealthStatus.HEALTHY,
        metrics=m_tiny_change,
    )
    g_prev = TopologyGraph(nodes=[n_prev], edges=[], timestamp=datetime.now(UTC))
    g_curr_tiny = TopologyGraph(nodes=[n_curr_tiny], edges=[], timestamp=datetime.now(UTC))

    delta_tiny = diff_engine.diff(g_prev, g_curr_tiny, base_seq=1)
    assert delta_tiny is None  # no changes above epsilon

    # 2. Metric change >= 0.5% (2.0% change): whole metrics included in patch
    m_big_change = m_base.model_copy(update={"rps": 102.0})
    n_curr_big = Node(
        id="svc:1",
        kind=NodeKind.SERVICE,
        label="1",
        health=HealthStatus.HEALTHY,
        metrics=m_big_change,
    )
    g_curr_big = TopologyGraph(nodes=[n_curr_big], edges=[], timestamp=datetime.now(UTC))

    delta_big = diff_engine.diff(g_prev, g_curr_big, base_seq=1)
    assert delta_big is not None
    assert len(delta_big.updated_nodes) == 1
    patch = delta_big.updated_nodes[0]
    assert patch.id == "svc:1"
    assert patch.metrics is not None
    assert patch.metrics.rps == 102.0
    assert patch.health is None  # health did not change


def test_diff_health_change_in_patch() -> None:
    diff_engine = DiffEngine()
    m = _sample_node_metrics()
    n_prev = Node(
        id="svc:1",
        kind=NodeKind.SERVICE,
        label="1",
        health=HealthStatus.HEALTHY,
        metrics=m,
    )
    n_curr = Node(
        id="svc:1",
        kind=NodeKind.SERVICE,
        label="1",
        health=HealthStatus.CRITICAL,
        health_reasons=["p99_ms 1200 > 1000"],
        metrics=m,
    )
    g_prev = TopologyGraph(nodes=[n_prev], edges=[], timestamp=datetime.now(UTC))
    g_curr = TopologyGraph(nodes=[n_curr], edges=[], timestamp=datetime.now(UTC))

    delta = diff_engine.diff(g_prev, g_curr, base_seq=1)
    assert delta is not None
    assert len(delta.updated_nodes) == 1
    patch = delta.updated_nodes[0]
    assert patch.health == HealthStatus.CRITICAL
    assert patch.health_reasons == ["p99_ms 1200 > 1000"]
    assert patch.metrics is None


def test_diff_steady_state_payload_size_under_15_percent() -> None:
    """Master Plan §1.4 / Phase 6 Acceptance Criteria.

    Deltas are under 15% of snapshot size at steady state.
    """

    engine = SimulationEngine(seed=42)
    aggregator = TopologyAggregator()
    diff_engine = DiffEngine()

    # Warm up engine and aggregator to establish steady-state baseline
    for _ in range(3):
        warm_sample = engine.step(1.0)
        aggregator.process_sample(warm_sample)

    # Step 1: initial steady-state graph
    sample_1 = engine.step(1.0)
    g1, _ = aggregator.process_sample(sample_1)

    # Step 2: advance tick in steady state
    sample_2 = engine.step(1.0)
    g2, _ = aggregator.process_sample(sample_2)

    delta = diff_engine.diff(g1, g2, base_seq=1)
    assert delta is not None

    snapshot_json = g2.model_dump_json()
    delta_json = delta.model_dump_json()

    ratio = len(delta_json) / len(snapshot_json)
    # Must be under 15% (0.15)
    assert ratio < 0.15, f"Delta size ratio {ratio:.3f} exceeded 15% threshold"
