"""Optimization Advisor intelligence module: digests, heuristics and LLM reporting."""

from appflow.advisor.digest import (
    DigestEdge,
    DigestNode,
    DigestTotals,
    TopologyDigest,
    build_digest,
)
from appflow.advisor.gemini_client import GeminiAdvisorClient, GeminiAdvisorError
from appflow.advisor.heuristics import generate_heuristic_report
from appflow.advisor.models import (
    AnalyzeRequest,
    Bottleneck,
    OptimizationReport,
    Recommendation,
    RecommendationCategory,
)
from appflow.advisor.prompts import SYSTEM_INSTRUCTION, build_analysis_user_prompt
from appflow.advisor.service import AdvisorService

__all__ = [
    "SYSTEM_INSTRUCTION",
    "AdvisorService",
    "AnalyzeRequest",
    "Bottleneck",
    "DigestEdge",
    "DigestNode",
    "DigestTotals",
    "GeminiAdvisorClient",
    "GeminiAdvisorError",
    "OptimizationReport",
    "Recommendation",
    "RecommendationCategory",
    "TopologyDigest",
    "build_analysis_user_prompt",
    "build_digest",
    "generate_heuristic_report",
]
