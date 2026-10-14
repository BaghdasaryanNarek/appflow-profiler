"""Unit tests for Optimization Advisor domain models and report schema (Master Plan §4.4)."""

from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from appflow.advisor.models import (
    AnalyzeRequest,
    Bottleneck,
    OptimizationReport,
    Recommendation,
    RecommendationCategory,
)


def _sample_report(**overrides: object) -> OptimizationReport:
    defaults: dict[str, object] = {
        "report_id": "rep-12345",
        "generated_at": datetime.now(UTC),
        "source": "heuristic",
        "model": None,
        "digest_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        "summary": "Database connection pool saturated under peak traffic storm.",
        "bottlenecks": [
            Bottleneck(
                node_id="svc:db",
                title="Postgres connection pool exhaustion",
                severity="high",
                evidence=["open_connections 100 == max_pool 100", "p99_ms 1450.0 > 1000.0"],
            )
        ],
        "recommendations": [
            Recommendation(
                id="rec-pool-db",
                title="Increase connection pool size and introduce PgBouncer",
                category=RecommendationCategory.CONNECTION_POOLING,
                priority=1,
                rationale="Orders and payments services contend for a static 100-connection limit.",
                expected_impact=(
                    "Reduces p99 latency by ~60% and eliminates connection acquisition timeouts."
                ),
                affected_node_ids=["svc:db", "svc:orders", "svc:payments"],
                effort="M",
            )
        ],
        "caveats": ["Process telemetry estimated under simulation mode."],
    }
    defaults.update(overrides)
    return OptimizationReport.model_validate(defaults)


def test_optimization_report_roundtrip() -> None:
    report = _sample_report()
    json_str = report.model_dump_json()
    loaded = OptimizationReport.model_validate_json(json_str)

    assert loaded.report_id == "rep-12345"
    assert loaded.source == "heuristic"
    assert len(loaded.bottlenecks) == 1
    assert loaded.bottlenecks[0].severity == "high"
    assert len(loaded.recommendations) == 1
    assert loaded.recommendations[0].priority == 1
    assert loaded.recommendations[0].effort == "M"


def test_summary_max_length() -> None:
    long_summary = "x" * 601
    with pytest.raises(ValidationError):
        _sample_report(summary=long_summary)

    valid_summary = "x" * 600
    report = _sample_report(summary=valid_summary)
    assert report.summary == valid_summary


@pytest.mark.parametrize("priority", [0, 6, -1, 10])
def test_recommendation_priority_bounds(priority: int) -> None:
    with pytest.raises(ValidationError):
        Recommendation(
            id="rec-bad-pri",
            title="Bad priority",
            category=RecommendationCategory.CAPACITY,
            priority=priority,
            rationale="Test",
            expected_impact="Test",
            affected_node_ids=["svc:test"],
            effort="S",
        )


@pytest.mark.parametrize("effort", ["XS", "XL", "low", "1"])
def test_recommendation_effort_values(effort: str) -> None:
    with pytest.raises(ValidationError):
        Recommendation(
            id="rec-bad-effort",
            title="Bad effort",
            category=RecommendationCategory.CAPACITY,
            priority=2,
            rationale="Test",
            expected_impact="Test",
            affected_node_ids=["svc:test"],
            effort=effort,  # type: ignore[arg-type]
        )


@pytest.mark.parametrize("severity", ["critical", "warning", "info", "extreme"])
def test_bottleneck_severity_values(severity: str) -> None:
    with pytest.raises(ValidationError):
        Bottleneck(
            node_id="svc:test",
            title="Bad severity",
            severity=severity,  # type: ignore[arg-type]
            evidence=["some evidence"],
        )


def test_analyze_request_defaults() -> None:
    req = AnalyzeRequest()
    assert req.scope == "global"
    assert req.focus is None

    scoped_req = AnalyzeRequest(scope="svc:orders", focus="connection_pooling")
    assert scoped_req.scope == "svc:orders"
    assert scoped_req.focus == "connection_pooling"
