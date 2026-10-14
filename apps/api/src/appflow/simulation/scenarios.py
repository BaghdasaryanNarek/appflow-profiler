"""Scenario definitions and state machine for chaos testing and demos (Master Plan §5.4)."""

from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING

from appflow.domain.models import ScenarioInfo

if TYPE_CHECKING:
    from appflow.simulation.engine import SimulationEngine


class ScenarioState(StrEnum):
    """Lifecycle phase of the scenario state machine."""

    STEADY = "steady"
    SCENARIO = "scenario"
    RECOVERY = "recovery"


@dataclass(frozen=True)
class ScenarioConfig:
    """Static configuration of an injectable anomaly scenario."""

    id: str
    name: str
    description: str
    duration_s: int


AVAILABLE_SCENARIOS: dict[str, ScenarioConfig] = {
    "request-storm": ScenarioConfig(
        id="request-storm",
        name="Flash Crowd Request Storm",
        description="Hawkes self-exciting spike causing saturation and retry storm",
        duration_s=60,
    ),
    "db-pool-exhaustion": ScenarioConfig(
        id="db-pool-exhaustion",
        name="Database Pool Exhaustion",
        description="PostgreSQL primary capacity drops by 60%, exhausting connection pool",
        duration_s=45,
    ),
    "cache-stampede": ScenarioConfig(
        id="cache-stampede",
        name="Redis Cache Stampede",
        description="Redis cache hit ratio collapses from 95% to 20%, spiking replica queries",
        duration_s=45,
    ),
    "slow-dependency": ScenarioConfig(
        id="slow-dependency",
        name="Slow External Payment Dependency",
        description="External payment gateway latency spikes from 80ms to 1800ms",
        duration_s=60,
    ),
}

SCENARIO_SEQUENCE = (
    "request-storm",
    "db-pool-exhaustion",
    "cache-stampede",
    "slow-dependency",
)


class ScenarioManager:
    """Manages autonomous scenario cycling, manual activation, and parameter mutation."""

    def __init__(
        self,
        autoplay: bool = True,
        auto_interval_s: float = 240.0,  # 4 minutes between automated scenarios
    ) -> None:
        self.autoplay = autoplay
        self.auto_interval_s = auto_interval_s
        self.state: ScenarioState = ScenarioState.STEADY
        self.active_scenario: ScenarioConfig | None = None
        self.state_time: float = 0.0
        self._next_scenario_idx: int = 0

    @property
    def active_scenario_info(self) -> ScenarioInfo | None:
        """Return active scenario descriptor or None if in steady/recovery."""
        if self.active_scenario is None or self.state != ScenarioState.SCENARIO:
            return None
        return ScenarioInfo(
            id=self.active_scenario.id,
            name=self.active_scenario.name,
            description=self.active_scenario.description,
            duration_s=self.active_scenario.duration_s,
            active=True,
        )

    def list_scenarios(self) -> list[ScenarioInfo]:
        """Return list of all registered scenarios with current activation status."""
        active_id = (
            self.active_scenario.id
            if (self.active_scenario and self.state == ScenarioState.SCENARIO)
            else None
        )

        return [
            ScenarioInfo(
                id=cfg.id,
                name=cfg.name,
                description=cfg.description,
                duration_s=cfg.duration_s,
                active=(cfg.id == active_id),
            )
            for cfg in AVAILABLE_SCENARIOS.values()
        ]

    def activate(self, scenario_id: str) -> ScenarioInfo:
        """Manually trigger a scenario, overriding current state."""
        if scenario_id not in AVAILABLE_SCENARIOS:
            valid = list(AVAILABLE_SCENARIOS.keys())
            raise ValueError(f"Unknown scenario {scenario_id!r}. Supported scenarios: {valid}")

        config = AVAILABLE_SCENARIOS[scenario_id]
        self.active_scenario = config
        self.state = ScenarioState.SCENARIO
        self.state_time = 0.0

        return ScenarioInfo(
            id=config.id,
            name=config.name,
            description=config.description,
            duration_s=config.duration_s,
            active=True,
        )

    def reset(self) -> None:
        """Reset state machine back to steady state."""
        self.state = ScenarioState.STEADY
        self.active_scenario = None
        self.state_time = 0.0

    def tick(self, dt: float, engine: "SimulationEngine") -> None:
        """Advance timers and execute state transitions."""
        self.state_time += dt

        if self.state == ScenarioState.STEADY:
            if self.autoplay and self.state_time >= self.auto_interval_s:
                # Select next scenario in sequence
                next_id = SCENARIO_SEQUENCE[self._next_scenario_idx % len(SCENARIO_SEQUENCE)]
                self._next_scenario_idx += 1
                self.activate(next_id)
                self._on_scenario_start(engine)

        elif self.state == ScenarioState.SCENARIO:
            if self.active_scenario and self.state_time >= self.active_scenario.duration_s:
                self.state = ScenarioState.RECOVERY
                self.state_time = 0.0

        elif self.state == ScenarioState.RECOVERY:
            # Recovery condition: 15s elapsed or backlogs drained
            all_drained = all(b < 1.0 for b in engine.service_backlogs.values())
            if self.state_time >= 15.0 or (self.state_time >= 5.0 and all_drained):
                self.reset()

    def _on_scenario_start(self, engine: "SimulationEngine") -> None:
        """Apply one-time impulses when a scenario starts."""
        if self.active_scenario and self.active_scenario.id == "request-storm":
            engine.traffic.hawkes.trigger_burst(alpha=5.0)

    def apply_service_rate_modifier(self, service_id: str, base_mu: float) -> float:
        """Apply active scenario modifier to service processing capacity."""
        if (
            self.state == ScenarioState.SCENARIO
            and self.active_scenario
            and self.active_scenario.id == "db-pool-exhaustion"
            and service_id == "svc:postgres-primary"
        ):
            # Primary DB capacity drops by 60%
            return base_mu * 0.40
        return base_mu

    def apply_cache_miss_modifier(self, target_id: str, base_probability: float) -> float:
        """Apply active scenario modifier to catalog->postgres replica miss rate."""
        if (
            self.state == ScenarioState.SCENARIO
            and self.active_scenario
            and self.active_scenario.id == "cache-stampede"
            and target_id == "svc:postgres-replica"
        ):
            # Hit ratio drops 95% -> 20% => miss probability rises 0.05 -> 0.80
            return 0.80
        return base_probability

    def apply_latency_modifier(self, service_id: str, base_latency_ms: float) -> float:
        """Apply active scenario modifier to service base latency."""
        if (
            self.state == ScenarioState.SCENARIO
            and self.active_scenario
            and self.active_scenario.id == "slow-dependency"
            and service_id == "ext:payments-provider"
        ):
            # Payment gateway latency jumps from 80ms to 1800ms
            return 1800.0
        return base_latency_ms
