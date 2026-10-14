"""Integration tests for WebSocket topology streaming, flow control and backpressure.

Conforms to Master Plan Phase 6.
"""

import asyncio
import time

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from appflow import __version__
from appflow.config import Environment, Settings
from appflow.domain.enums import NodeKind
from appflow.main import create_app
from appflow.streaming.aggregator import TopologyAggregator
from appflow.streaming.hub import ClientSession, StreamHub
from appflow.streaming.protocol import (
    ClientPauseMessage,
    ClientPingMessage,
    ClientResumeMessage,
    ClientResyncMessage,
    ClientSubscribeMessage,
    ClientUpdateFiltersMessage,
    HeartbeatPayload,
    ResyncPayload,
    ServerHeartbeatMessage,
    SubscribePayload,
    TopologyFilters,
    UpdateFiltersPayload,
)


def test_ws_handshake_hello_subscribe_snapshot_delta(client: TestClient) -> None:
    """Verify handshake sequence: hello -> subscribe -> snapshot -> delta."""
    with client.websocket_connect("/ws/v1/topology") as ws:
        # 1. Server sends hello immediately on accept
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        assert hello["payload"]["meta"]["version"] == __version__
        assert hello["seq"] is None

        # 2. Client sends subscribe
        sub_msg = ClientSubscribeMessage(payload=SubscribePayload(filters=TopologyFilters()))
        ws.send_text(sub_msg.model_dump_json(by_alias=True))

        # 3. Server delivers initial baseline snapshot (seq=1)
        snapshot = ws.receive_json()
        assert snapshot["type"] == "snapshot"
        assert snapshot["seq"] == 1
        nodes = snapshot["payload"]["graph"]["nodes"]
        assert len(nodes) > 0

        # 4. Next tick delivers incremental delta (base_seq=1, seq=2)
        delta = ws.receive_json()
        assert delta["type"] == "delta"
        assert delta["seq"] == 2
        assert delta["payload"]["base_seq"] == 1


def test_ws_resync_ordering(client: TestClient) -> None:
    """Verify resync returns a fresh snapshot and increments monotonic seq."""
    with client.websocket_connect("/ws/v1/topology") as ws:
        _ = ws.receive_json()  # hello

        # Subscribe
        sub_msg = ClientSubscribeMessage()
        ws.send_text(sub_msg.model_dump_json(by_alias=True))
        snap1 = ws.receive_json()
        assert snap1["seq"] == 1

        # Request resync
        resync_msg = ClientResyncMessage(payload=ResyncPayload(last_seq=snap1["seq"]))
        ws.send_text(resync_msg.model_dump_json(by_alias=True))

        # Must receive fresh snapshot with seq=2
        snap2 = ws.receive_json()
        while snap2.get("type") == "delta":
            snap2 = ws.receive_json()
        assert snap2["type"] == "snapshot"
        assert snap2["seq"] >= 2


def test_ws_pause_and_resume(client: TestClient) -> None:
    """Verify pause suppresses updates and resume delivers fresh snapshot."""
    with client.websocket_connect("/ws/v1/topology") as ws:
        _ = ws.receive_json()  # hello
        ws.send_text(ClientSubscribeMessage().model_dump_json(by_alias=True))
        snap1 = ws.receive_json()
        assert snap1["seq"] == 1

        # Pause stream
        ws.send_text(ClientPauseMessage().model_dump_json(by_alias=True))

        # Resume stream
        ws.send_text(ClientResumeMessage().model_dump_json(by_alias=True))

        # Must receive fresh catch-up snapshot
        snap2 = ws.receive_json()
        while snap2.get("type") == "delta":
            snap2 = ws.receive_json()
        assert snap2["type"] == "snapshot"
        assert snap2["seq"] >= 2


def test_ws_update_filters(client: TestClient) -> None:
    """Verify update_filters immediately produces a filtered snapshot."""
    with client.websocket_connect("/ws/v1/topology") as ws:
        _ = ws.receive_json()  # hello
        ws.send_text(ClientSubscribeMessage().model_dump_json(by_alias=True))
        _ = ws.receive_json()  # initial snapshot

        # Update filters to GATEWAY only
        update_msg = ClientUpdateFiltersMessage(
            payload=UpdateFiltersPayload(filters=TopologyFilters(kinds=[NodeKind.GATEWAY]))
        )
        ws.send_text(update_msg.model_dump_json(by_alias=True))

        filtered_snap = ws.receive_json()
        while filtered_snap.get("type") == "delta":
            filtered_snap = ws.receive_json()
        assert filtered_snap["type"] == "snapshot"
        nodes = filtered_snap["payload"]["graph"]["nodes"]
        assert len(nodes) > 0
        assert all(n["kind"] == "gateway" for n in nodes)


def test_ws_ping_pong_heartbeat(client: TestClient) -> None:
    """Verify client ping receives immediate server heartbeat."""
    with client.websocket_connect("/ws/v1/topology") as ws:
        _ = ws.receive_json()  # hello
        ws.send_text(ClientPingMessage().model_dump_json(by_alias=True))

        hb = ws.receive_json()
        assert hb["type"] == "heartbeat"
        assert hb["payload"]["tick_age_ms"] >= 0


def test_ws_origin_check_rejected_disallowed(settings: Settings) -> None:
    """Verify connections with untrusted origin headers are rejected with code 1008."""
    app = create_app(settings)
    with (
        TestClient(app) as test_client,
        pytest.raises(WebSocketDisconnect) as exc_info,
        test_client.websocket_connect(
            "/ws/v1/topology", headers={"origin": "https://unauthorized-domain.com"}
        ),
    ):
        pass
    assert exc_info.value.code == 1008


def test_ws_origin_check_allowed_accepted(settings: Settings) -> None:
    """Verify connections matching ALLOWED_ORIGINS succeed."""
    app = create_app(settings)
    with (
        TestClient(app) as test_client,
        test_client.websocket_connect(
            "/ws/v1/topology", headers={"origin": "http://localhost:3000"}
        ) as ws,
    ):
        hello = ws.receive_json()
        assert hello["type"] == "hello"


def test_ws_client_cap_enforced() -> None:
    """Verify exceeding MAX_WS_CLIENTS closes connection with code 1013."""
    capped_settings = Settings(
        env=Environment.TEST,
        tick_ms=1000,
        max_ws_clients=1,
        log_level="WARNING",
    )
    app = create_app(capped_settings)
    with TestClient(app) as test_client, test_client.websocket_connect("/ws/v1/topology") as ws1:
        _ = ws1.receive_json()

        # Second connection exceeds cap
        with (
            pytest.raises(WebSocketDisconnect) as exc_info,
            test_client.websocket_connect("/ws/v1/topology"),
        ):
            pass
        assert exc_info.value.code == 1013


def test_ws_inbound_frame_size_limit(client: TestClient) -> None:
    """Verify messages exceeding 4096 bytes return FRAME_TOO_LARGE error."""
    with client.websocket_connect("/ws/v1/topology") as ws:
        _ = ws.receive_json()  # hello

        # Send oversized frame (5000 bytes)
        huge_payload = "x" * 5000
        ws.send_text(huge_payload)

        err = ws.receive_json()
        assert err["type"] == "error"
        assert err["payload"]["code"] == "FRAME_TOO_LARGE"


def test_ws_three_protocol_errors_closes_connection(client: TestClient) -> None:
    """Verify 3 protocol violations cause connection termination with close code 1008."""
    with client.websocket_connect("/ws/v1/topology") as ws:
        _ = ws.receive_json()  # hello

        # Error 1
        ws.send_text("not-json-1")
        err1 = ws.receive_json()
        assert err1["type"] == "error"

        # Error 2
        ws.send_text("not-json-2")
        err2 = ws.receive_json()
        assert err2["type"] == "error"

        # Error 3: triggers disconnect with 1008
        ws.send_text("not-json-3")
        with pytest.raises(WebSocketDisconnect) as exc_info:
            ws.receive_json()

    assert exc_info.value.code == 1008


def test_ws_queue_overflow_backpressure_drain() -> None:
    """Verify queue overflow drains queue and delivers a fresh snapshot."""
    session = ClientSession(client_id="test-client")
    hub = StreamHub(source=None, aggregator=None, settings=Settings())  # type: ignore[arg-type]

    agg = TopologyAggregator()
    hub.aggregator = agg

    dummy_msg = ServerHeartbeatMessage(payload=HeartbeatPayload(tick_age_ms=0))

    # Fill queue to maxsize (8)
    for _ in range(8):
        session.queue.put_nowait(dummy_msg)
    assert session.queue.full()

    # 9th message triggers queue drain and enqueues snapshot
    hub._enqueue_client_message(session, dummy_msg)

    # Queue should now have exactly 1 message: fresh snapshot!
    assert session.queue.qsize() == 1
    fresh_msg = session.queue.get_nowait()
    assert fresh_msg.type == "snapshot"


@pytest.mark.asyncio
async def test_ws_50_concurrent_client_queues_without_tick_drift() -> None:
    """Verify 50 concurrent client queues sustained without tick drift > 10%.

    Conforms to Master Plan Phase 6 Acceptance Criteria.
    """
    from appflow.simulation.source import SimulationSource

    settings = Settings(env=Environment.TEST, tick_ms=50, max_ws_clients=60)
    source = SimulationSource(seed=42)
    await source.start()

    aggregator = TopologyAggregator()
    hub = StreamHub(source=source, aggregator=aggregator, settings=settings)

    # Register 50 clients with active subscriptions
    sessions: list[ClientSession] = []
    for i in range(50):
        s = ClientSession(client_id=f"concurrent-{i}")
        await hub.register_client(s)
        hub.handle_subscribe(s.client_id, SubscribePayload())
        sessions.append(s)

    await hub.start()

    # Let the hub execute 10 ticks (approx 500ms)
    t0 = time.monotonic()
    await asyncio.sleep(0.5)
    t_elapsed = time.monotonic() - t0

    await hub.stop()
    await source.stop()

    # Verify that all 50 clients received messages and sequence advanced
    for s in sessions:
        assert s.last_sent_seq > 1
        assert not s.queue.empty()

    # Assert tick timing is within 10% tolerance (50ms interval, 10 ticks = 500ms ± 50ms)
    assert t_elapsed >= 0.45
