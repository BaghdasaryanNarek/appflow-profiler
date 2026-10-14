"""Dependency injection providers and per-IP token-bucket rate limiting."""

from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, HTTPException, Request, status

from appflow.config import Settings
from appflow.config import get_settings as _config_get_settings

if TYPE_CHECKING:
    from appflow.sources.base import TopologySource
    from appflow.streaming.aggregator import TopologyAggregator
    from appflow.streaming.hub import StreamHub


class TokenBucketLimiter:
    """Thread/async-safe in-memory token-bucket rate limiter.

    Guarantees strict per-key capacity enforcement and predictable replenishment.
    State is encapsulated per instance (attached to app.state) preventing cross-test pollution.
    """

    def __init__(self, rate_per_second: float = 0.1, capacity: float = 1.0) -> None:
        self.rate_per_second = rate_per_second
        self.capacity = capacity
        self._buckets: dict[str, tuple[float, float]] = {}  # key -> (tokens, last_refill)
        self._lock = asyncio.Lock()

    async def acquire(self, key: str, cost: float = 1.0) -> tuple[bool, float]:
        """Attempt to acquire tokens for a given key.

        Returns:
            (True, 0.0) if allowed.
            (False, retry_after_seconds) if rate limit is exceeded.
        """
        async with self._lock:
            now = time.monotonic()
            tokens, last_refill = self._buckets.get(key, (self.capacity, now))

            # Replenish tokens based on elapsed duration
            elapsed = max(0.0, now - last_refill)
            tokens = min(self.capacity, tokens + (elapsed * self.rate_per_second))

            if tokens >= cost:
                tokens -= cost
                self._buckets[key] = (tokens, now)
                return True, 0.0

            needed = cost - tokens
            retry_after = (needed / self.rate_per_second) if self.rate_per_second > 0 else 1.0
            self._buckets[key] = (tokens, now)
            return False, retry_after

    async def reset(self) -> None:
        """Reset all rate limiter buckets."""
        async with self._lock:
            self._buckets.clear()


def get_settings(request: Request) -> Settings:
    """Retrieve application settings from app state or environment fallback."""
    settings = getattr(request.app.state, "settings", None)
    if isinstance(settings, Settings):
        return settings
    return _config_get_settings()


def get_source(request: Request) -> TopologySource:
    """Retrieve the telemetry source from app state."""
    source = getattr(request.app.state, "source", None)
    if source is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Telemetry source is not initialized.",
        )
    return source  # type: ignore[no-any-return]


def get_aggregator(request: Request) -> TopologyAggregator:
    """Retrieve the topology aggregator from app state."""
    aggregator = getattr(request.app.state, "aggregator", None)
    if aggregator is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Topology aggregator is not initialized.",
        )
    return aggregator  # type: ignore[no-any-return]


def get_hub(request: Request) -> StreamHub:
    """Retrieve the stream hub from app state."""
    hub = getattr(request.app.state, "hub", None)
    if hub is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Stream hub is not initialized.",
        )
    return hub  # type: ignore[no-any-return]


def get_hub_optional(request: Request) -> StreamHub | None:
    """Retrieve the stream hub from app state if available, or None."""
    hub: StreamHub | None = getattr(request.app.state, "hub", None)
    return hub


def get_scenario_limiter(request: Request) -> TokenBucketLimiter:
    """Retrieve or lazily initialize the per-app scenario rate limiter on app.state."""
    limiter = getattr(request.app.state, "scenario_limiter", None)
    if not isinstance(limiter, TokenBucketLimiter):
        # 1 request per 10 seconds (0.1 tokens/sec, capacity 1.0)
        limiter = TokenBucketLimiter(rate_per_second=0.1, capacity=1.0)
        request.app.state.scenario_limiter = limiter
    return limiter


def get_client_ip(request: Request) -> str:
    """Extract client IP address honoring standard reverse-proxy forwarded headers."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("x-real-ip")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


async def check_scenario_rate_limit(
    request: Request,
    limiter: Annotated[TokenBucketLimiter, Depends(get_scenario_limiter)],
) -> None:
    """Enforce 1 request per 10 seconds per client IP rate limiting on scenario activations."""
    ip = get_client_ip(request)
    allowed, retry_after = await limiter.acquire(ip)
    if not allowed:
        retry_seconds = max(1, int(retry_after + 0.99))
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Rate limit exceeded: scenario activations are restricted to 1 per 10 seconds. "
                f"Please retry after {retry_seconds}s."
            ),
            headers={"Retry-After": str(retry_seconds)},
        )
