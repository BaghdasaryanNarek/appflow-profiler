"""Advisor service managing digest synthesis, caching, grounding guards, and LLM orchestration."""

import asyncio
import time

import structlog

from appflow.advisor.digest import TopologyDigest, build_digest
from appflow.advisor.gemini_client import GeminiAdvisorClient
from appflow.advisor.heuristics import generate_heuristic_report
from appflow.advisor.models import OptimizationReport, Recommendation
from appflow.domain.models import TopologyGraph

logger = structlog.get_logger(__name__)


class AdvisorService:
    """Coordinates digest extraction, 60s TTL cache, LLM execution, and heuristic fallback."""

    def __init__(
        self,
        client: GeminiAdvisorClient | None = None,
        cache_ttl_s: float = 60.0,
    ) -> None:
        self._client = client
        self._cache_ttl_s = cache_ttl_s
        self._cache: dict[str, tuple[OptimizationReport, float]] = {}  # hash -> (report, mono_time)
        self._lock = asyncio.Lock()

    @property
    def client(self) -> GeminiAdvisorClient | None:
        """Attached Gemini client or None."""
        return self._client

    def apply_grounding_guard(
        self,
        report: OptimizationReport,
        digest: TopologyDigest,
    ) -> OptimizationReport:
        """Sanitize report by stripping hallucinated node IDs and ungrounded claims.

        Drops any affected_node_ids not present in the digest known set.
        Purges recommendations or bottlenecks that become completely ungrounded.
        """
        valid_ids = set(digest.known_node_ids) | {n.id for n in digest.hot_nodes}

        # Filter bottlenecks referencing non-existent nodes
        sanitized_bottlenecks = [b for b in report.bottlenecks if b.node_id in valid_ids]

        # Filter and sanitize recommendations
        sanitized_recommendations: list[Recommendation] = []
        for rec in report.recommendations:
            valid_affected = [nid for nid in rec.affected_node_ids if nid in valid_ids]
            if not valid_affected:
                # Completely ungrounded recommendation - purge
                logger.info(
                    "advisor.grounding_guard.purged_recommendation",
                    rec_id=rec.id,
                    dropped_ids=rec.affected_node_ids,
                )
                continue

            if len(valid_affected) != len(rec.affected_node_ids):
                logger.info(
                    "advisor.grounding_guard.pruned_node_ids",
                    rec_id=rec.id,
                    pruned_ids=list(set(rec.affected_node_ids) - set(valid_affected)),
                )
                rec = rec.model_copy(update={"affected_node_ids": valid_affected})

            sanitized_recommendations.append(rec)

        return report.model_copy(
            update={
                "bottlenecks": sanitized_bottlenecks,
                "recommendations": sanitized_recommendations,
            }
        )

    async def analyze(
        self,
        graph: TopologyGraph,
        scope: str = "global",
        focus: str | None = None,
        active_scenario: str | None = None,
    ) -> OptimizationReport:
        """Produce an architectural optimization report for the given topology snapshot.

        Raises:
            KeyError: If scope != 'global' and node_id is unknown in the graph.
        """
        digest = build_digest(
            graph,
            scope=scope,
            focus=focus,
            active_scenario=active_scenario,
        )

        # 1. Check cache by digest_hash
        now = time.monotonic()
        async with self._lock:
            cached_entry = self._cache.get(digest.digest_hash)
            if cached_entry:
                cached_report, cached_at = cached_entry
                if now - cached_at < self._cache_ttl_s:
                    logger.info(
                        "advisor.cache.hit",
                        digest_hash=digest.digest_hash[:8],
                        age_s=round(now - cached_at, 2),
                    )
                    return cached_report

        # 2. Execute via Gemini if configured, otherwise fallback to heuristics
        report: OptimizationReport | None = None

        if self._client and self._client.is_configured:
            try:
                raw_report = await self._client.analyze(digest, focus=focus)
                grounded_report = self.apply_grounding_guard(raw_report, digest)

                # If the LLM output was completely stripped by grounding, fallback
                if (
                    raw_report.recommendations
                    and not grounded_report.recommendations
                    and not grounded_report.bottlenecks
                ):
                    logger.warning(
                        "advisor.grounding_guard.all_purged_fallback",
                        digest_hash=digest.digest_hash[:8],
                    )
                    report = generate_heuristic_report(digest, focus=focus)
                else:
                    report = grounded_report
            except Exception as exc:
                logger.warning(
                    "advisor.llm_failed_fallback_to_heuristic",
                    error=str(exc),
                    digest_hash=digest.digest_hash[:8],
                )
                report = generate_heuristic_report(digest, focus=focus)
        else:
            logger.info(
                "advisor.unconfigured_fallback_to_heuristic",
                digest_hash=digest.digest_hash[:8],
            )
            report = generate_heuristic_report(digest, focus=focus)

        # 3. Store result in 60s TTL cache
        async with self._lock:
            self._cache[digest.digest_hash] = (report, time.monotonic())
            # Evict stale entries if cache grows
            if len(self._cache) > 100:
                expired_keys = [
                    k for k, (_, ts) in self._cache.items() if now - ts >= self._cache_ttl_s
                ]
                for k in expired_keys:
                    self._cache.pop(k, None)

        return report

    async def clear_cache(self) -> None:
        """Clear the in-memory digest report cache."""
        async with self._lock:
            self._cache.clear()
