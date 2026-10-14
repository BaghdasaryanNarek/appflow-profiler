"""Domain enumerations for the AppFlow Profiler topology model."""

from enum import StrEnum


class NodeKind(StrEnum):
    """Categorical classification of topology nodes."""

    SERVICE = "service"
    PROCESS = "process"
    DATASTORE = "datastore"
    CACHE = "cache"
    QUEUE = "queue"
    GATEWAY = "gateway"
    EXTERNAL = "external"
    CLIENT = "client"


class HealthStatus(StrEnum):
    """Observable operational health of an entity."""

    HEALTHY = "healthy"
    DEGRADED = "degraded"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


class Protocol(StrEnum):
    """Transport and application-layer protocols observed on edges."""

    TCP = "tcp"
    UDP = "udp"
    HTTP = "http"
    GRPC = "grpc"
    PG = "pg"
    REDIS = "redis"
    KAFKA = "kafka"


class ConnState(StrEnum):
    """TCP socket connection lifecycle states."""

    ESTABLISHED = "ESTABLISHED"
    SYN_SENT = "SYN_SENT"
    SYN_RECV = "SYN_RECV"
    FIN_WAIT1 = "FIN_WAIT1"
    FIN_WAIT2 = "FIN_WAIT2"
    TIME_WAIT = "TIME_WAIT"
    CLOSE = "CLOSE"
    CLOSE_WAIT = "CLOSE_WAIT"
    LAST_ACK = "LAST_ACK"
    LISTEN = "LISTEN"
    CLOSING = "CLOSING"
    NONE = "NONE"


class SourceMode(StrEnum):
    """Origin of topology telemetry."""

    LIVE = "live"
    DEMO = "demo"


class MetricQuality(StrEnum):
    """Telemetry fidelity indicator transparently surfaced in UI."""

    MEASURED = "measured"
    ESTIMATED = "estimated"
    SIMULATED = "simulated"
