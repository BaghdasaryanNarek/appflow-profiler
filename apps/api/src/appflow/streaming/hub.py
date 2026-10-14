"""Real-time StreamHub orchestrating tick acquisition, diff calculation, fan-out, and backpressure.

Conforms to Master Plan §1.3 & §4.5.
"""

import asyncio
import contextlib
import time
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from appflow import __version__
from appflow.domain.enums import SourceMode
from appflow.domain.models import (
    Capabilities,
    MetaLimits,
    MetaResponse,
    ScenarioInfo,
    TopologyGraph,
)
from appflow.logging import get_logger
from appflow.streaming.diff import DiffEngine
from appflow.streaming.protocol import (
    HeartbeatPayload,
    ResyncPayload,
    ScenarioPayload,
    ServerDeltaMessage,
    ServerHealthEventMessage,
    ServerHeartbeatMessage,
    ServerMessage,
    ServerScenarioMessage,
    ServerSnapshotMessage,
    SnapshotPayload,
    SubscribePayload,
    TopologyFilters,
    UpdateFiltersPayload,
)

if TYPE_CHECKING:
    from appflow.config import Settings
    from appflow.sources.base import TopologySource
    from appflow.streaming.aggregator import TopologyAggregator

_log = get_logger(__name__)

DEFAULT_QUEUE_MAXSIZE = 8
HEARTBEAT_INTERVAL_S = 15.0


@dataclass
class ClientSession:
    """Active WebSocket client subscription tracking sequence ordering and flow control."""

    client_id: str
    queue: asyncio.Queue[ServerMessage] = field(
        default_factory=lambda: asyncio.Queue(maxsize=DEFAULT_QUEUE_MAXSIZE)
    )
    filters: TopologyFilters = field(default_factory=TopologyFilters)
    last_sent_seq: int = 0
    last_sent_graph: TopologyGraph | None = None
    is_paused: bool = False
    created_at: float = field(default_factory=time.monotonic)


class StreamHub:
    """Central daemon streaming engine executing tick loops and broadcasting to clients."""

    def __init__(
        self,
        source: "TopologySource",
        aggregator: "TopologyAggregator",
        settings: "Settings",
    ) -> None:
        self.source = source
        self.aggregator = aggregator
        self.settings = settings
        self.diff_engine = DiffEngine()

        self._clients: dict[str, ClientSession] = {}
        self._lock = asyncio.Lock()

        self._tick_task: asyncio.Task[None] | None = None
        self._running: bool = False

        self._last_tick_monotonic: float = 0.0
        self._last_snapshot_time: float = 0.0
        self._last_heartbeat_time: float = 0.0
        self._last_scenario: ScenarioInfo | None = None

        self._prev_graph: TopologyGraph = TopologyGraph()

    @property
    def active_client_count(self) -> int:
        """Count of actively connected WebSocket clients."""
        return len(self._clients)

    @property
    def tick_age_ms(self) -> int | None:
        """Elapsed milliseconds since the latest engine tick."""
        if self._last_tick_monotonic <= 0.0:
            return None
        return int((time.monotonic() - self._last_tick_monotonic) * 1000)

    @property
    def is_healthy(self) -> bool:
        """Liveness condition: tick loop active and fresh within 5 seconds."""
        if not self._running:
            return False
        age = self.tick_age_ms
        return age is not None and age <= 5000

    def get_meta(self) -> MetaResponse:
        """Produce engine capability declaration for client negotiation."""
        mode = SourceMode.DEMO if self.settings.is_simulated else SourceMode.LIVE
        caps = getattr(
            self.source,
            "capabilities",
            Capabilities(
                per_process_io=False,
                connection_owner=False,
                ai_advisor=self.settings.ai_enabled,
                scenarios=self.settings.is_simulated,
            ),
        )
        return MetaResponse(
            version=__version__,
            mode=mode,
            tick_ms=self.settings.tick_ms,
            capabilities=caps,
            limits=MetaLimits(max_nodes=2000),
        )

    async def start(self) -> None:
        """Initialize background tick task."""
        if self._running:
            return
        self._running = True
        self._tick_task = asyncio.create_task(self._tick_loop(), name="appflow-tick-loop")
        _log.info("stream_hub_started", tick_ms=self.settings.tick_ms)

    async def stop(self) -> None:
        """Cleanly cancel tick loop and drain connected clients."""
        self._running = False
        if self._tick_task and not self._tick_task.done():
            self._tick_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._tick_task
        self._tick_task = None

        async with self._lock:
            self._clients.clear()
        _log.info("stream_hub_stopped")

    async def register_client(self, session: ClientSession) -> None:
        """Register a newly accepted WebSocket client session."""
        async with self._lock:
            self._clients[session.client_id] = session
        _log.info("ws_client_registered", client_id=session.client_id, total=len(self._clients))

    async def unregister_client(self, client_id: str) -> None:
        """Remove a disconnected client from the hub."""
        async with self._lock:
            self._clients.pop(client_id, None)
        _log.info("ws_client_unregistered", client_id=client_id, total=len(self._clients))

    def handle_subscribe(self, client_id: str, payload: SubscribePayload) -> None:
        """Apply initial subscription filters and enqueue initial baseline snapshot."""
        session = self._clients.get(client_id)
        if not session:
            return

        session.filters = payload.filters
        curr_graph = self.aggregator.latest_graph
        filtered_graph = self.aggregator.filter_graph(
            curr_graph,
            kinds=session.filters.kinds,
            min_rps=session.filters.min_rps,
            group=session.filters.group,
        )

        session.last_sent_seq = 1
        session.last_sent_graph = filtered_graph

        snapshot_msg = ServerSnapshotMessage(
            seq=session.last_sent_seq,
            payload=SnapshotPayload(graph=filtered_graph),
        )
        self._enqueue_client_message(session, snapshot_msg)

    def handle_update_filters(self, client_id: str, payload: UpdateFiltersPayload) -> None:
        """Update stream filters and send an updated snapshot."""
        session = self._clients.get(client_id)
        if not session:
            return

        session.filters = payload.filters
        curr_graph = self.aggregator.latest_graph
        filtered_graph = self.aggregator.filter_graph(
            curr_graph,
            kinds=session.filters.kinds,
            min_rps=session.filters.min_rps,
            group=session.filters.group,
        )

        session.last_sent_seq += 1
        session.last_sent_graph = filtered_graph

        snapshot_msg = ServerSnapshotMessage(
            seq=session.last_sent_seq,
            payload=SnapshotPayload(graph=filtered_graph),
        )
        self._enqueue_client_message(session, snapshot_msg)

    def handle_pause(self, client_id: str) -> None:
        """Suspend streaming updates when client tab becomes hidden."""
        session = self._clients.get(client_id)
        if session:
            session.is_paused = True

    def handle_resume(self, client_id: str) -> None:
        """Resume stream and deliver a catch-up snapshot."""
        session = self._clients.get(client_id)
        if not session:
            return

        session.is_paused = False
        curr_graph = self.aggregator.latest_graph
        filtered_graph = self.aggregator.filter_graph(
            curr_graph,
            kinds=session.filters.kinds,
            min_rps=session.filters.min_rps,
            group=session.filters.group,
        )

        session.last_sent_seq += 1
        session.last_sent_graph = filtered_graph

        snapshot_msg = ServerSnapshotMessage(
            seq=session.last_sent_seq,
            payload=SnapshotPayload(graph=filtered_graph),
        )
        self._enqueue_client_message(session, snapshot_msg)

    def handle_resync(self, client_id: str, payload: ResyncPayload) -> None:
        """Client recovery request after sequence gap or reconnect."""
        session = self._clients.get(client_id)
        if not session:
            return

        curr_graph = self.aggregator.latest_graph
        filtered_graph = self.aggregator.filter_graph(
            curr_graph,
            kinds=session.filters.kinds,
            min_rps=session.filters.min_rps,
            group=session.filters.group,
        )

        session.last_sent_seq += 1
        session.last_sent_graph = filtered_graph

        snapshot_msg = ServerSnapshotMessage(
            seq=session.last_sent_seq,
            payload=SnapshotPayload(graph=filtered_graph),
        )
        self._enqueue_client_message(session, snapshot_msg)

    def handle_ping(self, client_id: str) -> None:
        """Respond to client ping with an immediate heartbeat."""
        session = self._clients.get(client_id)
        if not session:
            return

        hb = ServerHeartbeatMessage(payload=HeartbeatPayload(tick_age_ms=self.tick_age_ms or 0))
        self._enqueue_client_message(session, hb)

    def _enqueue_client_message(self, session: ClientSession, msg: ServerMessage) -> None:
        """Enqueue message with non-blocking backpressure.

        On QueueFull, immediately drains the queue and pushes a fresh snapshot, preventing
        slow clients from stalling the engine or other connections.
        """
        try:
            session.queue.put_nowait(msg)
        except asyncio.QueueFull:
            # Drain queue immediately
            while not session.queue.empty():
                try:
                    session.queue.get_nowait()
                except asyncio.QueueEmpty:
                    break

            # Enqueue fresh snapshot to allow slow consumer to catch up
            curr_graph = self.aggregator.latest_graph
            filtered_graph = self.aggregator.filter_graph(
                curr_graph,
                kinds=session.filters.kinds,
                min_rps=session.filters.min_rps,
                group=session.filters.group,
            )

            session.last_sent_seq += 1
            session.last_sent_graph = filtered_graph

            snapshot_msg = ServerSnapshotMessage(
                seq=session.last_sent_seq,
                payload=SnapshotPayload(graph=filtered_graph),
            )
            with contextlib.suppress(asyncio.QueueFull):
                session.queue.put_nowait(snapshot_msg)

    async def _tick_loop(self) -> None:
        """Single tick task sampling telemetry, computing diffs and broadcasting."""
        interval_s = max(0.05, self.settings.tick_ms / 1000.0)
        self._last_snapshot_time = time.monotonic()
        self._last_heartbeat_time = time.monotonic()

        while self._running:
            start_time = time.monotonic()
            try:
                # 1. Acquire raw telemetry sample from source
                raw_sample = await self.source.sample()
                self._last_tick_monotonic = time.monotonic()

                # 2. Aggregate into TopologyGraph
                curr_graph, health_events = self.aggregator.process_sample(raw_sample)

                # 3. Check for simulation scenario transitions
                active_scenario = getattr(self.source, "active_scenario", None)
                if active_scenario != self._last_scenario:
                    self._last_scenario = active_scenario
                    scen_msg = ServerScenarioMessage(
                        payload=ScenarioPayload(active=active_scenario)
                    )
                    async with self._lock:
                        for s in self._clients.values():
                            if not s.is_paused:
                                self._enqueue_client_message(s, scen_msg)

                # 4. Broadcast health transition events
                if health_events:
                    async with self._lock:
                        for s in self._clients.values():
                            if not s.is_paused:
                                for event in health_events:
                                    evt_msg = ServerHealthEventMessage(payload=event)
                                    self._enqueue_client_message(s, evt_msg)

                # 5. Check periodic snapshot condition (every snapshot_every_s)
                now = time.monotonic()
                is_periodic_snapshot = (
                    now - self._last_snapshot_time
                ) >= self.settings.snapshot_every_s

                if is_periodic_snapshot:
                    self._last_snapshot_time = now
                    async with self._lock:
                        for s in self._clients.values():
                            if s.is_paused or s.last_sent_seq == 0:
                                continue
                            filtered_curr = self.aggregator.filter_graph(
                                curr_graph,
                                kinds=s.filters.kinds,
                                min_rps=s.filters.min_rps,
                                group=s.filters.group,
                            )
                            s.last_sent_seq += 1
                            s.last_sent_graph = filtered_curr
                            snap_msg = ServerSnapshotMessage(
                                seq=s.last_sent_seq,
                                payload=SnapshotPayload(graph=filtered_curr),
                            )
                            self._enqueue_client_message(s, snap_msg)
                else:
                    # 6. Diff and broadcast delta to subscribed clients
                    async with self._lock:
                        for s in self._clients.values():
                            if s.is_paused or s.last_sent_seq == 0:
                                continue

                            filtered_curr = self.aggregator.filter_graph(
                                curr_graph,
                                kinds=s.filters.kinds,
                                min_rps=s.filters.min_rps,
                                group=s.filters.group,
                            )
                            filtered_prev = s.last_sent_graph or TopologyGraph()

                            delta_payload = self.diff_engine.diff(
                                prev_graph=filtered_prev,
                                curr_graph=filtered_curr,
                                base_seq=s.last_sent_seq,
                            )

                            if delta_payload is not None:
                                s.last_sent_seq += 1
                                s.last_sent_graph = filtered_curr
                                delta_msg = ServerDeltaMessage(
                                    seq=s.last_sent_seq,
                                    payload=delta_payload,
                                )
                                self._enqueue_client_message(s, delta_msg)

                self._prev_graph = curr_graph

                # 7. Check periodic heartbeat (every 15s)
                if (now - self._last_heartbeat_time) >= HEARTBEAT_INTERVAL_S:
                    self._last_heartbeat_time = now
                    hb_msg = ServerHeartbeatMessage(
                        payload=HeartbeatPayload(tick_age_ms=self.tick_age_ms or 0)
                    )
                    async with self._lock:
                        for s in self._clients.values():
                            self._enqueue_client_message(s, hb_msg)

            except asyncio.CancelledError:
                break
            except Exception as e:
                _log.error("stream_hub_tick_error", error=str(e), exc_info=True)

            elapsed = time.monotonic() - start_time
            sleep_time = max(0.001, interval_s - elapsed)
            try:
                await asyncio.sleep(sleep_time)
            except asyncio.CancelledError:
                break
