"""Liveness and readiness probes."""

from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel

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


@router.get("/readyz", response_model=ReadinessResponse, summary="Readiness probe")
async def readyz() -> ReadinessResponse:
    """Report readiness.

    Stub until the stream hub lands (Phase 6/7): it will then report tick freshness and
    return 503 when the tick loop has stalled for more than 5 seconds.
    """
    return ReadinessResponse(status="starting", source_ready=False, tick_age_ms=None)
