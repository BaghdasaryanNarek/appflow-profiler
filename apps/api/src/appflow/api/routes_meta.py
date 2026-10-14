"""Engine metadata and capability negotiation endpoints."""

from typing import Annotated

from fastapi import APIRouter, Depends

from appflow.api.deps import get_hub
from appflow.domain.models import MetaResponse
from appflow.streaming.hub import StreamHub

router = APIRouter(prefix="/api/v1", tags=["meta"])


@router.get(
    "/meta",
    response_model=MetaResponse,
    summary="Engine metadata and capability declaration",
    description=(
        "Declares server version, source mode, tick interval, capabilities and limits "
        "for UI adaptation."
    ),
)
async def get_meta(
    hub: Annotated[StreamHub, Depends(get_hub)],
) -> MetaResponse:
    """Return runtime metadata and feature capability flags."""
    return hub.get_meta()
