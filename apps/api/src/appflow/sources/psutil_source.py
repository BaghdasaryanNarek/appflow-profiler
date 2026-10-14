"""Live OS topology telemetry collector powered by psutil (Master Plan §4 & §5.1)."""

import asyncio
import socket
import time
from collections import defaultdict
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

import psutil

if TYPE_CHECKING:
    from collections.abc import Sequence

from appflow.domain.enums import ConnState, MetricQuality, Protocol
from appflow.domain.models import Capabilities
from appflow.logging import get_logger
from appflow.sources.base import (
    RawConnection,
    RawProcessSample,
    RawSample,
    TopologySource,
)
from appflow.sources.sanitize import sanitize_cmdline

_log = get_logger(__name__)


def _map_conn_state(status_str: str) -> ConnState:
    """Map psutil socket status string to ConnState enum with safe fallback."""
    try:
        return ConnState(status_str)
    except ValueError:
        return ConnState.NONE


def _map_socket_protocol(sock_type: int) -> Protocol:
    """Map BSD socket type constant to Protocol enum."""
    if sock_type == socket.SOCK_DGRAM:
        return Protocol.UDP
    return Protocol.TCP


class PsutilSource(TopologySource):
    """Live telemetry source acquiring host processes and sockets via psutil."""

    def __init__(self) -> None:
        self._connection_owner: bool = True
        self._per_process_io: bool = True
        self._last_sample_time: float = 0.0
        self._prev_io: dict[int, tuple[float, int]] = {}
        self._started: bool = False

    @property
    def capabilities(self) -> Capabilities:
        return Capabilities(
            per_process_io=self._per_process_io,
            connection_owner=self._connection_owner,
            ai_advisor=False,
            scenarios=False,
        )

    async def start(self) -> None:
        """Prime process CPU and IO counters to prepare baseline for deltas."""
        self._last_sample_time = time.monotonic()
        self._prev_io.clear()
        self._started = True
        # Prime psutil process CPU and IO state in worker thread
        await asyncio.to_thread(self._prime_sync)

    def _prime_sync(self) -> None:
        """Non-blocking prime pass over process table."""
        now = time.monotonic()
        for proc in psutil.process_iter():
            try:
                proc.cpu_percent(interval=None)
                io = proc.io_counters()
                self._prev_io[proc.pid] = (now, io.read_bytes + io.write_bytes)
            except (
                psutil.NoSuchProcess,
                psutil.AccessDenied,
                psutil.ZombieProcess,
                AttributeError,
            ):
                continue

    async def stop(self) -> None:
        """Release state references."""
        self._prev_io.clear()
        self._started = False

    async def sample(self) -> RawSample:
        """Asynchronously sample live host sockets and processes without blocking event loop."""
        return await asyncio.to_thread(self._collect_sync)

    def _collect_connections(self) -> tuple[list[RawConnection], dict[int, int]]:
        """Enumerate active inet sockets with graceful degradation on AccessDenied."""
        raw_conns: list[RawConnection] = []
        open_connections_per_pid: dict[int, int] = defaultdict(int)

        raw_psutil_conns: list[Any]
        try:
            raw_psutil_conns = list(psutil.net_connections(kind="inet"))
            self._connection_owner = True
        except psutil.AccessDenied:
            # Running unprivileged: global inspection blocked.
            # Fall back to per-process connection inspection where permitted.
            self._connection_owner = False
            raw_psutil_conns = []
            for proc in psutil.process_iter():
                try:
                    p_conns = proc.net_connections(kind="inet")
                    raw_psutil_conns.extend(p_conns)
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    continue

        for conn in raw_psutil_conns:
            laddr_ip = conn.laddr.ip if conn.laddr else "0.0.0.0"
            laddr_port = conn.laddr.port if conn.laddr else 0
            raddr_ip = conn.raddr.ip if conn.raddr else None
            raddr_port = conn.raddr.port if conn.raddr else None
            status = _map_conn_state(conn.status)
            protocol = _map_socket_protocol(conn.type)
            pid = conn.pid
            fd = getattr(conn, "fd", None)

            if pid is not None:
                open_connections_per_pid[pid] += 1

            raw_conns.append(
                RawConnection(
                    laddr_ip=laddr_ip,
                    laddr_port=laddr_port,
                    status=status,
                    protocol=protocol,
                    raddr_ip=raddr_ip,
                    raddr_port=raddr_port,
                    pid=pid,
                    fd=fd if isinstance(fd, int) and fd >= 0 else None,
                )
            )

        return raw_conns, open_connections_per_pid

    def _collect_sync(self) -> RawSample:
        """Synchronous sampling routine executed in asyncio.to_thread."""
        now = time.monotonic()
        raw_conns, open_conns_per_pid = self._collect_connections()

        processes: dict[int, RawProcessSample] = {}
        current_io: dict[int, tuple[float, int]] = {}
        supported_io_observed = False

        for proc in psutil.process_iter():
            try:
                pid = proc.pid
                name = proc.name()

                # PPID, username, thread count
                try:
                    ppid = proc.ppid()
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    ppid = None

                try:
                    username = proc.username()
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    username = None

                try:
                    num_threads = proc.num_threads()
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    num_threads = None

                # Create time and memory
                create_time = proc.create_time()
                mem = proc.memory_info()
                rss_bytes = mem.rss
                cpu_percent = proc.cpu_percent(interval=None)

                # Command line sanitization
                try:
                    raw_cmdline: Sequence[str] = proc.cmdline()
                    cmdline_sanitized = sanitize_cmdline(raw_cmdline) or name
                except (psutil.AccessDenied, psutil.NoSuchProcess):
                    cmdline_sanitized = name

                # IO throughput estimation
                io_bytes_per_sec: float | None = None
                try:
                    io = proc.io_counters()
                    total_io = io.read_bytes + io.write_bytes
                    current_io[pid] = (now, total_io)
                    supported_io_observed = True

                    if pid in self._prev_io:
                        prev_time, prev_bytes = self._prev_io[pid]
                        dt = max(now - prev_time, 0.001)
                        if total_io >= prev_bytes:
                            io_bytes_per_sec = float(total_io - prev_bytes) / dt
                        else:
                            io_bytes_per_sec = 0.0
                    else:
                        io_bytes_per_sec = 0.0
                except (psutil.AccessDenied, psutil.NoSuchProcess, AttributeError):
                    io_bytes_per_sec = None

                processes[pid] = RawProcessSample(
                    pid=pid,
                    name=name,
                    cmdline_sanitized=cmdline_sanitized,
                    create_time=create_time,
                    cpu_percent=cpu_percent,
                    rss_bytes=rss_bytes,
                    ppid=ppid,
                    username=username,
                    num_threads=num_threads,
                    io_bytes_per_sec=io_bytes_per_sec,
                    open_connections=open_conns_per_pid.get(pid, 0),
                )
            except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                continue

        self._prev_io = current_io
        if not supported_io_observed and not self._prev_io:
            self._per_process_io = False

        return RawSample(
            timestamp=datetime.now(UTC),
            connections=raw_conns,
            processes=processes,
            quality=MetricQuality.ESTIMATED,
        )
