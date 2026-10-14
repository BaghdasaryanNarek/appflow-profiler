"""Threshold-based health derivation for nodes and edges (Master Plan §4.3)."""

from typing import TYPE_CHECKING

from pydantic import BaseModel, ConfigDict, Field

from appflow.domain.enums import HealthStatus

if TYPE_CHECKING:
    from appflow.domain.models import EdgeMetrics, NodeMetrics


class HealthThresholds(BaseModel):
    """Configurable operational boundaries for health state transitions."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    degraded_p99_ms: float = Field(default=250.0, gt=0.0)
    degraded_error_rate: float = Field(default=0.01, ge=0.0, le=1.0)
    degraded_saturation: float = Field(default=0.75, ge=0.0, le=1.0)

    critical_p99_ms: float = Field(default=1000.0, gt=0.0)
    critical_error_rate: float = Field(default=0.05, ge=0.0, le=1.0)
    critical_saturation: float = Field(default=0.92, ge=0.0, le=1.0)


DEFAULT_THRESHOLDS = HealthThresholds()


def derive_health(
    p99_ms: float,
    error_rate: float,
    saturation: float,
    thresholds: HealthThresholds | None = None,
) -> tuple[HealthStatus, list[str]]:
    """Evaluate latency, error rate and saturation against configured thresholds.

    Returns the assessed ``HealthStatus`` and a list of human-readable reason strings.
    """
    th = thresholds or DEFAULT_THRESHOLDS
    reasons: list[str] = []
    is_critical = False

    # p99 evaluation
    if p99_ms > th.critical_p99_ms:
        is_critical = True
        reasons.append(f"p99_ms {p99_ms:.1f} > {th.critical_p99_ms:.1f}")
    elif p99_ms > th.degraded_p99_ms:
        reasons.append(f"p99_ms {p99_ms:.1f} > {th.degraded_p99_ms:.1f}")

    # error rate evaluation
    if error_rate > th.critical_error_rate:
        is_critical = True
        reasons.append(f"error_rate {error_rate:.3f} > {th.critical_error_rate:.3f}")
    elif error_rate > th.degraded_error_rate:
        reasons.append(f"error_rate {error_rate:.3f} > {th.degraded_error_rate:.3f}")

    # saturation evaluation
    if saturation > th.critical_saturation:
        is_critical = True
        reasons.append(f"saturation {saturation:.2f} > {th.critical_saturation:.2f}")
    elif saturation > th.degraded_saturation:
        reasons.append(f"saturation {saturation:.2f} > {th.degraded_saturation:.2f}")

    if is_critical:
        return HealthStatus.CRITICAL, reasons
    if reasons:
        return HealthStatus.DEGRADED, reasons
    return HealthStatus.HEALTHY, []


def derive_node_health(
    metrics: "NodeMetrics",
    thresholds: HealthThresholds | None = None,
) -> tuple[HealthStatus, list[str]]:
    """Derive health for a node from its metrics."""
    return derive_health(
        p99_ms=metrics.p99_ms,
        error_rate=metrics.error_rate,
        saturation=metrics.saturation,
        thresholds=thresholds,
    )


def derive_edge_health(
    metrics: "EdgeMetrics",
    thresholds: HealthThresholds | None = None,
) -> tuple[HealthStatus, list[str]]:
    """Derive health for an edge using its p99 and error_rate (saturation is 0 for edges)."""
    return derive_health(
        p99_ms=metrics.p99_ms,
        error_rate=metrics.error_rate,
        saturation=0.0,
        thresholds=thresholds,
    )
