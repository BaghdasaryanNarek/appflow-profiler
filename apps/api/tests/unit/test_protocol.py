"""Unit tests for WebSocket protocol envelope and discriminated unions (Master Plan §4.5)."""

from datetime import UTC, datetime
from typing import Any

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
    Node,
    NodeMetrics,
    ScenarioInfo,
    TopologyGraph,
)
from appflow.streaming.protocol import (
    ClientMessage,
    ClientPauseMessage,
    ClientPingMessage,
    ClientResumeMessage,
    ClientResyncMessage,
    ClientSubscribeMessage,
    ClientUpdateFiltersMessage,
    DeltaPayload,
    EdgePatch,
    EmptyPayload,
    ErrorPayload,
    HealthEventPayload,
    HeartbeatPayload,
    HelloPayload,
    NodePatch,
    ResyncPayload,
    ScenarioPayload,
    ServerDeltaMessage,
    ServerErrorMessage,
    ServerHealthEventMessage,
    ServerHeartbeatMessage,
    ServerHelloMessage,
    ServerScenarioMessage,
    ServerSnapshotMessage,
    SnapshotPayload,
    SubscribePayload,
    TopologyFilters,
    UpdateFiltersPayload,
    parse_client_message,
    parse_server_message,
)


def _sample_meta() -> MetaResponse:
    return MetaResponse(
        version="0.1.0",
        mode=SourceMode.DEMO,
        tick_ms=1000,
        capabilities=Capabilities(
            per_process_io=True, connection_owner=True, ai_advisor=True, scenarios=True
        ),
        limits=MetaLimits(max_nodes=500),
    )


def _sample_graph() -> TopologyGraph:
    node = Node(
        id="svc:auth",
        kind=NodeKind.SERVICE,
        label="auth-svc",
        health=HealthStatus.HEALTHY,
        metrics=NodeMetrics(
            rps=50.0,
            p50_ms=10.0,
            p99_ms=45.0,
            error_rate=0.0,
            saturation=0.3,
            cpu_percent=15.0,
            rss_bytes=1024 * 1024 * 64,
            open_connections=10,
            quality=MetricQuality.SIMULATED,
        ),
    )
    edge = Edge(
        id="edge:svc:auth->svc:db:pg",
        source="svc:auth",
        target="svc:db",
        protocol=Protocol.PG,
        health=HealthStatus.HEALTHY,
        metrics=EdgeMetrics(
            rps=45.0,
            bytes_per_sec=1024 * 32,
            p99_ms=12.0,
            error_rate=0.0,
            connection_count=5,
            state_breakdown={ConnState.ESTABLISHED: 5},
            retry_rate=0.0,
            quality=MetricQuality.SIMULATED,
        ),
    )
    return TopologyGraph(nodes=[node], edges=[edge], timestamp=datetime.now(UTC))


def test_server_hello_roundtrip() -> None:
    msg = ServerHelloMessage(payload=HelloPayload(meta=_sample_meta()))
    raw = msg.model_dump(mode="json")
    assert raw["type"] == "hello"
    assert raw["v"] == 1
    parsed = parse_server_message(raw)
    assert isinstance(parsed, ServerHelloMessage)
    assert parsed.payload.meta.version == "0.1.0"


def test_server_snapshot_roundtrip() -> None:
    graph = _sample_graph()
    msg = ServerSnapshotMessage(seq=101, payload=SnapshotPayload(graph=graph))
    raw = msg.model_dump(mode="json")
    assert raw["type"] == "snapshot"
    assert raw["seq"] == 101
    parsed = parse_server_message(raw)
    assert isinstance(parsed, ServerSnapshotMessage)
    assert len(parsed.payload.graph.nodes) == 1


def test_server_delta_roundtrip() -> None:
    node_patch = NodePatch(
        id="svc:auth",
        health=HealthStatus.DEGRADED,
        health_reasons=["p99_ms 300.0 > 250.0"],
    )
    edge_patch = EdgePatch(id="edge:svc:auth->svc:db:pg", health=HealthStatus.DEGRADED)
    msg = ServerDeltaMessage(
        seq=102,
        payload=DeltaPayload(
            base_seq=101,
            added_nodes=[],
            updated_nodes=[node_patch],
            removed_node_ids=["proc:999:1"],
            added_edges=[],
            updated_edges=[edge_patch],
            removed_edge_ids=[],
        ),
    )
    raw = msg.model_dump(mode="json")
    assert raw["type"] == "delta"
    assert raw["seq"] == 102
    parsed = parse_server_message(raw)
    assert isinstance(parsed, ServerDeltaMessage)
    assert parsed.payload.base_seq == 101
    assert parsed.payload.updated_nodes[0].id == "svc:auth"
    assert parsed.payload.removed_node_ids == ["proc:999:1"]


def test_server_health_event_aliases() -> None:
    msg = ServerHealthEventMessage(
        payload=HealthEventPayload(
            entity_id="svc:orders",
            from_status=HealthStatus.HEALTHY,
            to_status=HealthStatus.CRITICAL,
            reasons=["error_rate 0.080 > 0.050"],
        )
    )
    raw = msg.model_dump(mode="json", by_alias=True)
    assert raw["payload"]["from"] == "healthy"
    assert raw["payload"]["to"] == "critical"

    parsed = parse_server_message(raw)
    assert isinstance(parsed, ServerHealthEventMessage)
    assert parsed.payload.from_status is HealthStatus.HEALTHY
    assert parsed.payload.to_status is HealthStatus.CRITICAL


def test_server_scenario_message() -> None:
    scenario = ScenarioInfo(
        id="request-storm",
        name="Request Storm",
        description="Hawkes process spike",
        duration_s=45,
        active=True,
    )
    msg = ServerScenarioMessage(payload=ScenarioPayload(active=scenario))
    raw = msg.model_dump(mode="json")
    parsed = parse_server_message(raw)
    assert isinstance(parsed, ServerScenarioMessage)
    assert parsed.payload.active is not None
    assert parsed.payload.active.id == "request-storm"


def test_server_heartbeat_message() -> None:
    msg = ServerHeartbeatMessage(payload=HeartbeatPayload(tick_age_ms=12))
    raw = msg.model_dump(mode="json")
    parsed = parse_server_message(raw)
    assert isinstance(parsed, ServerHeartbeatMessage)
    assert parsed.payload.tick_age_ms == 12


def test_server_error_message() -> None:
    msg = ServerErrorMessage(
        payload=ErrorPayload(
            code="INVALID_FILTER",
            title="Invalid Subscription Filter",
            detail="Unknown node kind requested",
        )
    )
    raw = msg.model_dump(mode="json")
    parsed = parse_server_message(raw)
    assert isinstance(parsed, ServerErrorMessage)
    assert parsed.payload.code == "INVALID_FILTER"


@pytest.mark.parametrize(
    ("msg_obj", "expected_type"),
    [
        (
            ClientSubscribeMessage(
                payload=SubscribePayload(
                    filters=TopologyFilters(kinds=[NodeKind.SERVICE], min_rps=10.0)
                )
            ),
            "subscribe",
        ),
        (
            ClientUpdateFiltersMessage(
                payload=UpdateFiltersPayload(filters=TopologyFilters(group="svc:orders"))
            ),
            "update_filters",
        ),
        (ClientPauseMessage(payload=EmptyPayload()), "pause"),
        (ClientResumeMessage(payload=EmptyPayload()), "resume"),
        (ClientResyncMessage(payload=ResyncPayload(last_seq=42)), "resync"),
        (ClientPingMessage(payload=EmptyPayload()), "ping"),
    ],
)
def test_client_messages_roundtrip(msg_obj: ClientMessage, expected_type: str) -> None:
    raw = msg_obj.model_dump(mode="json")
    assert raw["type"] == expected_type
    assert raw["v"] == 1
    parsed = parse_client_message(raw)
    assert parsed.type == expected_type


def test_invalid_client_message_rejected() -> None:
    bad_data: dict[str, Any] = {"v": 1, "type": "unsupported_action", "payload": {}}
    with pytest.raises(ValidationError):
        parse_client_message(bad_data)


def test_invalid_protocol_version_rejected() -> None:
    bad_data: dict[str, Any] = {"v": 2, "type": "ping", "payload": {}}
    with pytest.raises(ValidationError):
        parse_client_message(bad_data)
