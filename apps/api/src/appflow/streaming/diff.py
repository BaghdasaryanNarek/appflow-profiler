"""Epsilon-based topology differential engine (Master Plan §1.3 & §4.5)."""

from typing import TYPE_CHECKING

from appflow.streaming.protocol import DeltaPayload, EdgePatch, NodePatch

if TYPE_CHECKING:
    from appflow.domain.models import EdgeMetrics, NodeMetrics, TopologyGraph

DELTA_EPSILON: float = 0.005  # 0.5% relative threshold for metric inclusion in patches


def _metric_changed_relative(prev: float, curr: float, epsilon: float = DELTA_EPSILON) -> bool:
    """Check if a floating point telemetry value shifted by more than epsilon relative."""
    if prev == 0.0 and curr == 0.0:
        return False
    # State transition across zero is always significant
    if (prev == 0.0) != (curr == 0.0):
        return True
    return abs(curr - prev) / max(abs(prev), 1e-6) >= epsilon


def _node_metrics_changed(prev: "NodeMetrics", curr: "NodeMetrics") -> bool:
    """Determine if any metric within NodeMetrics exceeded relative change epsilon."""
    if curr.quality != prev.quality:
        return True
    if curr.open_connections != prev.open_connections:
        return True
    if _metric_changed_relative(float(prev.rss_bytes), float(curr.rss_bytes)):
        return True
    if _metric_changed_relative(prev.rps, curr.rps):
        return True
    if _metric_changed_relative(prev.p50_ms, curr.p50_ms):
        return True
    if _metric_changed_relative(prev.p99_ms, curr.p99_ms):
        return True
    if _metric_changed_relative(prev.error_rate, curr.error_rate):
        return True
    if _metric_changed_relative(prev.saturation, curr.saturation):
        return True
    return _metric_changed_relative(prev.cpu_percent, curr.cpu_percent)


def _edge_metrics_changed(prev: "EdgeMetrics", curr: "EdgeMetrics") -> bool:
    """Determine if any metric within EdgeMetrics exceeded relative change epsilon."""
    if curr.quality != prev.quality:
        return True
    if curr.connection_count != prev.connection_count:
        return True
    if curr.state_breakdown != prev.state_breakdown:
        return True
    if _metric_changed_relative(prev.rps, curr.rps):
        return True
    if _metric_changed_relative(prev.bytes_per_sec, curr.bytes_per_sec):
        return True
    if _metric_changed_relative(prev.p99_ms, curr.p99_ms):
        return True
    if _metric_changed_relative(prev.error_rate, curr.error_rate):
        return True
    return _metric_changed_relative(prev.retry_rate, curr.retry_rate)


class DiffEngine:
    """Computes differential topology delta between successive time steps."""

    def __init__(self, epsilon: float = DELTA_EPSILON) -> None:
        self.epsilon = epsilon

    def diff(
        self,
        prev_graph: "TopologyGraph",
        curr_graph: "TopologyGraph",
        base_seq: int,
    ) -> DeltaPayload | None:
        """Compute DeltaPayload comparing curr_graph against prev_graph.

        Returns None if no structural or metric changes exceed thresholds, preventing
        idle transmission loops.
        """
        prev_nodes = {n.id: n for n in prev_graph.nodes}
        curr_nodes = {n.id: n for n in curr_graph.nodes}

        added_nodes = [node for n_id, node in curr_nodes.items() if n_id not in prev_nodes]
        removed_node_ids = [n_id for n_id in prev_nodes if n_id not in curr_nodes]

        updated_nodes: list[NodePatch] = []
        for n_id, curr_node in curr_nodes.items():
            if n_id not in prev_nodes:
                continue
            prev_node = prev_nodes[n_id]

            health_changed = curr_node.health != prev_node.health
            reasons_changed = curr_node.health_reasons != prev_node.health_reasons
            metrics_changed = _node_metrics_changed(prev_node.metrics, curr_node.metrics)

            if health_changed or reasons_changed or metrics_changed:
                updated_nodes.append(
                    NodePatch(
                        id=n_id,
                        health=curr_node.health if health_changed else None,
                        health_reasons=curr_node.health_reasons if reasons_changed else None,
                        metrics=curr_node.metrics if metrics_changed else None,
                    )
                )

        prev_edges = {e.id: e for e in prev_graph.edges}
        curr_edges = {e.id: e for e in curr_graph.edges}

        added_edges = [edge for e_id, edge in curr_edges.items() if e_id not in prev_edges]
        removed_edge_ids = [e_id for e_id in prev_edges if e_id not in curr_edges]

        updated_edges: list[EdgePatch] = []
        for e_id, curr_edge in curr_edges.items():
            if e_id not in prev_edges:
                continue
            prev_edge = prev_edges[e_id]

            health_changed = curr_edge.health != prev_edge.health
            metrics_changed = _edge_metrics_changed(prev_edge.metrics, curr_edge.metrics)

            if health_changed or metrics_changed:
                updated_edges.append(
                    EdgePatch(
                        id=e_id,
                        health=curr_edge.health if health_changed else None,
                        metrics=curr_edge.metrics if metrics_changed else None,
                    )
                )

        has_changes = bool(
            added_nodes
            or removed_node_ids
            or updated_nodes
            or added_edges
            or removed_edge_ids
            or updated_edges
        )

        if not has_changes:
            return None

        # Canonical deterministic ordering
        added_nodes.sort(key=lambda n: n.id)
        updated_nodes.sort(key=lambda p: p.id)
        removed_node_ids.sort()
        added_edges.sort(key=lambda e: e.id)
        updated_edges.sort(key=lambda p: p.id)
        removed_edge_ids.sort()

        return DeltaPayload(
            base_seq=base_seq,
            added_nodes=added_nodes,
            updated_nodes=updated_nodes,
            removed_node_ids=removed_node_ids,
            added_edges=added_edges,
            updated_edges=updated_edges,
            removed_edge_ids=removed_edge_ids,
        )
