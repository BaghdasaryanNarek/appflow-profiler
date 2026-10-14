"""Optimization Advisor intelligence module: digests, heuristics and LLM reporting."""

from appflow.advisor.digest import (
    DigestEdge,
    DigestNode,
    DigestTotals,
    TopologyDigest,
    build_digest,
)
from appflow.advisor.heuristics import generate_heuristic_report
from appflow.advisor.models import (
    AnalyzeRequest,
    Bottleneck,
    OptimizationReport,
    Recommendation,
    RecommendationCategory,
)

__all__ = [
    "AnalyzeRequest",
    "Bottleneck",
    "DigestEdge",
    "DigestNode",
    "DigestTotals",
    "OptimizationReport",
    "Recommendation",
    "RecommendationCategory",
    "TopologyDigest",
    "build_digest",
    "generate_heuristic_report",
]
