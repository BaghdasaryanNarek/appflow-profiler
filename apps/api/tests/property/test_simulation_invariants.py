"""Property-based invariant tests for simulation models using Hypothesis (Master Plan §5.3)."""

import math

import hypothesis.strategies as st
from hypothesis import given, settings

from appflow.simulation.engine import SimulationEngine
from appflow.simulation.queueing import (
    compute_connections_and_states,
    compute_error_rate,
    compute_total_latency,
    compute_waiting_time,
    erlang_c,
)


@given(
    c=st.integers(min_value=1, max_value=64),
    a=st.floats(min_value=0.0, max_value=200.0, allow_nan=False, allow_infinity=False),
)
def test_invariant_erlang_c_bounds(c: int, a: float) -> None:
    """Erlang C probability must always be finite and within [0.0, 1.0]."""
    res = erlang_c(c, a)
    assert math.isfinite(res)
    assert 0.0 <= res <= 1.0


@given(
    rho=st.floats(min_value=0.0, max_value=10.0, allow_nan=False, allow_infinity=False),
    latency_ms=st.floats(min_value=0.1, max_value=10000.0, allow_nan=False, allow_infinity=False),
    timeout_ms=st.floats(min_value=1.0, max_value=5000.0, allow_nan=False, allow_infinity=False),
)
def test_invariant_error_rate_in_unit_interval(
    rho: float, latency_ms: float, timeout_ms: float
) -> None:
    """Error rate must be mathematically bounded in [0.0, 1.0] and finite."""
    err = compute_error_rate(rho, latency_ms, timeout_ms)
    assert math.isfinite(err)
    assert 0.0 <= err <= 1.0


@given(
    c=st.integers(min_value=1, max_value=8),
    mu=st.floats(min_value=10.0, max_value=500.0),
    rho1=st.floats(min_value=0.0, max_value=0.95),
    delta_rho=st.floats(min_value=0.0, max_value=0.5),
)
def test_invariant_latency_monotonic_in_load(
    c: int, mu: float, rho1: float, delta_rho: float
) -> None:
    """Latency is monotonically non-decreasing in rho for fixed queueing parameters."""
    rho2 = min(0.99, rho1 + delta_rho)
    lam1 = rho1 * c * mu
    lam2 = rho2 * c * mu

    w_q1 = compute_waiting_time(c, mu, lam1)
    w_q2 = compute_waiting_time(c, mu, lam2)
    assert w_q2 >= w_q1

    total_w1 = compute_total_latency(service_base_latency_ms=5.0, w_q_s=w_q1, mu=mu)
    total_w2 = compute_total_latency(service_base_latency_ms=5.0, w_q_s=w_q2, mu=mu)
    assert total_w2 >= total_w1


@given(seed=st.integers(min_value=0, max_value=1000000))
@settings(max_examples=10)
def test_invariant_seed_determinism(seed: int) -> None:
    """Identical random seeds must yield identical simulation telemetry."""
    e1 = SimulationEngine(seed=seed, scale=1.0, autoplay=False)
    e2 = SimulationEngine(seed=seed, scale=1.0, autoplay=False)

    for _ in range(3):
        s1 = e1.step(dt=1.0)
        s2 = e2.step(dt=1.0)
        assert len(s1.processes) == len(s2.processes)
        for pid in s1.processes:
            assert s1.processes[pid].cpu_percent == s2.processes[pid].cpu_percent
            assert s1.processes[pid].rss_bytes == s2.processes[pid].rss_bytes


@given(
    lam=st.floats(min_value=1.0, max_value=500.0),
    latency_s=st.floats(min_value=0.001, max_value=2.0),
    pool_size=st.integers(min_value=5, max_value=100),
)
def test_invariant_littles_law_holds(lam: float, latency_s: float, pool_size: int) -> None:
    """Little's Law L = lambda * W holds within rounding tolerance on connection counts."""
    expected_l = lam * latency_s
    established, _ = compute_connections_and_states(
        lam=lam, latency_s=latency_s, pool_size=pool_size, is_exhausted=False
    )
    expected_est = min(pool_size, max(1, round(expected_l)))
    assert established == expected_est


@given(scale=st.floats(min_value=0.5, max_value=2.0))
@settings(max_examples=10)
def test_invariant_node_count_stable_in_steady_state(scale: float) -> None:
    """Process topology remains constant in steady state with zero node churn."""
    engine = SimulationEngine(seed=42, scale=scale, autoplay=False)
    initial_pids = set(engine.processes)

    for _ in range(5):
        sample = engine.step(dt=1.0)
        assert set(sample.processes.keys()) == {p.pid for p in initial_pids}
