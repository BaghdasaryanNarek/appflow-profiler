"""WebSocket envelope, message types, and discriminated unions (Master Plan §4.5)."""

from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from appflow.domain.enums import HealthStatus, NodeKind
from appflow.domain.models import (
    Edge,
    EdgeMetrics,
    MetaResponse,
    Node,
    NodeMetrics,
    ScenarioInfo,
    TopologyGraph,
)

FROZEN_MODEL_CONFIG = ConfigDict(frozen=True, extra="forbid", populate_by_name=True)


# ---------------------------------------------------------------------------
# Common payloads and patches
# ---------------------------------------------------------------------------


class EmptyPayload(BaseModel):
    """Payload for parameterless signal messages (pause, resume, ping)."""

    model_config = FROZEN_MODEL_CONFIG


class NodePatch(BaseModel):
    """Sparse differential update for an existing node."""

    model_config = FROZEN_MODEL_CONFIG

    id: str
    health: HealthStatus | None = None
    health_reasons: list[str] | None = None
    metrics: NodeMetrics | None = None


class EdgePatch(BaseModel):
    """Sparse differential update for an existing edge."""

    model_config = FROZEN_MODEL_CONFIG

    id: str
    health: HealthStatus | None = None
    metrics: EdgeMetrics | None = None


class TopologyFilters(BaseModel):
    """Subscription filtering criteria."""

    model_config = FROZEN_MODEL_CONFIG

    kinds: list[NodeKind] | None = None
    min_rps: Annotated[float | None, Field(default=None, ge=0.0)] = None
    group: str | None = None


# ---------------------------------------------------------------------------
# Server -> Client Payloads
# ---------------------------------------------------------------------------


class HelloPayload(BaseModel):
    """Initial capability and metadata payload on connection accept."""

    model_config = FROZEN_MODEL_CONFIG

    meta: MetaResponse
    server_time: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SnapshotPayload(BaseModel):
    """Full baseline topology graph payload."""

    model_config = FROZEN_MODEL_CONFIG

    graph: TopologyGraph


class DeltaPayload(BaseModel):
    """Incremental topology diff payload applied over base_seq."""

    model_config = FROZEN_MODEL_CONFIG

    base_seq: Annotated[int, Field(ge=0, description="Sequence delta builds upon")]
    added_nodes: list[Node] = Field(default_factory=list)
    updated_nodes: list[NodePatch] = Field(default_factory=list)
    removed_node_ids: list[str] = Field(default_factory=list)
    added_edges: list[Edge] = Field(default_factory=list)
    updated_edges: list[EdgePatch] = Field(default_factory=list)
    removed_edge_ids: list[str] = Field(default_factory=list)


class HealthEventPayload(BaseModel):
    """Entity health status transition notification for screen-reader live announcements."""

    model_config = FROZEN_MODEL_CONFIG

    entity_id: str
    from_status: Annotated[HealthStatus, Field(alias="from")]
    to_status: Annotated[HealthStatus, Field(alias="to")]
    reasons: list[str] = Field(default_factory=list)


class ScenarioPayload(BaseModel):
    """Simulation scenario activation or deactivation event."""

    model_config = FROZEN_MODEL_CONFIG

    active: ScenarioInfo | None = None


class HeartbeatPayload(BaseModel):
    """Server liveness heartbeat."""

    model_config = FROZEN_MODEL_CONFIG

    tick_age_ms: Annotated[int, Field(ge=0, description="Age of latest engine sample in ms")]


class ErrorPayload(BaseModel):
    """Protocol-level error notification."""

    model_config = FROZEN_MODEL_CONFIG

    code: str
    title: str
    detail: str


# ---------------------------------------------------------------------------
# Client -> Server Payloads
# ---------------------------------------------------------------------------


class SubscribePayload(BaseModel):
    """Subscription parameters specifying stream filters."""

    model_config = FROZEN_MODEL_CONFIG

    filters: TopologyFilters = Field(default_factory=TopologyFilters)


class UpdateFiltersPayload(BaseModel):
    """Update active stream filters."""

    model_config = FROZEN_MODEL_CONFIG

    filters: TopologyFilters = Field(default_factory=TopologyFilters)


class ResyncPayload(BaseModel):
    """Client recovery request after sequence gap or disconnect."""

    model_config = FROZEN_MODEL_CONFIG

    last_seq: Annotated[int | None, Field(default=None, ge=0)] = None


# ---------------------------------------------------------------------------
# Server Messages (Envelope + Typed Payloads)
# ---------------------------------------------------------------------------


class ServerHelloMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["hello"] = "hello"
    payload: HelloPayload
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ServerSnapshotMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["snapshot"] = "snapshot"
    seq: Annotated[int, Field(ge=0)]
    payload: SnapshotPayload
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ServerDeltaMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["delta"] = "delta"
    seq: Annotated[int, Field(ge=0)]
    payload: DeltaPayload
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ServerHealthEventMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["health_event"] = "health_event"
    payload: HealthEventPayload
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ServerScenarioMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["scenario"] = "scenario"
    payload: ScenarioPayload
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ServerHeartbeatMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["heartbeat"] = "heartbeat"
    payload: HeartbeatPayload
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ServerErrorMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["error"] = "error"
    payload: ErrorPayload
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Client Messages (Envelope + Typed Payloads)
# ---------------------------------------------------------------------------


class ClientSubscribeMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["subscribe"] = "subscribe"
    payload: SubscribePayload = Field(default_factory=SubscribePayload)
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ClientUpdateFiltersMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["update_filters"] = "update_filters"
    payload: UpdateFiltersPayload = Field(default_factory=UpdateFiltersPayload)
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ClientPauseMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["pause"] = "pause"
    payload: EmptyPayload = Field(default_factory=EmptyPayload)
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ClientResumeMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["resume"] = "resume"
    payload: EmptyPayload = Field(default_factory=EmptyPayload)
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ClientResyncMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["resync"] = "resync"
    payload: ResyncPayload = Field(default_factory=ResyncPayload)
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


class ClientPingMessage(BaseModel):
    model_config = FROZEN_MODEL_CONFIG

    v: Literal[1] = 1
    type: Literal["ping"] = "ping"
    payload: EmptyPayload = Field(default_factory=EmptyPayload)
    seq: int | None = None
    ts: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Discriminated Unions
# ---------------------------------------------------------------------------

ServerMessage = Annotated[
    ServerHelloMessage
    | ServerSnapshotMessage
    | ServerDeltaMessage
    | ServerHealthEventMessage
    | ServerScenarioMessage
    | ServerHeartbeatMessage
    | ServerErrorMessage,
    Field(discriminator="type"),
]

ClientMessage = Annotated[
    ClientSubscribeMessage
    | ClientUpdateFiltersMessage
    | ClientPauseMessage
    | ClientResumeMessage
    | ClientResyncMessage
    | ClientPingMessage,
    Field(discriminator="type"),
]

WSMessage = Annotated[ServerMessage | ClientMessage, Field(discriminator="type")]


# ---------------------------------------------------------------------------
# Adapter Helpers
# ---------------------------------------------------------------------------


class ServerMessageAdapter(BaseModel):
    """Helper wrapper for parsing any server message using discriminated union."""

    model_config = FROZEN_MODEL_CONFIG
    message: ServerMessage


class ClientMessageAdapter(BaseModel):
    """Helper wrapper for parsing any client message using discriminated union."""

    model_config = FROZEN_MODEL_CONFIG
    message: ClientMessage


def parse_server_message(data: Any) -> ServerMessage:
    """Parse raw JSON dict or object into a typed ServerMessage."""
    adapter = ServerMessageAdapter.model_validate({"message": data})
    return adapter.message


def parse_client_message(data: Any) -> ClientMessage:
    """Parse raw JSON dict or object into a typed ClientMessage."""
    adapter = ClientMessageAdapter.model_validate({"message": data})
    return adapter.message
