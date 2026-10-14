"""Source factory with strict lazy imports to prevent loading psutil in demo mode."""

from typing import cast

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
        try:
            from appflow.simulation.source import (  # type: ignore[import-not-found]
                SimulationSource,
            )

            return cast(
                "TopologySource",
                SimulationSource(seed=settings.sim_seed, scale=settings.sim_scale),
            )
        except ImportError:
            raise RuntimeError(
                f"Simulation mode requested (ENV={settings.env.value}), but SimulationSource "
                "is not yet available (scheduled for implementation in Phase 5)."
            ) from None

    raise ValueError(f"Unsupported environment mode: {settings.env}")
