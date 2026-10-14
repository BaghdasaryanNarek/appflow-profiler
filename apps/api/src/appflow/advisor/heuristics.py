"""Deterministic rule-based heuristic advisor fallback (Master Plan §4.4, §7 Phase 8)."""

from collections import Counter
from datetime import UTC, datetime

from appflow.advisor.digest import TopologyDigest
from appflow.advisor.models import (
    Bottleneck,
    OptimizationReport,
    Recommendation,
    RecommendationCategory,
)


def generate_heuristic_report(
    digest: TopologyDigest,
    focus: str | None = None,
) -> OptimizationReport:
    """Generate deterministic architectural recommendations using empirical heuristics.

    Evaluates:
      1. capacity: saturation > 0.85 or cpu > 85%
      2. connection_pooling: open_connections > 200 or connection_count > 100
      3. retry_policy: edge retry_rate > 0.1 (10%)
      4. caching: read-heavy data stores with high RPS or elevated latency
      5. topology: outgoing fan-out > 5
      6. timeouts: p99_ms > 250ms
    """
    bottlenecks: list[Bottleneck] = []
    recommendations: list[Recommendation] = []
    effective_focus = (focus or digest.focus or "").lower()

    # Calculate fan-out per node from hot_edges
    source_counts = Counter(e.source for e in digest.hot_edges)

    # 1. Capacity rule (saturation > 0.85 or cpu_percent > 85.0)
    for node in digest.hot_nodes:
        if node.saturation > 0.85 or node.cpu_percent > 85.0 or "capacity" in effective_focus:
            evidence = []
            if node.saturation > 0.85:
                evidence.append(f"saturation {node.saturation:.2f} > 0.85")
            if node.cpu_percent > 85.0:
                evidence.append(f"cpu utilization {node.cpu_percent:.1f}%")
            if not evidence:
                evidence.append("proactive capacity evaluation")

            bottlenecks.append(
                Bottleneck(
                    node_id=node.id,
                    title=f"CPU and execution queue saturation on {node.label}",
                    severity="high" if node.saturation > 0.90 else "medium",
                    evidence=evidence,
                )
            )
            recommendations.append(
                Recommendation(
                    id=f"rec-cap-{node.id}",
                    title=f"Scale horizontal replicas or CPU allocation for {node.label}",
                    category=RecommendationCategory.CAPACITY,
                    priority=1 if node.saturation > 0.90 else 2,
                    rationale=(
                        f"Node {node.label} exhibits sustained saturation ({node.saturation:.1%}), "
                        "exhausting available workers and elongating queue wait times."
                    ),
                    expected_impact=(
                        "Distributes concurrency across additional cores, eliminating backlog "
                        "and reducing p99 tail latency."
                    ),
                    affected_node_ids=[node.id],
                    effort="M",
                )
            )

    # 2. Connection pooling rule (open_connections > 200 or edge connection_count > 100)
    for node in digest.hot_nodes:
        if (
            node.open_connections > 200
            or "pooling" in effective_focus
            or "connection" in effective_focus
        ):
            bottlenecks.append(
                Bottleneck(
                    node_id=node.id,
                    title=f"High concurrent connection pressure on {node.label}",
                    severity="medium",
                    evidence=[f"open_connections {node.open_connections} elevated"],
                )
            )
            recommendations.append(
                Recommendation(
                    id=f"rec-pool-{node.id}",
                    title=f"Enforce persistent connection pooling on {node.label}",
                    category=RecommendationCategory.CONNECTION_POOLING,
                    priority=2,
                    rationale=(
                        f"Observed connection count ({node.open_connections}) indicates frequent "
                        "connection churn. Establishing a bounded client pool reuses TCP handles."
                    ),
                    expected_impact=(
                        "Reduces TLS handshake cost, prevents socket exhaustion, and stabilizes "
                        "memory footprint."
                    ),
                    affected_node_ids=[node.id],
                    effort="S",
                )
            )

    # 3. Retry policy rule (edge retry_rate > 0.10)
    for edge in digest.hot_edges:
        if edge.retry_rate > 0.10 or "retry" in effective_focus:
            bottlenecks.append(
                Bottleneck(
                    node_id=edge.target,
                    title=f"Elevated retry storm propagating from {edge.source} to {edge.target}",
                    severity="high" if edge.retry_rate > 0.25 else "medium",
                    evidence=[
                        f"retry_rate {edge.retry_rate:.2%} > 10.0%",
                        f"error_rate {edge.error_rate:.2%}",
                    ],
                )
            )
            recommendations.append(
                Recommendation(
                    id=f"rec-retry-{edge.id}",
                    title=(
                        f"Implement exponential backoff with full jitter on {edge.source} -> "
                        f"{edge.target}"
                    ),
                    category=RecommendationCategory.RETRY_POLICY,
                    priority=2,
                    rationale=(
                        f"Retry rate of {edge.retry_rate:.1%} amplifies downstream congestion. "
                        "Unjittered retry bursts exacerbate service degradation."
                    ),
                    expected_impact=(
                        "Desynchronizes retransmissions, prevents cascading brownouts, and "
                        "preserves downstream capacity during recovery."
                    ),
                    affected_node_ids=[edge.source, edge.target],
                    effort="S",
                )
            )

    # 4. Caching rule (data stores with rps > 30 or latency > 100ms)
    for node in digest.hot_nodes:
        is_datastore = node.kind in ("database", "external") or "db" in node.label.lower()
        if (
            (is_datastore and (node.rps > 30.0 or node.p99_ms > 100.0))
            or "cache" in effective_focus
            or "caching" in effective_focus
        ):
            bottlenecks.append(
                Bottleneck(
                    node_id=node.id,
                    title=f"Read query amplification on backend store {node.label}",
                    severity="medium",
                    evidence=[
                        f"throughput {node.rps:.1f} rps",
                        f"p99 latency {node.p99_ms:.1f}ms",
                    ],
                )
            )
            recommendations.append(
                Recommendation(
                    id=f"rec-cache-{node.id}",
                    title=f"Introduce cache-aside layer in front of {node.label}",
                    category=RecommendationCategory.CACHING,
                    priority=3,
                    rationale=(
                        f"Backend store {node.label} handles sustained load ({node.rps:.1f} rps). "
                        "Caches for hot query results absorb repetitive lookups."
                    ),
                    expected_impact=(
                        "Offloads up to 80% of repetitive reads from the primary store, "
                        "lowering tail latency."
                    ),
                    affected_node_ids=[node.id],
                    effort="M",
                )
            )

    # 5. Topology fan-out rule (outgoing fan-out > 5)
    for node_id, count in source_counts.items():
        if count > 5 or "topology" in effective_focus or "fanout" in effective_focus:
            label = next((n.label for n in digest.hot_nodes if n.id == node_id), node_id)
            bottlenecks.append(
                Bottleneck(
                    node_id=node_id,
                    title=f"Synchronous high fan-out coupling on {label}",
                    severity="medium",
                    evidence=[f"synchronous outgoing edges count {count} > 5"],
                )
            )
            recommendations.append(
                Recommendation(
                    id=f"rec-topo-{node_id}",
                    title=f"Decouple synchronous fan-out via message bus on {label}",
                    category=RecommendationCategory.TOPOLOGY,
                    priority=3,
                    rationale=(
                        f"Entity {label} fans out synchronously to {count} downstream targets. "
                        "Latency variance and blast radius compound multiplicatively across "
                        "dependencies."
                    ),
                    expected_impact=(
                        "Isolates failure domains and decouples request latency from slowest "
                        "downstream dependency."
                    ),
                    affected_node_ids=[node_id],
                    effort="L",
                )
            )

    # 6. Timeouts & deadlines rule (p99_ms > 250ms)
    for node in digest.hot_nodes:
        if node.p99_ms > 250.0 or "timeout" in effective_focus:
            bottlenecks.append(
                Bottleneck(
                    node_id=node.id,
                    title=f"Tail latency SLA breach on {node.label}",
                    severity="high" if node.p99_ms > 1000.0 else "medium",
                    evidence=[f"p99_ms {node.p99_ms:.1f}ms > 250ms threshold"],
                )
            )
            recommendations.append(
                Recommendation(
                    id=f"rec-timeout-{node.id}",
                    title=(
                        f"Calibrate RPC deadlines and circuit breaker thresholds for {node.label}"
                    ),
                    category=RecommendationCategory.TIMEOUTS,
                    priority=2,
                    rationale=(
                        f"Observed p99 latency of {node.p99_ms:.1f}ms indicates slow chains. "
                        "Enforcing tight client deadlines prevents worker starvation."
                    ),
                    expected_impact=(
                        "Fails fast under degraded conditions and prevents latency propagation "
                        "to edge callers."
                    ),
                    affected_node_ids=[node.id],
                    effort="S",
                )
            )

    # Deduplicate bottlenecks and recommendations by key
    unique_bottlenecks: list[Bottleneck] = []
    seen_b_keys: set[tuple[str, str]] = set()
    for b in bottlenecks:
        key = (b.node_id, b.title)
        if key not in seen_b_keys:
            seen_b_keys.add(key)
            unique_bottlenecks.append(b)

    unique_recommendations: list[Recommendation] = []
    seen_r_ids: set[str] = set()
    for r in recommendations:
        if r.id not in seen_r_ids:
            seen_r_ids.add(r.id)
            unique_recommendations.append(r)

    # Build executive summary (<= 600 chars)
    if unique_bottlenecks:
        summary = (
            f"Evaluated topology digest. Identified {len(unique_bottlenecks)} architectural "
            f"bottlenecks and generated {len(unique_recommendations)} actionable recommendations. "
            f"Primary constraint: {unique_bottlenecks[0].title}."
        )
    else:
        summary = (
            "Infrastructure topology is operating within established baseline SLOs. "
            "No critical saturation, retry storms, or excessive latency outliers detected across "
            "monitored entities."
        )

    if len(summary) > 600:
        summary = summary[:597] + "..."

    caveats = [
        "Analysis generated by deterministic rule engine evaluating rolling telemetry digest.",
        "Recommendations should be validated against staging environment profiles before rollout.",
    ]

    return OptimizationReport(
        report_id=f"rep-heur-{digest.digest_hash[:8]}",
        source="heuristic",
        digest_hash=digest.digest_hash,
        summary=summary,
        generated_at=datetime.now(UTC),
        model=None,
        bottlenecks=unique_bottlenecks,
        recommendations=unique_recommendations,
        caveats=caveats,
    )
