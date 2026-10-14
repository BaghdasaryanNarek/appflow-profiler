"""Unit tests for threshold-based health derivation (Master Plan §4.3)."""

import pytest

from appflow.domain.enums import ConnState, HealthStatus, MetricQuality
from appflow.domain.health import (
    DEFAULT_THRESHOLDS,
    HealthThresholds,
    derive_edge_health,
    derive_health,
    derive_node_health,
)
from appflow.domain.models import EdgeMetrics, NodeMetrics


@pytest.mark.parametrize(
    ("p99", "error", "sat", "expected_status", "expected_reason_substrs"),
    [
        # Healthy baseline
        (50.0, 0.001, 0.30, HealthStatus.HEALTHY, []),
        (250.0, 0.010, 0.75, HealthStatus.HEALTHY, []),
        # Degraded transitions (single breaches)
        (250.1, 0.005, 0.50, HealthStatus.DEGRADED, ["p99_ms 250.1 > 250.0"]),
        (100.0, 0.011, 0.50, HealthStatus.DEGRADED, ["error_rate 0.011 > 0.010"]),
        (100.0, 0.005, 0.76, HealthStatus.DEGRADED, ["saturation 0.76 > 0.75"]),
        # Degraded transitions (multiple breaches)
        (
            300.0,
            0.020,
            0.80,
            HealthStatus.DEGRADED,
            ["p99_ms 300.0 > 250.0", "error_rate 0.020 > 0.010", "saturation 0.80 > 0.75"],
        ),
        # Critical transitions (single breaches)
        (1000.1, 0.001, 0.30, HealthStatus.CRITICAL, ["p99_ms 1000.1 > 1000.0"]),
        (100.0, 0.051, 0.30, HealthStatus.CRITICAL, ["error_rate 0.051 > 0.050"]),
        (100.0, 0.001, 0.93, HealthStatus.CRITICAL, ["saturation 0.93 > 0.92"]),
        # Critical compounded with degraded
        (
            1500.0,
            0.020,
            0.80,
            HealthStatus.CRITICAL,
            ["p99_ms 1500.0 > 1000.0", "error_rate 0.020 > 0.010", "saturation 0.80 > 0.75"],
        ),
        # All critical
        (
            2000.0,
            0.100,
            0.98,
            HealthStatus.CRITICAL,
            ["p99_ms 2000.0 > 1000.0", "error_rate 0.100 > 0.050", "saturation 0.98 > 0.92"],
        ),
    ],
)
def test_derive_health_transitions(
    p99: float,
    error: float,
    sat: float,
    expected_status: HealthStatus,
    expected_reason_substrs: list[str],
) -> None:
    status, reasons = derive_health(p99, error, sat)
    assert status is expected_status
    assert len(reasons) == len(expected_reason_substrs)
    for expected_reason in expected_reason_substrs:
        assert expected_reason in reasons


def test_custom_thresholds_override_defaults() -> None:
    custom = HealthThresholds(
        degraded_p99_ms=50.0,
        degraded_error_rate=0.005,
        degraded_saturation=0.50,
        critical_p99_ms=100.0,
        critical_error_rate=0.02,
        critical_saturation=0.80,
    )
    # 60 ms is healthy on defaults, but degraded on custom
    status_default, reasons_default = derive_health(60.0, 0.001, 0.10, DEFAULT_THRESHOLDS)
    assert status_default is HealthStatus.HEALTHY
    assert reasons_default == []

    status_custom, reasons_custom = derive_health(60.0, 0.001, 0.10, custom)
    assert status_custom is HealthStatus.DEGRADED
    assert reasons_custom == ["p99_ms 60.0 > 50.0"]


def test_derive_node_health_helper() -> None:
    metrics = NodeMetrics(
        rps=150.0,
        p50_ms=45.0,
        p99_ms=350.0,
        error_rate=0.002,
        saturation=0.85,
        cpu_percent=65.0,
        rss_bytes=1024 * 1024 * 256,
        open_connections=42,
        quality=MetricQuality.MEASURED,
    )
    status, reasons = derive_node_health(metrics)
    assert status is HealthStatus.DEGRADED
    assert "p99_ms 350.0 > 250.0" in reasons
    assert "saturation 0.85 > 0.75" in reasons


def test_derive_edge_health_helper() -> None:
    metrics = EdgeMetrics(
        rps=25.0,
        bytes_per_sec=1024 * 50,
        p99_ms=1200.0,
        error_rate=0.06,
        connection_count=10,
        state_breakdown={ConnState.ESTABLISHED: 10},
        retry_rate=0.05,
        quality=MetricQuality.ESTIMATED,
    )
    status, reasons = derive_edge_health(metrics)
    assert status is HealthStatus.CRITICAL
    assert "p99_ms 1200.0 > 1000.0" in reasons
    assert "error_rate 0.060 > 0.050" in reasons
