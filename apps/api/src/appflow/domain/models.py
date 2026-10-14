"""Pydantic v2 domain models for AppFlow Profiler (Master Plan §4.3 & §4.4)."""

from datetime import UTC, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from appflow.domain.enums import (
    ConnState,
    HealthStatus,
    MetricQuality,
    NodeKind,
    Protocol,
    SourceMode,
)

FROZEN_MODEL_CONFIG = ConfigDict(frozen=True, extra="forbid")


class NodeMetrics(BaseModel):
    """Aggregate runtime performance metrics for a node."""

    model_config = FROZEN_MODEL_CONFIG

    rps: Annotated[float, Field(ge=0.0, description="Requests per second")]
    p50_ms: Annotated[float, Field(ge=0.0, description="50th percentile latency in milliseconds")]
    p99_ms: Annotated[float, Field(ge=0.0, description="99th percentile latency in milliseconds")]
    error_rate: Annotated[float, Field(ge=0.0, le=1.0, description="Fraction of requests failing")]
    saturation: Annotated[
        float, Field(ge=0.0, le=1.0, description="Capacity utilization ratio [0.0, 1.0]")
    ]
    cpu_percent: Annotated[float, Field(ge=0.0, description="CPU usage across cores")]
    rss_bytes: Annotated[int, Field(ge=0, description="Resident memory size in bytes")]
    open_connections: Annotated[int, Field(ge=0, description="Total active socket handles")]
    quality: Annotated[MetricQuality, Field(description="Telemetry fidelity indicator")]


class ProcessInfo(BaseModel):
    """Host process telemetry metadata."""

    model_config = FROZEN_MODEL_CONFIG

    pid: Annotated[int, Field(ge=0, description="Process identifier")]
    name: Annotated[str, Field(description="Process executable name")]
    cmdline_sanitized: Annotated[str, Field(description="Redacted command line invocation")]
    create_time: Annotated[float, Field(ge=0.0, description="Process start epoch in seconds")]
    ppid: int | None = Field(default=None, ge=0, description="Parent process identifier")
    username: str | None = Field(default=None, description="Operating system username")
    num_threads: int | None = Field(default=None, ge=0, description="Active thread count")


class Node(BaseModel):
    """Graph vertex representing a service, process, datastore or external boundary."""

    model_config = FROZEN_MODEL_CONFIG

    id: Annotated[str, Field(description="Deterministic entity identifier")]
    kind: Annotated[NodeKind, Field(description="Node structural role")]
    label: Annotated[str, Field(max_length=64, description="Display label")]
    health: Annotated[HealthStatus, Field(description="Derived health assessment")]
    metrics: Annotated[NodeMetrics, Field(description="Observed or estimated performance metrics")]
    group_id: str | None = Field(default=None, description="Parent service group identifier")
    health_reasons: list[str] = Field(
        default_factory=list, description="Threshold violations explaining health"
    )
    process: ProcessInfo | None = Field(default=None, description="OS process metadata if known")
    tags: dict[str, str] = Field(
        default_factory=dict, description="Arbitrary service categorization"
    )


class EdgeMetrics(BaseModel):
    """Traffic and socket state breakdown for a directed communication edge."""

    model_config = FROZEN_MODEL_CONFIG

    rps: Annotated[float, Field(ge=0.0, description="Requests per second flowing across edge")]
    bytes_per_sec: Annotated[float, Field(ge=0.0, description="Byte throughput rate")]
    p99_ms: Annotated[float, Field(ge=0.0, description="99th percentile round-trip latency in ms")]
    error_rate: Annotated[float, Field(ge=0.0, le=1.0, description="Edge communication error rate")]
    connection_count: Annotated[int, Field(ge=0, description="Observed concurrent socket count")]
    quality: Annotated[MetricQuality, Field(description="Telemetry fidelity indicator")]
    state_breakdown: dict[ConnState, int] = Field(
        default_factory=dict, description="Sockets per TCP state"
    )
    retry_rate: float = Field(default=0.0, ge=0.0, le=1.0, description="Retry amplification ratio")


class Edge(BaseModel):
    """Directed connection between two topology nodes."""

    model_config = FROZEN_MODEL_CONFIG

    id: Annotated[str, Field(description="Deterministic edge identifier")]
    source: Annotated[str, Field(description="Source node ID")]
    target: Annotated[str, Field(description="Target node ID")]
    protocol: Annotated[Protocol, Field(description="Observed protocol")]
    health: Annotated[HealthStatus, Field(description="Derived edge health status")]
    metrics: Annotated[EdgeMetrics, Field(description="Communication telemetry")]


class TopologyGraph(BaseModel):
    """Full snapshot of the network topology graph at a point in time."""

    model_config = FROZEN_MODEL_CONFIG

    nodes: list[Node] = Field(default_factory=list)
    edges: list[Edge] = Field(default_factory=list)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class TopologySummary(BaseModel):
    """Compact SSR payload for instant LCP paint (Master Plan §4.3)."""

    model_config = FROZEN_MODEL_CONFIG

    mode: Annotated[SourceMode, Field(description="Runtime data origin")]
    node_count: Annotated[int, Field(ge=0, description="Total active nodes")]
    edge_count: Annotated[int, Field(ge=0, description="Total active edges")]
    total_rps: Annotated[float, Field(ge=0.0, description="Total request throughput")]
    global_p99_ms: Annotated[float, Field(ge=0.0, description="Global 99th percentile latency")]
    global_error_rate: Annotated[
        float, Field(ge=0.0, le=1.0, description="Fleet-wide error fraction")
    ]
    critical_count: Annotated[int, Field(ge=0, description="Count of critical entities")]
    degraded_count: Annotated[int, Field(ge=0, description="Count of degraded entities")]
    active_scenario: str | None = Field(default=None, description="Active simulation scenario name")
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SocketInfo(BaseModel):
    """Granular TCP socket representation."""

    model_config = FROZEN_MODEL_CONFIG

    local_addr: str
    local_port: Annotated[int, Field(ge=0, le=65535)]
    state: ConnState
    protocol: Protocol
    remote_addr: str | None = None
    remote_port: int | None = Field(default=None, ge=0, le=65535)
    pid: int | None = Field(default=None, ge=0)


class NeighbourRef(BaseModel):
    """Adjacent node metadata reference for fast topology traversal."""

    model_config = FROZEN_MODEL_CONFIG

    node_id: str
    label: str
    kind: NodeKind
    health: HealthStatus
    edge_id: str
    protocol: Protocol
    rps: Annotated[float, Field(ge=0.0)]


class NodeNeighbours(BaseModel):
    """Directed neighbours of an entity."""

    model_config = FROZEN_MODEL_CONFIG

    up: list[NeighbourRef] = Field(default_factory=list)
    down: list[NeighbourRef] = Field(default_factory=list)


class NodeDetail(BaseModel):
    """Deep technical disclosure payload for an inspected node (Level 2)."""

    model_config = FROZEN_MODEL_CONFIG

    node: Node
    sockets: list[SocketInfo] = Field(default_factory=list)
    history: dict[str, list[float]] = Field(
        default_factory=dict, description="Ring-buffer sparkline series"
    )
    neighbours: NodeNeighbours = Field(default_factory=NodeNeighbours)


class EdgeDetail(BaseModel):
    """Deep technical disclosure payload for an inspected edge."""

    model_config = FROZEN_MODEL_CONFIG

    edge: Edge
    history: dict[str, list[float]] = Field(
        default_factory=dict, description="Ring-buffer sparkline series"
    )


class ScenarioInfo(BaseModel):
    """Simulation scenario descriptor."""

    model_config = FROZEN_MODEL_CONFIG

    id: str
    name: str
    description: str
    duration_s: Annotated[int, Field(ge=0)]
    active: bool


class Capabilities(BaseModel):
    """Runtime engine capability flags."""

    model_config = FROZEN_MODEL_CONFIG

    per_process_io: bool
    connection_owner: bool
    ai_advisor: bool
    scenarios: bool


class MetaLimits(BaseModel):
    """Configured operational limits."""

    model_config = FROZEN_MODEL_CONFIG

    max_nodes: Annotated[int, Field(ge=1)]


class MetaResponse(BaseModel):
    """Engine metadata and capability negotiation payload."""

    model_config = FROZEN_MODEL_CONFIG

    version: str
    mode: SourceMode
    tick_ms: Annotated[int, Field(ge=1)]
    capabilities: Capabilities
    limits: MetaLimits
