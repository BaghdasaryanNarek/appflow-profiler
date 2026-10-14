"""Topology digest synthesis for LLM grounding and cache indexing (Master Plan §4.4)."""

import hashlib
import json
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from appflow.domain.enums import HealthStatus
from appflow.domain.models import FROZEN_MODEL_CONFIG, TopologyGraph

MAX_DIGEST_BYTES = 6144


class DigestTotals(BaseModel):
    """Fleet-wide metric rollups summarizing topology scale and aggregate health."""

    model_config = FROZEN_MODEL_CONFIG

    node_count: Annotated[int, Field(ge=0, description="Total active nodes")]
    edge_count: Annotated[int, Field(ge=0, description="Total active edges")]
    total_rps: Annotated[float, Field(ge=0.0, description="Aggregate request rate")]
    avg_p99_ms: Annotated[float, Field(ge=0.0, description="Average 99th percentile latency")]
    avg_error_rate: Annotated[float, Field(ge=0.0, le=1.0, description="Average error fraction")]
    critical_count: Annotated[int, Field(ge=0, description="Count of critical entities")]
    degraded_count: Annotated[int, Field(ge=0, description="Count of degraded entities")]


class DigestNode(BaseModel):
    """High-signal entity summary prioritized for architectural analysis."""

    model_config = FROZEN_MODEL_CONFIG

    id: str
    label: str
    kind: str
    health: str
    rps: float
    p50_ms: float
    p99_ms: float
    error_rate: float
    saturation: float
    cpu_percent: float
    open_connections: int
    health_reasons: list[str] = Field(default_factory=list)


class DigestEdge(BaseModel):
    """High-signal interconnect summary prioritized for network analysis."""

    model_config = FROZEN_MODEL_CONFIG

    id: str
    source: str
    target: str
    protocol: str
    health: str
    rps: float
    p99_ms: float
    error_rate: float
    retry_rate: float
    connection_count: int


class TopologyDigest(BaseModel):
    """Compact, deterministic digest bounded to <= 6 KB for LLM prompting and cache indexing."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    scope: Annotated[str, Field(description="Analysis scope ('global' or specific node_id)")]
    focus: Annotated[str | None, Field(default=None, description="Targeted focus area")]
    active_scenario: Annotated[
        str | None, Field(default=None, description="Active simulation scenario name")
    ]
    totals: DigestTotals
    hot_nodes: list[DigestNode] = Field(default_factory=list)
    hot_edges: list[DigestEdge] = Field(default_factory=list)
    known_node_ids: list[str] = Field(
        default_factory=list, description="Grounding reference set of valid node IDs"
    )
    digest_hash: Annotated[
        str, Field(description="Deterministic SHA-256 fingerprint of the digest content")
    ]


def _node_priority_score(node: DigestNode) -> tuple[int, float, float, float]:
    """Sort priority: critical > degraded > healthy, then saturation, error rate, RPS."""
    health_rank = 0
    if node.health == HealthStatus.CRITICAL.value:
        health_rank = 2
    elif node.health == HealthStatus.DEGRADED.value:
        health_rank = 1
    return (health_rank, node.saturation, node.error_rate, node.rps)


def _edge_priority_score(edge: DigestEdge) -> tuple[int, float, float, float]:
    """Sort priority: critical > degraded > healthy, then retry rate, error rate, RPS."""
    health_rank = 0
    if edge.health == HealthStatus.CRITICAL.value:
        health_rank = 2
    elif edge.health == HealthStatus.DEGRADED.value:
        health_rank = 1
    return (health_rank, edge.retry_rate, edge.error_rate, edge.rps)


def _serialize_for_hash(
    scope: str,
    focus: str | None,
    active_scenario: str | None,
    totals: DigestTotals,
    hot_nodes: list[DigestNode],
    hot_edges: list[DigestEdge],
    known_node_ids: list[str],
) -> tuple[str, bytes]:
    """Produce deterministic canonical JSON and bytes for hashing and size enforcement."""
    payload = {
        "scope": scope,
        "focus": focus,
        "active_scenario": active_scenario,
        "totals": totals.model_dump(mode="json"),
        "hot_nodes": [n.model_dump(mode="json") for n in hot_nodes],
        "hot_edges": [e.model_dump(mode="json") for e in hot_edges],
        "known_node_ids": known_node_ids,
    }
    canonical_json = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return canonical_json, canonical_json.encode("utf-8")


def build_digest(
    graph: TopologyGraph,
    scope: str = "global",
    focus: str | None = None,
    active_scenario: str | None = None,
    top_k: int = 15,
) -> TopologyDigest:
    """Extract a high-signal, deterministic <= 6 KB topology digest from the full graph.

    Raises:
        KeyError: If scope != 'global' and the specified node_id does not exist in the graph.
    """
    all_node_map = {n.id: n for n in graph.nodes}

    if scope != "global" and scope not in all_node_map:
        raise KeyError(f"Node '{scope}' not found in topology graph")

    if scope == "global":
        candidate_nodes = list(graph.nodes)
        candidate_edges = list(graph.edges)
    else:
        # Focused neighborhood scope: target node, incident edges and 1-hop neighbours
        target_node = all_node_map[scope]
        incident_edges = [e for e in graph.edges if e.source == scope or e.target == scope]
        neighbor_ids = {e.source for e in incident_edges} | {e.target for e in incident_edges}
        candidate_nodes = [all_node_map[nid] for nid in neighbor_ids if nid in all_node_map]
        if target_node not in candidate_nodes:
            candidate_nodes.append(target_node)
        candidate_edges = incident_edges

    # Compute totals
    node_count = len(candidate_nodes)
    edge_count = len(candidate_edges)
    total_rps = round(sum(n.metrics.rps for n in candidate_nodes), 2)
    avg_p99 = (
        round(sum(n.metrics.p99_ms for n in candidate_nodes) / node_count, 2)
        if node_count > 0
        else 0.0
    )
    avg_err = (
        round(sum(n.metrics.error_rate for n in candidate_nodes) / node_count, 4)
        if node_count > 0
        else 0.0
    )
    critical_count = sum(1 for n in candidate_nodes if n.health == HealthStatus.CRITICAL) + sum(
        1 for e in candidate_edges if e.health == HealthStatus.CRITICAL
    )
    degraded_count = sum(1 for n in candidate_nodes if n.health == HealthStatus.DEGRADED) + sum(
        1 for e in candidate_edges if e.health == HealthStatus.DEGRADED
    )

    totals = DigestTotals(
        node_count=node_count,
        edge_count=edge_count,
        total_rps=total_rps,
        avg_p99_ms=avg_p99,
        avg_error_rate=avg_err,
        critical_count=critical_count,
        degraded_count=degraded_count,
    )

    # Convert candidates to digest models
    digest_nodes = [
        DigestNode(
            id=n.id,
            label=n.label,
            kind=n.kind.value,
            health=n.health.value,
            rps=round(n.metrics.rps, 2),
            p50_ms=round(n.metrics.p50_ms, 2),
            p99_ms=round(n.metrics.p99_ms, 2),
            error_rate=round(n.metrics.error_rate, 4),
            saturation=round(n.metrics.saturation, 4),
            cpu_percent=round(n.metrics.cpu_percent, 2),
            open_connections=n.metrics.open_connections,
            health_reasons=n.health_reasons,
        )
        for n in candidate_nodes
    ]

    digest_edges = [
        DigestEdge(
            id=e.id,
            source=e.source,
            target=e.target,
            protocol=e.protocol.value,
            health=e.health.value,
            rps=round(e.metrics.rps, 2),
            p99_ms=round(e.metrics.p99_ms, 2),
            error_rate=round(e.metrics.error_rate, 4),
            retry_rate=round(e.metrics.retry_rate, 4),
            connection_count=e.metrics.connection_count,
        )
        for e in candidate_edges
    ]

    # Prioritize and rank
    digest_nodes.sort(key=_node_priority_score, reverse=True)
    digest_edges.sort(key=_edge_priority_score, reverse=True)

    def _candidate_slice(
        k: int,
    ) -> tuple[list[DigestNode], list[DigestEdge], list[str], bytes]:
        nodes_k = digest_nodes[:k]
        edges_k = digest_edges[:k]
        node_ids_k = sorted(
            {n.id for n in nodes_k} | {e.source for e in edges_k} | {e.target for e in edges_k}
        )
        _, raw = _serialize_for_hash(
            scope, focus, active_scenario, totals, nodes_k, edges_k, node_ids_k
        )
        return nodes_k, edges_k, node_ids_k, raw

    curr_k = min(top_k, max(len(digest_nodes), len(digest_edges), 1))
    selected_nodes, selected_edges, digest_node_ids, raw_bytes = _candidate_slice(curr_k)

    # Enforce <= 6 KB ceiling factoring in digest_hash and json formatting overhead
    while len(raw_bytes) > (MAX_DIGEST_BYTES - 800) and curr_k > 1:
        curr_k -= 1
        selected_nodes, selected_edges, digest_node_ids, raw_bytes = _candidate_slice(curr_k)

    digest_hash = hashlib.sha256(raw_bytes).hexdigest()

    return TopologyDigest(
        scope=scope,
        focus=focus,
        active_scenario=active_scenario,
        totals=totals,
        hot_nodes=selected_nodes,
        hot_edges=selected_edges,
        known_node_ids=digest_node_ids,
        digest_hash=digest_hash,
    )
