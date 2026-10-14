"""Unit tests for PsutilSource live collector with mocked process tables (Master Plan §4 & §5.1)."""

import socket
from collections import namedtuple
from typing import Any
from unittest.mock import MagicMock

import psutil
import pytest

from appflow.domain.enums import ConnState, MetricQuality, Protocol
from appflow.sources.psutil_source import PsutilSource, _map_conn_state, _map_socket_protocol

MockAddr = namedtuple("MockAddr", ["ip", "port"])
MockPConn = namedtuple("MockPConn", ["fd", "family", "type", "laddr", "raddr", "status", "pid"])
MockMem = namedtuple("MockMem", ["rss", "vms"])
MockIO = namedtuple("MockIO", ["read_bytes", "write_bytes"])


def _build_mock_process(
    pid: int,
    name: str = "test_proc",
    cmdline: list[str] | None = None,
    cpu: float = 12.5,
    rss: int = 1024 * 1024 * 64,
    ppid: int = 1,
    username: str = "appuser",
    num_threads: int = 4,
    create_time: float = 1700000000.0,
    io_bytes: tuple[int, int] | None = (1000, 2000),
    net_conns: list[Any] | None = None,
) -> MagicMock:
    proc = MagicMock()
    proc.pid = pid
    proc.name.return_value = name
    proc.cmdline.return_value = cmdline or [name]
    proc.cpu_percent.return_value = cpu
    proc.memory_info.return_value = MockMem(rss=rss, vms=rss * 2)
    proc.ppid.return_value = ppid
    proc.username.return_value = username
    proc.num_threads.return_value = num_threads
    proc.create_time.return_value = create_time

    if io_bytes is not None:
        proc.io_counters.return_value = MockIO(read_bytes=io_bytes[0], write_bytes=io_bytes[1])
    else:
        proc.io_counters.side_effect = AttributeError("io_counters not supported")

    if net_conns is not None:
        proc.net_connections.return_value = net_conns
    else:
        proc.net_connections.return_value = []

    return proc


@pytest.mark.asyncio
async def test_psutil_source_normal_collection(monkeypatch: pytest.MonkeyPatch) -> None:
    source = PsutilSource()
    await source.start()

    mock_conn = MockPConn(
        fd=5,
        family=socket.AF_INET,
        type=socket.SOCK_STREAM,
        laddr=MockAddr(ip="127.0.0.1", port=8080),
        raddr=MockAddr(ip="10.0.0.1", port=45000),
        status="ESTABLISHED",
        pid=1001,
    )
    mock_proc = _build_mock_process(
        pid=1001, name="web_server", cmdline=["web_server", "--port", "8080"]
    )

    monkeypatch.setattr(psutil, "net_connections", lambda kind="inet": [mock_conn])
    monkeypatch.setattr(psutil, "process_iter", lambda: [mock_proc])

    sample = await source.sample()

    assert sample.quality == MetricQuality.ESTIMATED
    assert len(sample.connections) == 1
    conn = sample.connections[0]
    assert conn.laddr_ip == "127.0.0.1"
    assert conn.laddr_port == 8080
    assert conn.raddr_ip == "10.0.0.1"
    assert conn.status == ConnState.ESTABLISHED
    assert conn.protocol == Protocol.TCP
    assert conn.pid == 1001

    assert 1001 in sample.processes
    proc_sample = sample.processes[1001]
    assert proc_sample.name == "web_server"
    assert proc_sample.open_connections == 1
    assert proc_sample.cpu_percent == 12.5

    assert source.capabilities.connection_owner is True
    await source.stop()


@pytest.mark.asyncio
async def test_psutil_source_io_delta_calculation(monkeypatch: pytest.MonkeyPatch) -> None:
    source = PsutilSource()
    await source.start()

    proc_p1 = _build_mock_process(pid=2000, io_bytes=(10_000, 10_000))
    proc_p2 = _build_mock_process(pid=2000, io_bytes=(20_000, 20_000))

    monkeypatch.setattr(psutil, "net_connections", lambda kind="inet": [])

    # Sample 1: Baseline IO registered
    monkeypatch.setattr(psutil, "process_iter", lambda: [proc_p1])
    sample1 = await source.sample()
    assert sample1.processes[2000].io_bytes_per_sec == 0.0

    # Sample 2: Delta calculated
    monkeypatch.setattr(psutil, "process_iter", lambda: [proc_p2])
    sample2 = await source.sample()
    assert sample2.processes[2000].io_bytes_per_sec is not None
    assert sample2.processes[2000].io_bytes_per_sec > 0.0

    await source.stop()


@pytest.mark.asyncio
async def test_psutil_source_access_denied_graceful_degradation(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = PsutilSource()
    await source.start()

    # Global net_connections raises AccessDenied (e.g. non-root on macOS/containers)
    def raise_access_denied(kind: str = "inet") -> list[Any]:
        raise psutil.AccessDenied()

    per_proc_conn = MockPConn(
        fd=3,
        family=socket.AF_INET,
        type=socket.SOCK_STREAM,
        laddr=MockAddr(ip="127.0.0.1", port=5000),
        raddr=None,
        status="LISTEN",
        pid=3000,
    )
    proc = _build_mock_process(pid=3000, net_conns=[per_proc_conn])

    monkeypatch.setattr(psutil, "net_connections", raise_access_denied)
    monkeypatch.setattr(psutil, "process_iter", lambda: [proc])

    sample = await source.sample()

    # Gracefully downgraded capability flag
    assert source.capabilities.connection_owner is False
    # Still acquired per-process connections where allowed
    assert len(sample.connections) == 1
    assert sample.connections[0].status == ConnState.LISTEN
    assert 3000 in sample.processes

    await source.stop()


@pytest.mark.asyncio
async def test_psutil_source_handles_process_exceptions(monkeypatch: pytest.MonkeyPatch) -> None:
    source = PsutilSource()
    await source.start()

    # Process that raises NoSuchProcess on info call
    dead_proc = MagicMock()
    dead_proc.pid = 9999
    dead_proc.name.side_effect = psutil.NoSuchProcess(pid=9999)

    # Process that raises AccessDenied on cmdline
    restricted_proc = _build_mock_process(pid=4000, name="root_daemon")
    restricted_proc.cmdline.side_effect = psutil.AccessDenied(pid=4000)
    restricted_proc.username.side_effect = psutil.AccessDenied(pid=4000)

    monkeypatch.setattr(psutil, "net_connections", lambda kind="inet": [])
    monkeypatch.setattr(psutil, "process_iter", lambda: [dead_proc, restricted_proc])

    sample = await source.sample()

    assert 9999 not in sample.processes
    assert 4000 in sample.processes
    # Fallback to process name when cmdline is denied
    assert sample.processes[4000].cmdline_sanitized == "root_daemon"
    assert sample.processes[4000].username is None

    await source.stop()


@pytest.mark.asyncio
async def test_psutil_source_unsupported_io_counters(monkeypatch: pytest.MonkeyPatch) -> None:
    source = PsutilSource()
    await source.start()

    proc = _build_mock_process(pid=5000, io_bytes=None)
    monkeypatch.setattr(psutil, "net_connections", lambda kind="inet": [])
    monkeypatch.setattr(psutil, "process_iter", lambda: [proc])

    sample = await source.sample()

    assert sample.processes[5000].io_bytes_per_sec is None
    assert source.capabilities.per_process_io is False

    await source.stop()


@pytest.mark.asyncio
async def test_psutil_source_live_host_smoke() -> None:
    """Smoke test running against the actual host OS (without mocks)."""
    source = PsutilSource()
    await source.start()
    sample = await source.sample()

    assert sample.quality == MetricQuality.ESTIMATED
    assert isinstance(sample.processes, dict)
    assert len(sample.processes) > 0

    caps = source.capabilities
    assert isinstance(caps.connection_owner, bool)
    assert isinstance(caps.per_process_io, bool)

    await source.stop()


def test_map_conn_state_fallbacks() -> None:
    assert _map_conn_state("ESTABLISHED") == ConnState.ESTABLISHED
    assert _map_conn_state("LISTEN") == ConnState.LISTEN
    assert _map_conn_state("UNKNOWN_CUSTOM_STATE") == ConnState.NONE


def test_map_socket_protocol() -> None:
    assert _map_socket_protocol(socket.SOCK_STREAM) == Protocol.TCP
    assert _map_socket_protocol(socket.SOCK_DGRAM) == Protocol.UDP
