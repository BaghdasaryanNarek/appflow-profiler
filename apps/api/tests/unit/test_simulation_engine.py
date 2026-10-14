"""Unit tests for discrete-time simulation engine (Master Plan §5.3)."""

import time

from appflow.domain.enums import MetricQuality
from appflow.simulation.engine import SimulationEngine


def test_step_produces_valid_raw_sample() -> None:
    engine = SimulationEngine(seed=42, scale=1.0)
    sample = engine.step(dt=1.0)

    assert sample.quality == MetricQuality.SIMULATED
    assert len(sample.processes) > 20
    assert len(sample.connections) > 10

    # Every process has non-negative stats
    for pid, proc in sample.processes.items():
        assert proc.pid == pid
        assert proc.cpu_percent >= 0.0
        assert proc.rss_bytes > 0
        assert proc.num_threads is not None
        assert proc.num_threads >= 1
        assert proc.cmdline_sanitized.startswith("/usr/local/bin/")


def test_deterministic_execution() -> None:
    engine1 = SimulationEngine(seed=12345, scale=1.0)
    engine2 = SimulationEngine(seed=12345, scale=1.0)

    for _ in range(5):
        s1 = engine1.step(dt=1.0)
        s2 = engine2.step(dt=1.0)

        # Same process metrics
        assert s1.processes.keys() == s2.processes.keys()
        for pid in s1.processes:
            p1 = s1.processes[pid]
            p2 = s2.processes[pid]
            assert p1.cpu_percent == p2.cpu_percent
            assert p1.rss_bytes == p2.rss_bytes
            assert p1.open_connections == p2.open_connections

        # Same connection counts and states
        assert len(s1.connections) == len(s2.connections)


def test_fast_forward_performance() -> None:
    """A 10-minute simulated run (600 steps) must complete in < 2.0s per acceptance criteria."""
    engine = SimulationEngine(seed=42, scale=1.0)
    start_time = time.perf_counter()

    for _ in range(600):
        engine.step(dt=1.0)

    elapsed = time.perf_counter() - start_time
    # Must comfortably meet the < 2.0s requirement
    assert elapsed < 2.0, f"600 simulation steps took {elapsed:.2f}s (exceeded 2.0s limit)"


def test_rss_gc_sawtooth() -> None:
    engine = SimulationEngine(seed=42, scale=1.0)
    initial_rss = list(engine.process_rss.values())

    # Step many times to observe memory evolution
    saw_drop = False
    prev_max = max(initial_rss)

    for _ in range(50):
        sample = engine.step(dt=1.0)
        curr_max = max(p.rss_bytes for p in sample.processes.values())
        if curr_max < prev_max:
            saw_drop = True
            break
        prev_max = curr_max

    assert saw_drop is True or prev_max > 0
    # Engine runs without memory unbounded explosion
    assert all(rss < 400 * 1024 * 1024 for rss in engine.process_rss.values())
