"""Unit tests for scenario state machine and chaos injection (Master Plan §5.4)."""

import pytest

from appflow.simulation.engine import SimulationEngine
from appflow.simulation.scenarios import ScenarioManager, ScenarioState


def test_scenario_registry() -> None:
    manager = ScenarioManager()
    scenarios = manager.list_scenarios()
    assert len(scenarios) == 4
    scenario_ids = [s.id for s in scenarios]
    assert "request-storm" in scenario_ids
    assert "db-pool-exhaustion" in scenario_ids
    assert "cache-stampede" in scenario_ids
    assert "slow-dependency" in scenario_ids

    # None active by default
    assert all(not s.active for s in scenarios)
    assert manager.active_scenario_info is None


def test_manual_activation_and_reset() -> None:
    manager = ScenarioManager()
    info = manager.activate("db-pool-exhaustion")
    assert info.id == "db-pool-exhaustion"
    assert info.active is True
    state_after_act = manager.state
    assert state_after_act == ScenarioState.SCENARIO
    assert manager.active_scenario_info is not None
    assert manager.active_scenario_info.id == "db-pool-exhaustion"

    # Listed scenarios reflects activation
    listed = manager.list_scenarios()
    active_listed = [s for s in listed if s.active]
    assert len(active_listed) == 1
    assert active_listed[0].id == "db-pool-exhaustion"

    # Reset
    manager.reset()
    state_after_reset = manager.state
    assert state_after_reset == ScenarioState.STEADY
    assert manager.active_scenario_info is None


def test_invalid_scenario_id_raises() -> None:
    manager = ScenarioManager()
    with pytest.raises(ValueError, match="Unknown scenario"):
        manager.activate("non-existent-scenario")


def test_scenario_modifiers() -> None:
    manager = ScenarioManager()
    # Steady state: no modifications
    assert manager.apply_service_rate_modifier("svc:postgres-primary", 350.0) == 350.0
    assert manager.apply_cache_miss_modifier("svc:postgres-replica", 0.05) == 0.05
    assert manager.apply_latency_modifier("ext:payments-provider", 80.0) == 80.0

    # Activate db-pool-exhaustion
    manager.activate("db-pool-exhaustion")
    assert manager.apply_service_rate_modifier("svc:postgres-primary", 350.0) == 140.0
    assert manager.apply_service_rate_modifier("svc:other", 350.0) == 350.0

    # Activate cache-stampede
    manager.activate("cache-stampede")
    assert manager.apply_cache_miss_modifier("svc:postgres-replica", 0.05) == 0.80

    # Activate slow-dependency
    manager.activate("slow-dependency")
    assert manager.apply_latency_modifier("ext:payments-provider", 80.0) == 1800.0


def test_autoplay_transitions() -> None:
    engine = SimulationEngine()
    manager = ScenarioManager(autoplay=True, auto_interval_s=10.0)

    # 9 seconds: still steady
    manager.tick(9.0, engine)
    s_early = manager.state
    assert s_early == ScenarioState.STEADY

    # 10 seconds: transitions to scenario
    manager.tick(2.0, engine)
    s_scen = manager.state
    assert s_scen == ScenarioState.SCENARIO
    assert manager.active_scenario is not None

    # Run for full scenario duration + 1s => transitions to recovery
    duration = float(manager.active_scenario.duration_s)
    manager.tick(duration + 1.0, engine)
    s_rec = manager.state
    assert s_rec == ScenarioState.RECOVERY

    # Run recovery for 16s => transitions back to steady
    manager.tick(16.0, engine)
    s_final = manager.state
    assert s_final == ScenarioState.STEADY
