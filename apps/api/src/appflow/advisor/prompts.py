"""Prompts and system instructions for the LLM Optimization Advisor (Master Plan §4.4)."""

import json
from typing import Any

from appflow.advisor.digest import TopologyDigest

SYSTEM_INSTRUCTION = """\
You are a Principal Site Reliability Engineer (SRE) and Distributed Systems Performance Architect.
Your role is to analyze network topology telemetry digests, diagnose architectural bottlenecks,
and deliver prioritized, actionable optimization recommendations.

Strict Operational Guidelines:
1. Grounding: Ground every bottleneck and recommendation directly in observable telemetry metrics \
present in the topology digest (RPS, p99 latency, error rate, saturation, retry rate, connections).
2. Entity Integrity: Reference node IDs EXACTLY as they appear in the digest (e.g., 'proc-1234', \
'ext-db-orders'). NEVER hallucinate, invent, or extrapolate node IDs not present in the digest.
3. No Speculation: Do not speculate beyond the provided metrics. If data is limited or absent, \
explicitly note it under 'caveats'.
4. Domain Focus: Use strict DevOps, SRE, and performance profiling terminology (e.g., capacity \
planning, connection pooling, jittered exponential backoff, cache-aside, deadline propagation, \
RPC timeouts, circuit breakers). Zero mentions of cybersecurity or defensive operations.
5. Structured Output: Produce an OptimizationReport adhering strictly to the required JSON schema.
"""


def build_analysis_user_prompt(digest: TopologyDigest, focus: str | None = None) -> str:
    """Format user prompt embedding the serialized topology digest and operational focus."""
    prompt_payload: dict[str, Any] = {
        "scope": digest.scope,
        "focus": focus or digest.focus,
        "active_scenario": digest.active_scenario,
        "totals": digest.totals.model_dump(mode="json"),
        "hot_nodes": [n.model_dump(mode="json") for n in digest.hot_nodes],
        "hot_edges": [e.model_dump(mode="json") for e in digest.hot_edges],
        "known_node_ids": digest.known_node_ids,
    }

    digest_json = json.dumps(prompt_payload, indent=2)

    return (
        f"Perform an architectural optimization review on the following telemetry digest.\n\n"
        f"Digest Hash: {digest.digest_hash}\n"
        f"Analysis Scope: {digest.scope}\n"
        f"Target Focus: {focus or digest.focus or 'General Performance & Reliability'}\n\n"
        f"```json\n{digest_json}\n```\n\n"
        "Provide a comprehensive OptimizationReport covering:\n"
        "- High-level executive summary (<= 600 characters)\n"
        "- Critical bottlenecks with concrete metric evidence\n"
        "- Actionable recommendations (capacity, pooling, caching, retries, topology, timeouts)\n"
        "- Telemetry caveats and blindspots\n"
    )
