"""RFC 9457 ``application/problem+json`` error responses."""

from http import HTTPStatus

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict
from starlette.exceptions import HTTPException as StarletteHTTPException

from appflow.logging import get_logger

PROBLEM_JSON = "application/problem+json"

_log = get_logger(__name__)


class ProblemDetail(BaseModel):
    """Problem Details object (RFC 9457)."""

    model_config = ConfigDict(extra="allow")

    type: str = "about:blank"
    title: str
    status: int
    detail: str | None = None
    instance: str | None = None


def problem_response(
    status: int,
    *,
    detail: str | None = None,
    instance: str | None = None,
    title: str | None = None,
    **extensions: object,
) -> JSONResponse:
    """Build a problem+json response; ``title`` defaults to the standard HTTP reason phrase."""
    problem = ProblemDetail.model_validate(
        {
            "title": title or HTTPStatus(status).phrase,
            "status": status,
            "detail": detail,
            "instance": instance,
            **extensions,
        }
    )
    return JSONResponse(
        status_code=status,
        content=jsonable_encoder(problem, exclude_none=True),
        media_type=PROBLEM_JSON,
    )


async def _http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)
    detail = exc.detail if isinstance(exc.detail, str) else None
    return problem_response(exc.status_code, detail=detail, instance=request.url.path)


async def _validation_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)
    return problem_response(
        HTTPStatus.UNPROCESSABLE_ENTITY,
        detail="Request validation failed.",
        instance=request.url.path,
        errors=jsonable_encoder(exc.errors()),
    )


async def _unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    _log.exception("unhandled_exception", path=request.url.path, error=type(exc).__name__)
    return problem_response(
        HTTPStatus.INTERNAL_SERVER_ERROR,
        detail="An unexpected error occurred.",
        instance=request.url.path,
    )


def register_error_handlers(app: FastAPI) -> None:
    """Install problem+json handlers for HTTP, validation and unexpected errors."""
    app.add_exception_handler(StarletteHTTPException, _http_exception_handler)
    app.add_exception_handler(RequestValidationError, _validation_exception_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)
