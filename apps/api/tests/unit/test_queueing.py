"""Unit tests for Erlang C, Little's Law, and queueing models (Master Plan §5.3)."""

import random

import pytest

from appflow.domain.enums import ConnState
from appflow.simulation.queueing import (
    compute_connections_and_states,
    compute_error_rate,
    compute_percentiles,
    compute_total_latency,
    compute_waiting_time,
    erlang_c,
)


def test_erlang_c_analytical_reference_values() -> None:
    # M/M/1 queue: c = 1, a = 0.5 (rho = 0.5) => C(1, 0.5) = rho = 0.5
    assert erlang_c(1, 0.5) == pytest.approx(0.5, rel=1e-5)

    # M/M/2 queue: c = 2, a = 1.0 (rho = 0.5)
    # B(2, 1.0) = 0.2
    # C(2, 1.0) = 0.2 / (1 - 0.5 * (1 - 0.2)) = 0.2 / 0.6 = 1/3 ~ 0.33333
    assert erlang_c(2, 1.0) == pytest.approx(1.0 / 3.0, rel=1e-4)


def test_erlang_c_boundary_conditions() -> None:
    assert erlang_c(0, 1.0) == 0.0
    assert erlang_c(1, 0.0) == 0.0
    assert erlang_c(1, -5.0) == 0.0


def test_erlang_c_numerical_stability_high_concurrency() -> None:
    # Large c should not overflow
    c_prob = erlang_c(50, 45.0)
    assert 0.0 <= c_prob <= 1.0

    # Oversaturation rho >= 1.0 should be clamped and not raise ZeroDivisionError
    oversaturated_c = erlang_c(10, 15.0)
    assert 0.0 <= oversaturated_c <= 1.0


def test_waiting_time_and_backlog_drain() -> None:
    # Zero load gives zero waiting time
    assert compute_waiting_time(4, 100.0, 0.0) == 0.0

    # Normal load
    w_q = compute_waiting_time(4, 100.0, 200.0)
    assert w_q > 0.0

    # Backlog adds additional drain delay: backlog / (c * mu)
    w_q_backlog = compute_waiting_time(4, 100.0, 200.0, backlog=400.0)
    expected_backlog_delay = 400.0 / (4 * 100.0)  # 1.0 second
    assert w_q_backlog == pytest.approx(w_q + expected_backlog_delay, rel=1e-4)


def test_compute_total_latency() -> None:
    total_ms = compute_total_latency(
        service_base_latency_ms=10.0,
        w_q_s=0.005,  # 5 ms
        mu=100.0,  # 10 ms
        downstream_sync_latencies_ms=15.0,
        pool_wait_ms=2.0,
    )
    # Expected: 5 + 10 + 10 + 2 + 15 = 42 ms
    assert total_ms == pytest.approx(42.0, rel=1e-4)


def test_compute_percentiles_ordering_and_jitter() -> None:
    rng = random.Random(42)
    p50, p99 = compute_percentiles(50.0, rng=rng, apply_jitter=True)
    assert p50 == 50.0
    assert p99 > p50

    # Without jitter, p99 is exactly 2.5 * p50
    p50_pure, p99_pure = compute_percentiles(50.0, rng=None, apply_jitter=False)
    assert p50_pure == 50.0
    assert p99_pure == 125.0


def test_compute_error_rate_logistic_cliff_and_timeouts() -> None:
    # Low utilization: error rate is near base rate
    err_low = compute_error_rate(rho=0.5, latency_ms=10.0, timeout_ms=100.0)
    assert err_low < 0.01

    # High utilization near rho_crit=0.9: logistic cliff triggers
    err_high = compute_error_rate(rho=0.95, latency_ms=50.0, timeout_ms=100.0)
    assert err_high > err_low

    # Timeout violation contributes heavily
    err_timeout = compute_error_rate(rho=0.5, latency_ms=250.0, timeout_ms=100.0)
    assert err_timeout > err_low


def test_compute_connections_and_states_littles_law() -> None:
    # lambda = 100 req/s, W = 0.05 s => L = 5 in-flight
    established, states = compute_connections_and_states(
        lam=100.0, latency_s=0.05, pool_size=10, is_exhausted=False
    )
    assert established == 5
    assert states[ConnState.ESTABLISHED] == 5
    assert states[ConnState.TIME_WAIT] > 0
    assert ConnState.CLOSE_WAIT not in states

    # Connection pool exhaustion: L = 20, pool_size = 10 => capped to 10 and CLOSE_WAIT present
    est_exh, states_exh = compute_connections_and_states(
        lam=200.0, latency_s=0.1, pool_size=10, is_exhausted=True
    )
    assert est_exh == 10
    assert states_exh[ConnState.ESTABLISHED] == 10
    assert states_exh[ConnState.CLOSE_WAIT] > 0
