"""Topology REST inspection endpoints: summary, snapshot, and entity disclosures."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from appflow.api.deps import get_aggregator, get_hub, get_settings
from appflow.config import Settings
from appflow.domain.enums import NodeKind, SourceMode
from appflow.domain.models import EdgeDetail, NodeDetail, SnapshotResponse, TopologySummary
from appflow.streaming.aggregator import TopologyAggregator
from appflow.streaming.hub import StreamHub

router = APIRouter(prefix="/api/v1", tags=["topology"])


def _parse_kinds(kinds: list[str] | None) -> list[NodeKind] | None:
    """Parse comma-separated or repeated query parameter kind strings into NodeKind enums."""
    if kinds is None:
        return None
    result: list[NodeKind] = []
    for item in kinds:
        for part in item.split(","):
            part_clean = part.strip().lower()
            if not part_clean:
                continue
            try:
                result.append(NodeKind(part_clean))
            except ValueError as exc:
                valid = [k.value for k in NodeKind]
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Invalid node kind '{part_clean}'. Allowed values: {valid}",
                ) from exc
    return result if result else None


@router.get(
    "/topology/summary",
    response_model=TopologySummary,
    summary="Compact topology summary (LCP payload)",
    description=(
        "Returns fleet-wide aggregates and health distributions with Cache-Control: max-age=2."
    ),
)
async def get_topology_summary(
    response: Response,
    settings: Annotated[Settings, Depends(get_settings)],
    hub: Annotated[StreamHub, Depends(get_hub)],
    aggregator: Annotated[TopologyAggregator, Depends(get_aggregator)],
) -> TopologySummary:
    """Return compact (< 2 KB) summary for immediate SSR / initial paint."""
    response.headers["Cache-Control"] = "max-age=2"
    mode = SourceMode.DEMO if settings.is_simulated else SourceMode.LIVE
    return aggregator.get_summary(mode=mode, active_scenario=hub.active_scenario_name)


@router.get(
    "/topology/snapshot",
    response_model=SnapshotResponse,
    summary="Topology snapshot with optional filtering",
    description="Acquire sequence-tagged snapshot of current vertices and directed edges.",
)
async def get_topology_snapshot(
    hub: Annotated[StreamHub, Depends(get_hub)],
    aggregator: Annotated[TopologyAggregator, Depends(get_aggregator)],
    kinds: Annotated[
        list[str] | None,
        Query(description="Filter by node kinds (supports repeated and comma-separated)"),
    ] = None,
    min_rps: Annotated[float | None, Query(ge=0.0, description="Minimum RPS filter")] = None,
    group: Annotated[str | None, Query(description="Service group identifier filter")] = None,
) -> SnapshotResponse:
    """Return filtered topology graph with monotonic server sequence tag."""
    parsed_kinds = _parse_kinds(kinds)
    latest_graph = aggregator.latest_graph
    filtered_graph = aggregator.filter_graph(
        latest_graph,
        kinds=parsed_kinds,
        min_rps=min_rps,
        group=group,
    )
    return SnapshotResponse(
        seq=hub.global_seq,
        graph=filtered_graph,
    )


@router.get(
    "/nodes/{node_id:path}",
    response_model=NodeDetail,
    summary="Deep Level-2 node disclosure",
    description=(
        "Retrieve full node telemetry, sockets, sparkline history, and adjacent neighbours."
    ),
)
async def get_node_detail(
    node_id: str,
    aggregator: Annotated[TopologyAggregator, Depends(get_aggregator)],
) -> NodeDetail:
    """Disclose detailed inspection payload for an entity vertex."""
    detail = aggregator.get_node_detail(node_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{node_id}' not found.",
        )
    return detail


@router.get(
    "/edges/{edge_id:path}",
    response_model=EdgeDetail,
    summary="Deep Level-2 edge disclosure",
    description="Retrieve full edge telemetry and sparkline ring-buffer history.",
)
async def get_edge_detail(
    edge_id: str,
    aggregator: Annotated[TopologyAggregator, Depends(get_aggregator)],
) -> EdgeDetail:
    """Disclose detailed inspection payload for a communication edge."""
    detail = aggregator.get_edge_detail(edge_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Edge '{edge_id}' not found.",
        )
    return detail
