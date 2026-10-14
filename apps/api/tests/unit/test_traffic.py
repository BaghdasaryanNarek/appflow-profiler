"""Unit tests for traffic generator and Hawkes process (Master Plan §5.3.1)."""

import math

import pytest

from appflow.simulation.traffic import HawkesProcess, TrafficGenerator


def test_hawkes_burst_and_decay() -> None:
    hawkes = HawkesProcess(beta=0.05)
    assert hawkes.multiplier == 1.0

    # Trigger burst
    hawkes.trigger_burst(alpha=5.0)
    assert hawkes.multiplier == 6.0

    # Step forward by 20 seconds: multiplier decays
    hawkes.step(dt=20.0)
    expected_intensity = 5.0 * math.exp(-0.05 * 20.0)  # 5 * e^-1 ~ 1.839
    assert hawkes.multiplier == pytest.approx(1.0 + expected_intensity, rel=1e-3)

    # Reset
    hawkes.reset()
    assert hawkes.multiplier == 1.0


def test_diurnal_sinusoidal_bounds() -> None:
    traffic = TrafficGenerator(base_rate=100.0, diurnal_amplitude=0.30, t_day=600.0, seed=42)

    # At t=0: sin(0) = 0 => 100
    assert traffic.get_rate(0.0) == 100.0

    # At t=150: sin(pi/2) = 1 => 130
    assert traffic.get_rate(150.0) == pytest.approx(130.0, rel=1e-4)

    # At t=450: sin(3*pi/2) = -1 => 70
    assert traffic.get_rate(450.0) == pytest.approx(70.0, rel=1e-4)

    # At t=600: sin(2*pi) = 0 => 100
    assert traffic.get_rate(600.0) == pytest.approx(100.0, rel=1e-4)


def test_poisson_sampling_statistics() -> None:
    traffic = TrafficGenerator(base_rate=50.0, seed=123)

    # 1000 samples at rate=50, dt=1.0 (mean=50)
    samples = [traffic.sample_arrivals(rate=50.0, dt=1.0) for _ in range(1000)]
    mean_val = sum(samples) / len(samples)

    # Mean should be close to 50 (+/- 5%)
    assert 47.0 < mean_val < 53.0

    # Zero rate produces zero
    assert traffic.sample_arrivals(rate=0.0, dt=1.0) == 0

    # Small mean (< 30) exercises Knuth's exact Poisson algorithm
    small_samples = [traffic.sample_arrivals(rate=5.0, dt=1.0) for _ in range(500)]
    small_mean = sum(small_samples) / len(small_samples)
    assert 4.0 < small_mean < 6.0

    # Reset with seed re-initializes deterministic sequence
    traffic.reset(seed=999)
    assert traffic.hawkes.multiplier == 1.0
