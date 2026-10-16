"""Integration tests for chaos scenario verification, memory bounds, and delta efficiency.

Covers Master Plan §1.4, §4.3, §4.4, §5.3, §5.4, and Phase 16 verification gates.
"""

import json
from datetime import UTC, datetime

from appflow.advisor.digest import build_digest
from appflow.advisor.heuristics import generate_heuristic_report
from appflow.domain.enums import ConnState, HealthStatus, MetricQuality, Protocol
from appflow.simulation.engine import SimulationEngine
from appflow.simulation.scenarios import AVAILABLE_SCENARIOS, ScenarioState
from appflow.sources.base import RawConnection, RawProcessSample, RawSample
from appflow.streaming.aggregator import TopologyAggregator
from appflow.streaming.diff import DiffEngine
from appflow.streaming.protocol import SnapshotPayload


def test_all_four_chaos_scenarios_end_to_end_and_recovery() -> None:
    """Verify all 4 chaos scenarios mutate physics, emit health events, and recover cleanly."""
    engine = SimulationEngine(seed=42, scale=1.0, autoplay=False)
    aggregator = TopologyAggregator(history_limit=60)

    # 1. Warm up in steady state
    steady_sample = engine.step(dt=1.0)
    steady_graph, initial_events = aggregator.process_sample(steady_sample)
    assert len(steady_graph.nodes) == 53
    assert len(steady_graph.edges) == 17
    assert initial_events == []

    steady_nodes = {n.id: n for n in steady_graph.nodes}
    steady_replica_rps = steady_nodes["svc:postgres-replica"].metrics.rps

    # Verify all 4 scenarios are registered
    assert set(AVAILABLE_SCENARIOS.keys()) == {
        "request-storm",
        "db-pool-exhaustion",
        "cache-stampede",
        "slow-dependency",
    }

    # --- Scenario A: request-storm ---
    info_storm = engine.scenarios.activate("request-storm")
    engine.scenarios._on_scenario_start(engine)
    assert info_storm.active is True
    assert engine.scenarios.state == ScenarioState.SCENARIO

    storm_events = []
    storm_graph = steady_graph
    for _ in range(5):
        sample = engine.step(dt=1.0)
        storm_graph, events = aggregator.process_sample(sample)
        storm_events.extend(events)

    degraded_or_critical_nodes = [
        n for n in storm_graph.nodes if n.health in (HealthStatus.DEGRADED, HealthStatus.CRITICAL)
    ]
    assert len(degraded_or_critical_nodes) > 0
    assert all(len(n.health_reasons) > 0 for n in degraded_or_critical_nodes)
    assert len(storm_events) > 0

    storm_digest = build_digest(
        storm_graph,
        scope="global",
        focus="capacity",
        active_scenario="request-storm",
    )
    storm_report = generate_heuristic_report(storm_digest, focus="capacity")
    assert len(storm_report.bottlenecks) > 0
    assert len(storm_report.recommendations) > 0
    known_ids = {n.id for n in storm_graph.nodes}
    for rec in storm_report.recommendations:
        assert all(nid in known_ids for nid in rec.affected_node_ids)

    engine.reset()
    state_after_reset: ScenarioState = engine.scenarios.state
    assert state_after_reset == ScenarioState.STEADY
    assert engine.active_scenario is None

    # Re-baseline aggregator after reset
    aggregator = TopologyAggregator(history_limit=60)
    aggregator.process_sample(engine.step(dt=1.0))

    # --- Scenario B: db-pool-exhaustion ---
    info_db = engine.scenarios.activate("db-pool-exhaustion")
    assert info_db.active is True
    assert engine.scenarios.apply_service_rate_modifier("svc:postgres-primary", 350.0) == 140.0

    db_sample = engine.step(dt=1.0)
    db_graph, db_events = aggregator.process_sample(db_sample)

    pg_edges = [e for e in db_graph.edges if e.target == "svc:postgres-primary"]
    assert len(pg_edges) > 0
    assert any(e.metrics.state_breakdown.get(ConnState.CLOSE_WAIT, 0) > 0 for e in pg_edges)
    assert any(e.health in (HealthStatus.DEGRADED, HealthStatus.CRITICAL) for e in pg_edges)
    assert len(db_events) > 0

    db_digest = build_digest(
        db_graph,
        scope="svc:postgres-primary",
        focus="connection pooling",
        active_scenario="db-pool-exhaustion",
    )
    db_report = generate_heuristic_report(db_digest, focus="connection pooling")
    assert len(db_report.bottlenecks) > 0
    assert any("svc:postgres-primary" in rec.affected_node_ids for rec in db_report.recommendations)

    engine.reset()

    # --- Scenario C: cache-stampede ---
    info_cache = engine.scenarios.activate("cache-stampede")
    assert info_cache.active is True
    assert engine.scenarios.apply_cache_miss_modifier("svc:postgres-replica", 0.05) == 0.80

    cache_sample = engine.step(dt=1.0)
    cache_graph, _ = aggregator.process_sample(cache_sample)
    cache_nodes = {n.id: n for n in cache_graph.nodes}
    stampede_replica_rps = cache_nodes["svc:postgres-replica"].metrics.rps
    assert stampede_replica_rps > steady_replica_rps * 10.0

    cache_digest = build_digest(
        cache_graph,
        scope="svc:postgres-replica",
        focus="caching",
        active_scenario="cache-stampede",
    )
    cache_report = generate_heuristic_report(cache_digest, focus="caching")
    assert len(cache_report.recommendations) > 0
    assert any(r.category.value == "caching" for r in cache_report.recommendations)

    engine.reset()

    # --- Scenario D: slow-dependency ---
    info_slow = engine.scenarios.activate("slow-dependency")
    assert info_slow.active is True
    assert engine.scenarios.apply_latency_modifier("ext:payments-provider", 80.0) == 1800.0

    # Step multiple ticks so retry traffic from timeout errors propagates
    for _ in range(3):
        slow_sample = engine.step(dt=1.0)
        slow_graph, _ = aggregator.process_sample(slow_sample)

    assert sum(engine.service_retry_traffic.values()) > 0.0

    slow_digest = build_digest(
        slow_graph,
        scope="svc:payments-svc",
        focus="timeout",
        active_scenario="slow-dependency",
    )
    slow_report = generate_heuristic_report(slow_digest, focus="timeout")
    assert len(slow_report.bottlenecks) > 0
    assert any(r.category.value == "timeouts" for r in slow_report.recommendations)

    # Final recovery check
    engine.reset()
    recovered_sample = engine.step(dt=1.0)
    recovered_graph, _ = aggregator.process_sample(recovered_sample)
    assert engine.active_scenario is None
    assert all(e.health == HealthStatus.HEALTHY for e in recovered_graph.edges)


def test_aggregator_history_ring_buffer_and_churn_pruning() -> None:
    """Verify ring buffers cap at history_limit and terminated processes are pruned."""
    history_limit = 25
    aggregator = TopologyAggregator(history_limit=history_limit)

    for tick in range(80):
        # Persistent process 1001 + transient process that changes PID every tick
        transient_pid = 30000 + tick
        processes = {
            1001: RawProcessSample(
                pid=1001,
                name="api-gateway",
                cmdline_sanitized="/usr/bin/api-gateway --port 8080",
                create_time=1700000000.0,
                cpu_percent=20.0 + (tick % 5),
                rss_bytes=128 * 1024 * 1024,
                open_connections=12,
                num_threads=8,
                io_bytes_per_sec=120 * 1024.0,
            ),
            transient_pid: RawProcessSample(
                pid=transient_pid,
                name="ephemeral-worker",
                cmdline_sanitized=f"/usr/bin/ephemeral-worker --port {9000 + (tick % 50)}",
                create_time=1700000000.0 + tick,
                cpu_percent=15.0,
                rss_bytes=64 * 1024 * 1024,
                open_connections=2,
                num_threads=4,
                io_bytes_per_sec=10 * 1024.0,
            ),
        }
        connections = [
            RawConnection(
                laddr_ip="127.0.0.1",
                laddr_port=50000,
                raddr_ip="127.0.0.1",
                raddr_port=8080,
                status=ConnState.ESTABLISHED,
                protocol=Protocol.HTTP,
                pid=1001,
            )
        ]
        sample = RawSample(
            timestamp=datetime.now(UTC),
            connections=connections,
            processes=processes,
            quality=MetricQuality.SIMULATED,
        )
        aggregator.process_sample(sample)

    # Active graph has only persistent process + current tick's transient process + services
    active_ids = {n.id for n in aggregator.latest_graph.nodes}
    assert len(aggregator._node_history) == len(active_ids)
    assert len(aggregator._proc_cpu_ema) == 2

    # Ring buffer history never exceeds history_limit
    detail = aggregator.get_node_detail("svc:api-gateway")
    assert detail is not None
    for series in detail.history.values():
        assert len(series) == history_limit


def test_diff_engine_steady_state_delta_compression_budget() -> None:
    """Verify steady-state delta JSON size is < 15% of full snapshot JSON size (§1.4)."""
    engine = SimulationEngine(seed=42, scale=1.0, autoplay=False)
    aggregator = TopologyAggregator(history_limit=60)
    diff_engine = DiffEngine()

    sample_1 = engine.step(dt=1.0)
    graph_1, _ = aggregator.process_sample(sample_1)

    snapshot = SnapshotPayload(graph=graph_1)
    snapshot_bytes = len(
        json.dumps(snapshot.model_dump(mode="json"), separators=(",", ":")).encode("utf-8")
    )

    # Advance a quiescent steady-state tick where most metrics remain within the 0.5% epsilon
    sample_2 = engine.step(dt=0.05)
    graph_2, _ = aggregator.process_sample(sample_2)

    delta = diff_engine.diff(graph_1, graph_2, base_seq=1)
    if delta is None:
        delta_bytes = 0
    else:
        delta_bytes = len(
            json.dumps(
                delta.model_dump(mode="json", exclude_none=True),
                separators=(",", ":"),
            ).encode("utf-8")
        )

    assert delta_bytes < snapshot_bytes * 0.15
