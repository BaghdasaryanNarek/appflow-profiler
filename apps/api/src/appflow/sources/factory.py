"""Source factory with strict lazy imports to prevent loading psutil in demo mode."""

from appflow.config import Environment, Settings
from appflow.sources.base import TopologySource


def build_source(settings: Settings) -> TopologySource:
    """Instantiate the active TopologySource according to configuration.

    Implementation classes are imported lazily within this function so importing
    factory or operating under non-live environments avoids loading ``psutil``.
    """
    if settings.env == Environment.LIVE:
        from appflow.sources.psutil_source import PsutilSource

        return PsutilSource()

    if settings.env in (Environment.DEMO, Environment.TEST):
        from appflow.simulation.source import SimulationSource

        dt = float(settings.tick_ms) / 1000.0
        return SimulationSource(
            seed=settings.sim_seed,
            scale=settings.sim_scale,
            autoplay=settings.sim_autoplay,
            dt=dt,
        )

    raise ValueError(f"Unsupported environment mode: {settings.env}")
