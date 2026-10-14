"""Queueing theory: Erlang C, Little's Law, and latencies (Master Plan §5.3)."""

import math
from typing import TYPE_CHECKING

from appflow.domain.enums import ConnState

if TYPE_CHECKING:
    import random


def erlang_c(c: int, a: float) -> float:
    """Compute Erlang C waiting probability C(c, a) using stable Erlang B recurrence.

    Parameters
    ----------
    c : int
        Number of parallel servers (instance count >= 1).
    a : float
        Offered load / traffic intensity in Erlangs (lambda / mu >= 0.0).

    Returns
    -------
    float
        Probability of an arriving request finding all servers busy and waiting [0.0, 1.0].
    """
    if c <= 0 or a <= 0.0:
        return 0.0

    rho = a / c
    # Stationary stability clamp per §5.3.3 to avoid division-by-zero when over-saturated
    rho_eff = min(max(0.0, rho), 0.999)

    # Iterative Erlang B calculation (no factorials, robust to large c)
    b = 1.0
    for k in range(1, c + 1):
        b = (a * b) / (k + a * b)

    # Erlang C from Erlang B: C(c, a) = B / (1 - rho_eff * (1 - B))
    denominator = 1.0 - rho_eff * (1.0 - b)
    if denominator <= 1e-9:
        return 1.0

    c_val = b / denominator
    return max(0.0, min(1.0, c_val))


def compute_waiting_time(c: int, mu: float, lam: float, backlog: float = 0.0) -> float:
    """Calculate mean queue waiting time W_q in seconds including backlog drainage.

    W_q = C(c, a) / (c*mu - lambda) + backlog / (c*mu)
    """
    if c <= 0 or mu <= 0.0 or lam <= 0.0:
        return 0.0

    a = lam / mu
    rho = a / c
    rho_eff = min(max(0.0, rho), 0.999)
    c_prob = erlang_c(c, a)

    # Stationary waiting time in queue
    capacity = c * mu
    stationary_w_q = c_prob / max(1e-6, capacity * (1.0 - rho_eff))

    # Dynamic delay to drain accumulated backlog queue
    backlog_delay = backlog / capacity if capacity > 0.0 else 0.0

    return max(0.0, stationary_w_q + backlog_delay)


def compute_total_latency(
    service_base_latency_ms: float,
    w_q_s: float,
    mu: float,
    downstream_sync_latencies_ms: float = 0.0,
    pool_wait_ms: float = 0.0,
) -> float:
    """Calculate total service response time W = W_q + 1/mu + base + pool_wait + downstream (ms)."""
    service_time_ms = (1.0 / mu) * 1000.0 if mu > 0.0 else 0.0
    queue_wait_ms = w_q_s * 1000.0
    total_ms = (
        queue_wait_ms
        + service_time_ms
        + service_base_latency_ms
        + pool_wait_ms
        + downstream_sync_latencies_ms
    )
    return max(0.1, total_ms)


def compute_percentiles(
    w_ms: float,
    rng: "random.Random | None" = None,
    apply_jitter: bool = True,
) -> tuple[float, float]:
    """Calculate p50 and p99 latencies using exponential tail scaling with log-normal jitter."""
    p50 = max(0.1, w_ms)
    # Exponential tail scale: p99 ~ 2.5x mean/median
    p99_base = p50 * 2.5

    if apply_jitter and rng is not None:
        # Multiplicative log-normal jitter (+/- 5%)
        jitter = math.exp(rng.gauss(0.0, 0.025))
        jitter = max(0.95, min(1.05, jitter))
        p99 = max(p50, p99_base * jitter)
    else:
        p99 = max(p50, p99_base)

    return (p50, p99)


def compute_error_rate(
    rho: float,
    latency_ms: float,
    timeout_ms: float,
    base_error_rate: float = 0.001,
    kappa: float = 25.0,
    rho_crit: float = 0.9,
) -> float:
    """Calculate request error rate from saturation cliff and timeouts (§5.3.5)."""
    # Logistic cliff near saturation: 1 / (1 + exp(-kappa * (rho - rho_crit)))
    exp_arg = -kappa * (rho - rho_crit)
    # Clamp exp_arg to avoid overflow
    exp_arg = max(-50.0, min(50.0, exp_arg))
    logistic_error = 1.0 / (1.0 + math.exp(exp_arg))

    # Timeout error contribution when latency exceeds caller timeout
    timeout_error = 0.0
    if latency_ms > timeout_ms > 0.0:
        timeout_error = min(1.0, (latency_ms - timeout_ms) / timeout_ms)

    error_rate = base_error_rate + (logistic_error * 0.5) + (timeout_error * 0.5)
    return max(0.0, min(1.0, error_rate))


def compute_connections_and_states(
    lam: float,
    latency_s: float,
    pool_size: int | None = None,
    is_exhausted: bool = False,
) -> tuple[int, dict[ConnState, int]]:
    """Apply Little's Law L = lambda * W to determine in-flight connections and TCP states."""
    if lam <= 0.0 or latency_s <= 0.0:
        return (0, {ConnState.ESTABLISHED: 0})

    in_flight = lam * latency_s
    conn_count = max(1, round(in_flight))

    if pool_size is not None and pool_size > 0:
        established = min(conn_count, pool_size)
    else:
        established = conn_count

    # Completed connection churn in TIME_WAIT
    time_wait = min(1000, max(1, round(lam * 0.15)))

    # CLOSE_WAIT accumulates during database pool exhaustion or heavy errors
    close_wait = 0
    if is_exhausted:
        close_wait = min(500, max(5, round(conn_count * 0.5)))

    states: dict[ConnState, int] = {
        ConnState.ESTABLISHED: established,
        ConnState.TIME_WAIT: time_wait,
    }
    if close_wait > 0:
        states[ConnState.CLOSE_WAIT] = close_wait

    return (established, states)
