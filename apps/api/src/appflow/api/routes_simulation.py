"""Demo simulation scenario control endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status

from appflow.api.deps import (
    check_scenario_rate_limit,
    get_hub,
    get_settings,
    get_source,
)
from appflow.config import Settings
from appflow.domain.models import ScenarioInfo
from appflow.simulation.source import SimulationSource
from appflow.sources.base import TopologySource
from appflow.streaming.hub import StreamHub

router = APIRouter(prefix="/api/v1/simulation", tags=["simulation"])


def _require_simulation_source(
    settings: Settings,
    source: TopologySource,
) -> SimulationSource:
    """Validate that the active engine is running in demo/simulated mode."""
    if not settings.is_simulated or not isinstance(source, SimulationSource):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Simulation scenario endpoints are disabled in live production mode.",
        )
    return source


@router.get(
    "/scenarios",
    response_model=list[ScenarioInfo],
    summary="List available demo scenarios",
    description="Returns registered traffic storm and pool exhaustion scenarios.",
)
async def list_scenarios(
    settings: Annotated[Settings, Depends(get_settings)],
    source: Annotated[TopologySource, Depends(get_source)],
) -> list[ScenarioInfo]:
    """Retrieve metadata and active state for registered simulation scenarios."""
    sim_source = _require_simulation_source(settings, source)
    return sim_source.list_scenarios()


@router.post(
    "/scenarios/{scenario_id}/activate",
    response_model=ScenarioInfo,
    dependencies=[Depends(check_scenario_rate_limit)],
    summary="Trigger a simulation scenario",
    description=(
        "Manually activates an anomaly scenario (rate-limited to 1 request per 10s per client IP)."
    ),
)
async def activate_scenario(
    scenario_id: str,
    settings: Annotated[Settings, Depends(get_settings)],
    source: Annotated[TopologySource, Depends(get_source)],
    hub: Annotated[StreamHub, Depends(get_hub)],
) -> ScenarioInfo:
    """Activate a named anomaly scenario."""
    sim_source = _require_simulation_source(settings, source)
    try:
        scenario = sim_source.activate_scenario(scenario_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc

    # Notify connected WebSocket subscribers immediately
    await hub.broadcast_scenario(scenario)
    return scenario


@router.post(
    "/reset",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reset simulation state to steady baseline",
    description="Clears active chaos injections and restores steady Poisson traffic.",
)
async def reset_simulation(
    settings: Annotated[Settings, Depends(get_settings)],
    source: Annotated[TopologySource, Depends(get_source)],
    hub: Annotated[StreamHub, Depends(get_hub)],
) -> Response:
    """Reset simulation engine back to nominal steady-state operation."""
    sim_source = _require_simulation_source(settings, source)
    sim_source.reset_simulation()
    await hub.broadcast_scenario(None)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
