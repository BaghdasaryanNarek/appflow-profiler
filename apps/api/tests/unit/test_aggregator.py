"""Unit tests for TopologyAggregator (Master Plan Phase 6)."""

from datetime import UTC, datetime

from appflow.domain.enums import (
    ConnState,
    HealthStatus,
    MetricQuality,
    NodeKind,
    Protocol,
    SourceMode,
)
from appflow.domain.health import HealthThresholds
from appflow.simulation.engine import SimulationEngine
from appflow.sources.base import RawConnection, RawProcessSample, RawSample
from appflow.streaming.aggregator import TopologyAggregator


def _create_sample(
    pids: list[int],
    cpu: float = 10.0,
    io_bps: float = 10240.0,
    conns: list[RawConnection] | None = None,
) -> RawSample:
    procs = {
        pid: RawProcessSample(
            pid=pid,
            name="orders-svc",
            cmdline_sanitized=f"/usr/local/bin/orders-svc --port {8000 + pid}",
            create_time=1700000000.0,
            cpu_percent=cpu,
            rss_bytes=100 * 1024 * 1024,
            open_connections=2,
            io_bytes_per_sec=io_bps,
        )
        for pid in pids
    }
    return RawSample(
        timestamp=datetime.now(UTC),
        connections=conns or [],
        processes=procs,
        quality=MetricQuality.SIMULATED,
    )


def test_aggregator_process_sample_nodes_and_edges() -> None:
    aggregator = TopologyAggregator()
    conns = [
        RawConnection(
            laddr_ip="127.0.0.1",
            laddr_port=50000,
            status=ConnState.ESTABLISHED,
            protocol=Protocol.HTTP,
            raddr_ip="127.0.0.1",
            raddr_port=8001,
            pid=None,
        ),
        RawConnection(
            laddr_ip="127.0.0.1",
            laddr_port=8001,
            status=ConnState.ESTABLISHED,
            protocol=Protocol.HTTP,
            raddr_ip="10.0.0.1",
            raddr_port=80,
            pid=1,
        ),
    ]
    sample = _create_sample([1, 2], cpu=20.0, io_bps=10240.0, conns=conns)

    graph, events = aggregator.process_sample(sample)

    assert len(graph.nodes) > 0
    assert len(graph.edges) > 0

    proc_nodes = [n for n in graph.nodes if n.kind == NodeKind.PROCESS]
    assert len(proc_nodes) == 2
    assert all(p.group_id == "svc:orders-svc" for p in proc_nodes)
    assert all(p.metrics.rps == 10.0 for p in proc_nodes)

    svc_node = next(n for n in graph.nodes if n.id == "svc:orders-svc")
    assert svc_node.metrics.rps == 20.0
    assert svc_node.metrics.cpu_percent == 40.0
    assert svc_node.group_id is None

    # First run has no transitions
    assert events == []


def test_aggregator_health_transitions() -> None:
    th = HealthThresholds(
        degraded_p99_ms=250.0,
        degraded_error_rate=0.01,
        degraded_saturation=0.75,
        critical_p99_ms=1000.0,
        critical_error_rate=0.05,
        critical_saturation=0.92,
    )
    aggregator = TopologyAggregator(thresholds=th)

    # 1. Healthy sample
    sample_healthy = _create_sample([1], cpu=10.0)
    _, events_1 = aggregator.process_sample(sample_healthy)
    assert events_1 == []

    # 2. Critical CPU load (saturation > 0.92)
    sample_critical = _create_sample([1], cpu=390.0)  # > 0.92 saturation on 4 cores
    graph_2, events_2 = aggregator.process_sample(sample_critical)
    proc_node = next(n for n in graph_2.nodes if n.kind == NodeKind.PROCESS)
    assert proc_node.health == HealthStatus.CRITICAL

    # Health transition emitted
    node_events = [e for e in events_2 if e.entity_id == proc_node.id]
    assert len(node_events) == 1
    assert node_events[0].from_status == HealthStatus.HEALTHY
    assert node_events[0].to_status == HealthStatus.CRITICAL
    assert len(node_events[0].reasons) > 0

    # 3. Steady critical state: no duplicate event
    _, events_3 = aggregator.process_sample(sample_critical)
    node_events_3 = [e for e in events_3 if e.entity_id == proc_node.id]
    assert len(node_events_3) == 0

    # 4. Recovery back to healthy
    graph_4, events_4 = aggregator.process_sample(sample_healthy)
    proc_node_4 = next(n for n in graph_4.nodes if n.kind == NodeKind.PROCESS)
    assert proc_node_4.health == HealthStatus.HEALTHY
    node_events_4 = [e for e in events_4 if e.entity_id == proc_node.id]
    assert len(node_events_4) == 1
    assert node_events_4[0].from_status == HealthStatus.CRITICAL
    assert node_events_4[0].to_status == HealthStatus.HEALTHY


def test_aggregator_ring_buffer_history_capped_at_limit() -> None:
    aggregator = TopologyAggregator(history_limit=120)

    for i in range(130):
        sample = _create_sample([1], cpu=10.0 + (i % 5))
        aggregator.process_sample(sample)

    node_id = next(n.id for n in aggregator.latest_graph.nodes if n.kind == NodeKind.PROCESS)
    detail = aggregator.get_node_detail(node_id)
    assert detail is not None
    assert len(detail.history["rps"]) == 120
    assert len(detail.history["cpu_percent"]) == 120


def test_aggregator_prunes_stale_history() -> None:
    aggregator = TopologyAggregator()

    sample_1 = _create_sample([1, 2])
    aggregator.process_sample(sample_1)
    p2_id = next(n.id for n in aggregator.latest_graph.nodes if ":2:" in n.id)
    assert aggregator.get_node_detail(p2_id) is not None

    # Sample 2: process 2 died
    sample_2 = _create_sample([1])
    aggregator.process_sample(sample_2)
    assert aggregator.get_node_detail(p2_id) is None


def test_aggregator_get_summary() -> None:
    aggregator = TopologyAggregator()
    engine = SimulationEngine(seed=42)
    sample = engine.step(1.0)
    aggregator.process_sample(sample)

    summary = aggregator.get_summary(mode=SourceMode.DEMO, active_scenario="request-storm")
    assert summary.node_count > 0
    assert summary.edge_count > 0
    assert summary.total_rps > 0.0
    assert summary.active_scenario == "request-storm"
    assert summary.mode == SourceMode.DEMO


def test_aggregator_get_node_detail_and_edge_detail() -> None:
    aggregator = TopologyAggregator()
    engine = SimulationEngine(seed=42)
    sample = engine.step(1.0)
    graph, _ = aggregator.process_sample(sample)

    assert aggregator.get_node_detail("non-existent") is None
    assert aggregator.get_edge_detail("non-existent") is None

    # Test detail for service node
    svc_id = "svc:api-gateway"
    svc_detail = aggregator.get_node_detail(svc_id)
    assert svc_detail is not None
    assert svc_detail.node.id == svc_id
    assert len(svc_detail.neighbours.down) > 0

    # Test detail for edge
    edge = graph.edges[0]
    edge_detail = aggregator.get_edge_detail(edge.id)
    assert edge_detail is not None
    assert edge_detail.edge.id == edge.id
    assert "rps" in edge_detail.history


def test_aggregator_filter_graph() -> None:
    engine = SimulationEngine(seed=42)
    sample = engine.step(1.0)
    aggregator = TopologyAggregator()
    graph, _ = aggregator.process_sample(sample)

    # Filter by kinds
    filtered_kinds = TopologyAggregator.filter_graph(
        graph, kinds=[NodeKind.GATEWAY, NodeKind.SERVICE]
    )
    assert all(n.kind in (NodeKind.GATEWAY, NodeKind.SERVICE) for n in filtered_kinds.nodes)
    assert all(
        e.source in {n.id for n in filtered_kinds.nodes}
        and e.target in {n.id for n in filtered_kinds.nodes}
        for e in filtered_kinds.edges
    )

    # Filter by min_rps
    filtered_rps = TopologyAggregator.filter_graph(graph, min_rps=50.0)
    assert all(n.metrics.rps >= 50.0 for n in filtered_rps.nodes)

    # Filter by group
    filtered_group = TopologyAggregator.filter_graph(graph, group="svc:orders-svc")
    assert all(
        n.id == "svc:orders-svc" or n.group_id == "svc:orders-svc" for n in filtered_group.nodes
    )
