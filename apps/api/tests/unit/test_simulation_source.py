"""Unit tests for SimulationSource and TopologySource protocol conformance (Master Plan §5.1)."""

import pytest

from appflow.domain.enums import MetricQuality
from appflow.simulation.source import SimulationSource
from appflow.sources.base import TopologySource


@pytest.mark.asyncio
async def test_simulation_source_lifecycle_and_protocol() -> None:
    source = SimulationSource(seed=999, scale=1.0)
    assert isinstance(source, TopologySource)

    # Capabilities declaration
    caps = source.capabilities
    assert caps.scenarios is True
    assert caps.connection_owner is True
    assert caps.per_process_io is True

    # Start and sample
    await source.start()
    sample = await source.sample()
    assert sample.quality == MetricQuality.SIMULATED
    assert len(sample.processes) > 0
    assert len(sample.connections) > 0

    await source.stop()


def test_simulation_source_scenario_controls() -> None:
    source = SimulationSource(seed=42)
    scenarios = source.list_scenarios()
    assert len(scenarios) == 4

    # Activate
    info = source.activate_scenario("cache-stampede")
    assert info.id == "cache-stampede"
    assert info.active is True
    assert source.active_scenario is not None
    assert source.active_scenario.id == "cache-stampede"

    # Reset
    source.reset_simulation()
    assert source.active_scenario is None
