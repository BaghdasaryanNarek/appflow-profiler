"""Liveness and readiness probes."""

from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from appflow.api.deps import get_hub_optional
from appflow.api.errors import problem_response
from appflow.streaming.hub import StreamHub

router = APIRouter(tags=["health"])


class LivenessResponse(BaseModel):
    status: Literal["ok"] = "ok"


class ReadinessResponse(BaseModel):
    status: Literal["ok", "starting", "stalled"]
    source_ready: bool
    tick_age_ms: int | None


@router.get("/healthz", response_model=LivenessResponse, summary="Liveness probe")
async def healthz() -> LivenessResponse:
    """Return 200 while the process is able to serve HTTP."""
    return LivenessResponse()


@router.get(
    "/readyz",
    response_model=ReadinessResponse,
    responses={
        200: {"model": ReadinessResponse},
        503: {"description": "Tick loop not ready or stalled"},
    },
    summary="Readiness probe",
)
async def readyz(
    request: Request,
    hub: Annotated[StreamHub | None, Depends(get_hub_optional)] = None,
) -> ReadinessResponse | JSONResponse:
    """Report readiness based on stream hub tick freshness.

    Returns HTTP 200 when the tick loop has produced a sample within the last 5 seconds.
    Returns HTTP 503 problem+json when the loop is stalled (> 5000 ms) or uninitialized.
    """
    if hub is None or hub.tick_age_ms is None:
        return problem_response(
            status=503,
            detail="Stream hub tick loop is starting; no samples aggregated yet.",
            instance=request.url.path,
            readiness_status="starting",
            source_ready=False,
            tick_age_ms=None,
        )

    age = hub.tick_age_ms
    if age > 5000:
        return problem_response(
            status=503,
            detail=f"Stream hub tick loop is stalled (tick age {age}ms exceeds 5000ms threshold).",
            instance=request.url.path,
            readiness_status="stalled",
            source_ready=False,
            tick_age_ms=age,
        )

    return ReadinessResponse(status="ok", source_ready=True, tick_age_ms=age)
