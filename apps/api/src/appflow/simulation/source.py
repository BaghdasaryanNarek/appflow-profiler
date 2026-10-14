"""TopologySource backed by deterministic simulation engine (Master Plan §5.1)."""

from appflow.domain.models import Capabilities, ScenarioInfo
from appflow.simulation.engine import SimulationEngine
from appflow.sources.base import RawSample, TopologySource


class SimulationSource(TopologySource):
    """Synthetic telemetry source delivering real-time simulation samples."""

    def __init__(
        self,
        seed: int = 42,
        scale: float = 1.0,
        autoplay: bool = True,
        dt: float = 1.0,
    ) -> None:
        self.dt = dt
        self.engine = SimulationEngine(seed=seed, scale=scale, autoplay=autoplay)
        self._started: bool = False

    @property
    def capabilities(self) -> Capabilities:
        """Declare telemetry fidelity and feature support."""
        return Capabilities(
            per_process_io=True,
            connection_owner=True,
            ai_advisor=False,
            scenarios=True,
        )

    async def start(self) -> None:
        """Initialize telemetry acquisition and prime simulation state."""
        self._started = True
        # Prime the simulation with a warm-up step
        self.engine.step(dt=self.dt)

    async def sample(self) -> RawSample:
        """Sample simulated state for the current tick."""
        return self.engine.step(dt=self.dt)

    async def stop(self) -> None:
        """Release background tasks and active resources."""
        self._started = False

    def list_scenarios(self) -> list[ScenarioInfo]:
        """List registered chaos and load scenarios."""
        return self.engine.scenarios.list_scenarios()

    def activate_scenario(self, scenario_id: str) -> ScenarioInfo:
        """Activate an anomaly scenario by identifier."""
        return self.engine.scenarios.activate(scenario_id)

    def reset_simulation(self) -> None:
        """Reset simulation engine back to steady state baseline."""
        self.engine.reset()

    @property
    def active_scenario(self) -> ScenarioInfo | None:
        """Descriptor of currently running scenario if any."""
        return self.engine.active_scenario
