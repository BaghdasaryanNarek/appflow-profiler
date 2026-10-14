"""Unit tests for domain models, validation, and immutability (Master Plan §4.3)."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from appflow.domain.enums import (
    ConnState,
    HealthStatus,
    MetricQuality,
    NodeKind,
    Protocol,
    SourceMode,
)
from appflow.domain.models import (
    Capabilities,
    Edge,
    EdgeMetrics,
    MetaLimits,
    MetaResponse,
    NeighbourRef,
    Node,
    NodeDetail,
    NodeMetrics,
    NodeNeighbours,
    ProcessInfo,
    ScenarioInfo,
    SocketInfo,
    TopologyGraph,
    TopologySummary,
)


def _sample_node_metrics(**overrides: object) -> NodeMetrics:
    defaults: dict[str, object] = {
        "rps": 120.0,
        "p50_ms": 15.0,
        "p99_ms": 65.0,
        "error_rate": 0.001,
        "saturation": 0.45,
        "cpu_percent": 30.5,
        "rss_bytes": 1024 * 1024 * 128,
        "open_connections": 25,
        "quality": MetricQuality.MEASURED,
    }
    defaults.update(overrides)
    return NodeMetrics.model_validate(defaults)


def _sample_node(**overrides: object) -> Node:
    defaults: dict[str, object] = {
        "id": "svc:catalog",
        "kind": NodeKind.SERVICE,
        "label": "catalog-api",
        "group_id": None,
        "health": HealthStatus.HEALTHY,
        "health_reasons": [],
        "metrics": _sample_node_metrics(),
        "process": None,
        "tags": {"tier": "service"},
    }
    defaults.update(overrides)
    return Node.model_validate(defaults)


def _sample_edge_metrics(**overrides: object) -> EdgeMetrics:
    defaults: dict[str, object] = {
        "rps": 85.0,
        "bytes_per_sec": 1024 * 256,
        "p99_ms": 22.0,
        "error_rate": 0.0,
        "connection_count": 8,
        "state_breakdown": {ConnState.ESTABLISHED: 8},
        "retry_rate": 0.0,
        "quality": MetricQuality.MEASURED,
    }
    defaults.update(overrides)
    return EdgeMetrics.model_validate(defaults)


def _sample_edge(**overrides: object) -> Edge:
    defaults: dict[str, object] = {
        "id": "edge:svc:gateway->svc:catalog:http",
        "source": "svc:gateway",
        "target": "svc:catalog",
        "protocol": Protocol.HTTP,
        "health": HealthStatus.HEALTHY,
        "metrics": _sample_edge_metrics(),
    }
    defaults.update(overrides)
    return Edge.model_validate(defaults)


def test_models_are_frozen() -> None:
    node = _sample_node()
    with pytest.raises(ValidationError):
        # Immutability prevents field modification
        node.label = "mutated-label"


def test_models_forbid_extra_fields() -> None:
    with pytest.raises(ValidationError) as exc:
        _sample_node_metrics(unknown_field=123)
    assert "extra_forbidden" in str(exc.value)


@pytest.mark.parametrize(
    "invalid_kwargs",
    [
        {"rps": -1.0},
        {"p50_ms": -0.1},
        {"p99_ms": -5.0},
        {"error_rate": 1.05},
        {"error_rate": -0.01},
        {"saturation": 1.1},
        {"saturation": -0.1},
        {"cpu_percent": -10.0},
        {"rss_bytes": -1},
        {"open_connections": -5},
    ],
)
def test_node_metrics_bounds(invalid_kwargs: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        _sample_node_metrics(**invalid_kwargs)


def test_node_label_max_length() -> None:
    long_label = "a" * 65
    with pytest.raises(ValidationError):
        _sample_node(label=long_label)

    valid_label = "a" * 64
    node = _sample_node(label=valid_label)
    assert node.label == valid_label


def test_process_info_validation() -> None:
    proc = ProcessInfo(
        pid=1234,
        ppid=1,
        name="python3",
        cmdline_sanitized="python3 -m appflow.main",
        username="appuser",
        num_threads=8,
        create_time=1700000000.5,
    )
    assert proc.pid == 1234
    assert proc.name == "python3"

    with pytest.raises(ValidationError):
        ProcessInfo(
            pid=-1,
            name="bad",
            cmdline_sanitized="bad",
            create_time=100.0,
        )


def test_socket_info_port_range() -> None:
    sock = SocketInfo(
        local_addr="0.0.0.0",
        local_port=8080,
        remote_addr="1.2.3.4",
        remote_port=54321,
        state=ConnState.LISTEN,
        protocol=Protocol.TCP,
        pid=100,
    )
    assert sock.local_port == 8080

    with pytest.raises(ValidationError):
        SocketInfo(
            local_addr="0.0.0.0",
            local_port=70000,
            state=ConnState.LISTEN,
            protocol=Protocol.TCP,
        )


def test_topology_graph_roundtrip() -> None:
    node = _sample_node()
    edge = _sample_edge()
    now = datetime.now(UTC)
    graph = TopologyGraph(nodes=[node], edges=[edge], timestamp=now)

    serialized = graph.model_dump_json()
    deserialized = TopologyGraph.model_validate_json(serialized)

    assert len(deserialized.nodes) == 1
    assert deserialized.nodes[0].id == node.id
    assert len(deserialized.edges) == 1
    assert deserialized.edges[0].id == edge.id


def test_topology_summary_serialization() -> None:
    now = datetime.now(UTC)
    summary = TopologySummary(
        mode=SourceMode.DEMO,
        node_count=45,
        edge_count=82,
        total_rps=12500.5,
        global_p99_ms=45.2,
        global_error_rate=0.003,
        critical_count=0,
        degraded_count=2,
        active_scenario="request-storm",
        generated_at=now,
    )
    json_str = summary.model_dump_json()
    loaded = TopologySummary.model_validate_json(json_str)
    assert loaded.mode == SourceMode.DEMO
    assert loaded.total_rps == 12500.5
    assert loaded.active_scenario == "request-storm"


def test_node_detail_model() -> None:
    node = _sample_node()
    sock = SocketInfo(
        local_addr="127.0.0.1",
        local_port=8000,
        state=ConnState.LISTEN,
        protocol=Protocol.TCP,
    )
    neighbour = NeighbourRef(
        node_id="svc:gateway",
        label="gateway",
        kind=NodeKind.GATEWAY,
        health=HealthStatus.HEALTHY,
        edge_id="edge:svc:gateway->svc:catalog:http",
        protocol=Protocol.HTTP,
        rps=85.0,
    )
    detail = NodeDetail(
        node=node,
        sockets=[sock],
        history={"rps": [10.0, 20.0, 30.0]},
        neighbours=NodeNeighbours(up=[neighbour], down=[]),
    )
    assert len(detail.sockets) == 1
    assert detail.history["rps"] == [10.0, 20.0, 30.0]
    assert len(detail.neighbours.up) == 1


def test_meta_response_contract() -> None:
    meta = MetaResponse(
        version="0.1.0",
        mode=SourceMode.LIVE,
        tick_ms=1000,
        capabilities=Capabilities(
            per_process_io=True,
            connection_owner=True,
            ai_advisor=False,
            scenarios=False,
        ),
        limits=MetaLimits(max_nodes=1000),
    )
    assert meta.capabilities.per_process_io
    assert meta.limits.max_nodes == 1000


def test_scenario_info_contract() -> None:
    scen = ScenarioInfo(
        id="db-pool-exhaustion",
        name="DB Pool Exhaustion",
        description="Simulates database connection pool saturation",
        duration_s=60,
        active=True,
    )
    assert scen.id == "db-pool-exhaustion"
    assert scen.duration_s == 60
