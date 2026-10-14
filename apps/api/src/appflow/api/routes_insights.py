"""Optimization Advisor insights endpoints (Master Plan §4.4)."""

from typing import Annotated

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from appflow.advisor.models import AnalyzeRequest, OptimizationReport
from appflow.advisor.service import AdvisorService
from appflow.api.deps import (
    check_insights_rate_limit,
    get_advisor_service,
    get_aggregator,
    get_hub_optional,
)
from appflow.streaming.aggregator import TopologyAggregator
from appflow.streaming.hub import StreamHub

logger = structlog.get_logger(__name__)

router = APIRouter(prefix="/api/v1/insights", tags=["insights"])


@router.post(
    "/analyze",
    response_model=OptimizationReport,
    summary="Generate architectural optimization recommendations",
    description=(
        "Synthesizes a compact topology digest and executes an LLM review with grounding guard "
        "and deterministic heuristic fallback. Cached by digest hash for 60 seconds; "
        "rate-limited to 5 requests per minute per IP."
    ),
    dependencies=[Depends(check_insights_rate_limit)],
)
async def analyze_topology(
    body: AnalyzeRequest,
    aggregator: Annotated[TopologyAggregator, Depends(get_aggregator)],
    advisor: Annotated[AdvisorService, Depends(get_advisor_service)],
    hub: Annotated[StreamHub | None, Depends(get_hub_optional)] = None,
) -> OptimizationReport:
    """Analyze current topology snapshot and deliver prioritized recommendations."""
    graph = aggregator.latest_graph
    if not graph or not graph.nodes:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Topology graph is not yet initialized or contains no active nodes.",
        )

    active_scenario = hub.active_scenario_name if hub else None

    try:
        return await advisor.analyze(
            graph=graph,
            scope=body.scope,
            focus=body.focus,
            active_scenario=active_scenario,
        )
    except KeyError as exc:
        logger.info(
            "insights.analyze.node_not_found",
            scope=body.scope,
            error=str(exc),
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Node '{body.scope}' not found in active topology graph.",
        ) from exc
