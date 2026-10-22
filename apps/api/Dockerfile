# syntax=docker/dockerfile:1
# ==============================================================================
# Stage 1: Deterministic dependency & package builder via astral-sh/uv
# ==============================================================================
FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.6.10 /uv /uvx /bin/

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

COPY pyproject.toml uv.lock README.md ./
COPY src ./src

RUN uv sync --frozen --no-dev --no-editable

# ==============================================================================
# Stage 2: Minimal non-root production runtime image (Master Plan §5.5, §6.4)
# ==============================================================================
FROM python:3.12-slim AS runtime

RUN groupadd --gid 10001 appflow && \
    useradd --uid 10001 --gid appflow --shell /sbin/nologin --create-home appflow

WORKDIR /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONPATH="/app/src" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ENV="demo" \
    SIM_AUTOPLAY="true" \
    TICK_MS="1000" \
    PORT="8000"

COPY --from=builder --chown=appflow:appflow /app/.venv /app/.venv
COPY --from=builder --chown=appflow:appflow /app/src /app/src

USER appflow

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD python -c "import os, urllib.request; port = os.environ.get('PORT', '8000'); urllib.request.urlopen(f'http://127.0.0.1:{port}/healthz', timeout=3)"

CMD ["sh", "-c", "exec uvicorn appflow.main:create_app --factory --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --ws-ping-interval 20 --workers 1"]
