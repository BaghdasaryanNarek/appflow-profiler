"""TopologySource abstraction protocol and raw collector sample models (Master Plan §4 & §5.1)."""

from datetime import UTC, datetime
from typing import Annotated, runtime_checkable
from typing import Protocol as TypingProtocol

from pydantic import BaseModel, ConfigDict, Field

from appflow.domain.enums import ConnState, MetricQuality, Protocol
from appflow.domain.models import Capabilities

FROZEN_MODEL_CONFIG = ConfigDict(frozen=True, extra="forbid")


class RawConnection(BaseModel):
    """Raw network connection observation from OS socket tables or simulation."""

    model_config = FROZEN_MODEL_CONFIG

    laddr_ip: str
    laddr_port: Annotated[int, Field(ge=0, le=65535)]
    status: ConnState
    protocol: Protocol
    raddr_ip: str | None = None
    raddr_port: Annotated[int | None, Field(default=None, ge=0, le=65535)] = None
    pid: Annotated[int | None, Field(default=None, ge=0)] = None
    fd: int | None = None


class RawProcessSample(BaseModel):
    """Raw process state and resource utilization sample."""

    model_config = FROZEN_MODEL_CONFIG

    pid: Annotated[int, Field(ge=0)]
    name: str
    cmdline_sanitized: str
    create_time: Annotated[float, Field(ge=0.0)]
    cpu_percent: Annotated[float, Field(ge=0.0)]
    rss_bytes: Annotated[int, Field(ge=0)]
    ppid: Annotated[int | None, Field(default=None, ge=0)] = None
    username: str | None = None
    num_threads: Annotated[int | None, Field(default=None, ge=0)] = None
    io_bytes_per_sec: Annotated[float | None, Field(default=None, ge=0.0)] = None
    open_connections: Annotated[int, Field(default=0, ge=0)] = 0


class RawSample(BaseModel):
    """Aggregate raw telemetry sample produced at each engine tick."""

    model_config = FROZEN_MODEL_CONFIG

    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    connections: list[RawConnection] = Field(default_factory=list)
    processes: dict[int, RawProcessSample] = Field(default_factory=dict)
    quality: MetricQuality = MetricQuality.MEASURED


@runtime_checkable
class TopologySource(TypingProtocol):
    """Protocol for topology providers (Live psutil collector or simulation engine)."""

    async def start(self) -> None:
        """Initialize telemetry acquisition (e.g. baseline counters)."""
        ...

    async def sample(self) -> RawSample:
        """Sample host OS or simulation state for the current tick."""
        ...

    async def stop(self) -> None:
        """Release background tasks and active resources."""
        ...

    @property
    def capabilities(self) -> Capabilities:
        """Declare telemetry fidelity and feature support."""
        ...
