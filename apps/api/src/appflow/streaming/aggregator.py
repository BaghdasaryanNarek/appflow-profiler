"""Telemetry aggregation from RawSample into TopologyGraph with sparkline history.

Conforms to Master Plan §1.3 & §4.3.
"""

import re
from collections import defaultdict, deque
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from appflow.domain.enums import (
    ConnState,
    HealthStatus,
    NodeKind,
    Protocol,
    SourceMode,
)
from appflow.domain.health import (
    DEFAULT_THRESHOLDS,
    HealthThresholds,
    derive_edge_health,
    derive_node_health,
)
from appflow.domain.ids import edge_id, endpoint_id, external_id, process_id, service_id
from appflow.domain.models import (
    Edge,
    EdgeDetail,
    EdgeMetrics,
    NeighbourRef,
    Node,
    NodeDetail,
    NodeMetrics,
    NodeNeighbours,
    ProcessInfo,
    SocketInfo,
    TopologyGraph,
    TopologySummary,
)
from appflow.logging import get_logger
from appflow.streaming.protocol import HealthEventPayload

if TYPE_CHECKING:
    from appflow.sources.base import RawConnection, RawSample


_log = get_logger(__name__)

PORT_PATTERN = re.compile(r"--port\s+(\d+)")


def _resolve_service_id(name: str) -> str:
    """Normalize process or service name into canonical svc: identifier."""
    clean = name.strip()
    if clean.startswith("svc:") or clean.startswith("ext:"):
        return clean
    if clean == "client-edge":
        return clean
    return service_id(clean)


def _resolve_service_kind(svc_id: str) -> NodeKind:
    """Infer architectural role based on canonical name convention."""
    clean = svc_id.lower()
    if "gateway" in clean:
        return NodeKind.GATEWAY
    if "cache" in clean or "redis" in clean:
        return NodeKind.CACHE
    if "postgres" in clean or "opensearch" in clean or "db" in clean or "datastore" in clean:
        return NodeKind.DATASTORE
    if "queue" in clean or "kafka" in clean:
        return NodeKind.QUEUE
    if "client" in clean or "edge" in clean:
        return NodeKind.CLIENT
    if clean.startswith("ext:"):
        return NodeKind.EXTERNAL
    if "worker" in clean:
        return NodeKind.PROCESS
    return NodeKind.SERVICE


def _resolve_service_tags(svc_id: str) -> dict[str, str]:
    """Map canonical services to presentation tier tags."""
    clean = svc_id.lower()
    if "gateway" in clean:
        return {"tier": "routing"}
    if "auth" in clean:
        return {"tier": "security"}
    if "cache" in clean:
        return {"tier": "cache"}
    if "postgres" in clean or "opensearch" in clean:
        return {"tier": "data"}
    if "queue" in clean:
        return {"tier": "queue"}
    if "worker" in clean:
        return {"tier": "worker"}
    if "external" in clean or clean.startswith("ext:"):
        return {"tier": "external"}
    if "client" in clean:
        return {"tier": "edge"}
    return {"tier": "domain"}


def _derive_saturation(cpu_percent: float, num_threads: int | None = None) -> float:
    """Estimate capacity saturation rho from observed CPU and thread count."""
    cores = 4.0 if cpu_percent > 200.0 else (2.0 if cpu_percent > 100.0 else 1.0)
    raw_rho = cpu_percent / (cores * 100.0)
    return round(min(0.999, max(0.0, raw_rho)), 3)


def _derive_p50(saturation: float, base_ms: float = 5.0) -> float:
    """Approximate median latency scaling as utilization approaches saturation."""
    if saturation <= 0.70:
        return round(base_ms, 1)
    queue_factor = 1.0 / max(0.01, 1.0 - min(0.98, saturation))
    return round(base_ms + (queue_factor * 2.0), 1)


class TopologyAggregator:
    """Aggregates discrete RawSample events into a rich TopologyGraph with time-series history."""

    def __init__(
        self,
        history_limit: int = 120,
        thresholds: HealthThresholds | None = None,
    ) -> None:
        self._history_limit = max(10, history_limit)
        self._thresholds = thresholds or DEFAULT_THRESHOLDS

        self._node_history: dict[str, dict[str, deque[float]]] = defaultdict(
            lambda: defaultdict(lambda: deque(maxlen=self._history_limit))
        )
        self._edge_history: dict[str, dict[str, deque[float]]] = defaultdict(
            lambda: defaultdict(lambda: deque(maxlen=self._history_limit))
        )

        self._prev_node_health: dict[str, HealthStatus] = {}
        self._prev_edge_health: dict[str, HealthStatus] = {}

        self._proc_cpu_ema: dict[int, float] = {}

        self._latest_graph: TopologyGraph = TopologyGraph()
        self._node_sockets: dict[str, list[SocketInfo]] = defaultdict(list)
        self._latest_sample: RawSample | None = None

    @property
    def latest_graph(self) -> TopologyGraph:
        """Most recently aggregated topology graph."""
        return self._latest_graph

    def process_sample(self, sample: "RawSample") -> tuple[TopologyGraph, list[HealthEventPayload]]:
        """Transform raw processes and sockets into full topology vertices and directed edges."""
        self._latest_sample = sample
        self._node_sockets.clear()

        # Prune terminated process EMA tracking
        current_pids = set(sample.processes.keys())
        self._proc_cpu_ema = {
            pid: cpu for pid, cpu in self._proc_cpu_ema.items() if pid in current_pids
        }

        # 1. Map listening ports from process command lines or sockets
        port_to_service: dict[int, str] = {}
        port_to_proc: dict[int, str] = {}

        for raw_proc in sample.processes.values():
            svc_id = _resolve_service_id(raw_proc.name)
            p_node_id = process_id(raw_proc.pid, int(raw_proc.create_time * 1000))

            m = PORT_PATTERN.search(raw_proc.cmdline_sanitized)
            if m:
                port = int(m.group(1))
                port_to_service[port] = svc_id
                port_to_proc[port] = p_node_id

        # Also register ports from local listen connections
        for conn in sample.connections:
            if conn.status == ConnState.LISTEN and conn.pid is not None:
                p = sample.processes.get(conn.pid)
                if p:
                    svc_id = _resolve_service_id(p.name)
                    p_node_id = process_id(p.pid, int(p.create_time * 1000))
                    port_to_service[conn.laddr_port] = svc_id
                    port_to_proc[conn.laddr_port] = p_node_id

        # 2. Build Process Nodes and group by parent service ID
        process_nodes: list[Node] = []
        grouped_by_svc: dict[str, list[Node]] = defaultdict(list)

        for raw_proc in sample.processes.values():
            proc_node_id = process_id(raw_proc.pid, int(raw_proc.create_time * 1000))
            svc_id = _resolve_service_id(raw_proc.name)
            label = f"{raw_proc.name}:{raw_proc.pid}"

            p_info = ProcessInfo(
                pid=raw_proc.pid,
                name=raw_proc.name,
                cmdline_sanitized=raw_proc.cmdline_sanitized,
                create_time=raw_proc.create_time,
                ppid=raw_proc.ppid,
                username=raw_proc.username,
                num_threads=raw_proc.num_threads,
            )

            # Smooth small sampling jitter (Gaussian tick noise)
            # while immediately tracking step changes (> 4.0%)
            raw_cpu = raw_proc.cpu_percent
            prev_cpu = self._proc_cpu_ema.get(raw_proc.pid)
            if prev_cpu is None or abs(raw_cpu - prev_cpu) > 4.0:
                proc_cpu = raw_cpu
            else:
                proc_cpu = round(0.02 * raw_cpu + 0.98 * prev_cpu, 1)
            self._proc_cpu_ema[raw_proc.pid] = proc_cpu

            # RPS derived from io_bytes_per_sec (1024 B/req) or open connections
            if raw_proc.io_bytes_per_sec is not None:
                rps = round(raw_proc.io_bytes_per_sec / 1024.0, 2)
            else:
                rps = float(raw_proc.open_connections)

            saturation = _derive_saturation(proc_cpu, raw_proc.num_threads)
            p50_ms = _derive_p50(saturation, base_ms=5.0)
            p99_ms = round(p50_ms * 4.6, 1)

            # Error rate baseline + cliff near high saturation
            error_rate = 0.001
            if saturation > 0.85:
                error_rate = min(1.0, round(0.001 + (saturation - 0.85) * 0.4, 4))

            p_metrics = NodeMetrics(
                rps=rps,
                p50_ms=p50_ms,
                p99_ms=p99_ms,
                error_rate=error_rate,
                saturation=saturation,
                cpu_percent=proc_cpu,
                rss_bytes=raw_proc.rss_bytes,
                open_connections=raw_proc.open_connections,
                quality=sample.quality,
            )

            health, reasons = derive_node_health(p_metrics, self._thresholds)

            node = Node(
                id=proc_node_id,
                kind=NodeKind.PROCESS,
                label=label[:64],
                group_id=svc_id,
                health=health,
                health_reasons=reasons,
                metrics=p_metrics,
                process=p_info,
                tags={"role": "process"},
            )
            process_nodes.append(node)
            grouped_by_svc[svc_id].append(node)

        # 3. Associate raw connections with nodes and build edges
        edge_connections: dict[tuple[str, str, Protocol], list[RawConnection]] = defaultdict(list)
        all_nodes_by_id: dict[str, Node] = {n.id: n for n in process_nodes}

        for conn in sample.connections:
            sock = SocketInfo(
                local_addr=conn.laddr_ip,
                local_port=conn.laddr_port,
                state=conn.status,
                protocol=conn.protocol,
                remote_addr=conn.raddr_ip,
                remote_port=conn.raddr_port,
                pid=conn.pid,
            )

            # Determine caller / source
            if conn.pid is not None and conn.pid in sample.processes:
                caller_proc = sample.processes[conn.pid]
                source_svc_id = _resolve_service_id(caller_proc.name)
                source_proc_id = process_id(caller_proc.pid, int(caller_proc.create_time * 1000))
                self._node_sockets[source_proc_id].append(sock)
                self._node_sockets[source_svc_id].append(sock)
            elif conn.laddr_port == 50000 or (
                conn.laddr_ip in ("127.0.0.1", "0.0.0.0") and conn.laddr_port not in port_to_service
            ):
                source_svc_id = "client-edge"
                self._node_sockets["client-edge"].append(sock)
            else:
                source_svc_id = endpoint_id(conn.laddr_ip, conn.laddr_port)
                self._node_sockets[source_svc_id].append(sock)

            # Determine callee / target
            if conn.raddr_port is not None and conn.raddr_port in port_to_service:
                target_svc_id = port_to_service[conn.raddr_port]
                target_proc_id = port_to_proc.get(conn.raddr_port)
                if target_proc_id:
                    self._node_sockets[target_proc_id].append(sock)
                self._node_sockets[target_svc_id].append(sock)
            elif (
                conn.raddr_ip == "10.0.0.1"
                or (conn.raddr_ip and not conn.raddr_ip.startswith("127."))
            ) and conn.raddr_ip != "0.0.0.0":
                if source_svc_id == "svc:payments-svc":
                    target_svc_id = "ext:payments-provider"
                elif source_svc_id == "svc:notification-worker":
                    target_svc_id = "ext:smtp-relay"
                else:
                    target_svc_id = external_id(conn.raddr_ip or "external")
                self._node_sockets[target_svc_id].append(sock)
            else:
                target_svc_id = endpoint_id(conn.raddr_ip or "0.0.0.0", conn.raddr_port or 0)
                self._node_sockets[target_svc_id].append(sock)

            edge_connections[(source_svc_id, target_svc_id, conn.protocol)].append(conn)

        # 4. Synthesize Service Group Nodes
        service_nodes: list[Node] = []
        for svc_id, child_nodes in grouped_by_svc.items():
            kind = _resolve_service_kind(svc_id)
            clean_label = svc_id.removeprefix("svc:")

            total_cpu = round(sum(p.metrics.cpu_percent for p in child_nodes), 1)
            total_rss = sum(p.metrics.rss_bytes for p in child_nodes)
            total_open = sum(p.metrics.open_connections for p in child_nodes)
            total_rps = round(sum(p.metrics.rps for p in child_nodes), 2)
            max_sat = round(max((p.metrics.saturation for p in child_nodes), default=0.0), 3)
            avg_p50 = round(sum(p.metrics.p50_ms for p in child_nodes) / len(child_nodes), 1)
            max_p99 = round(max((p.metrics.p99_ms for p in child_nodes), default=15.0), 1)
            max_err = round(max((p.metrics.error_rate for p in child_nodes), default=0.001), 4)

            svc_metrics = NodeMetrics(
                rps=total_rps,
                p50_ms=avg_p50,
                p99_ms=max_p99,
                error_rate=max_err,
                saturation=max_sat,
                cpu_percent=total_cpu,
                rss_bytes=total_rss,
                open_connections=total_open,
                quality=sample.quality,
            )

            health, reasons = derive_node_health(svc_metrics, self._thresholds)

            svc_node = Node(
                id=svc_id,
                kind=kind,
                label=clean_label[:64],
                group_id=None,
                health=health,
                health_reasons=reasons,
                metrics=svc_metrics,
                process=None,
                tags=_resolve_service_tags(svc_id),
            )
            service_nodes.append(svc_node)
            all_nodes_by_id[svc_id] = svc_node

        # 5. Synthesize external and client boundary nodes if referenced by edges
        all_referenced_endpoints: set[str] = set()
        for src, dst, _ in edge_connections:
            all_referenced_endpoints.add(src)
            all_referenced_endpoints.add(dst)

        for ep_id in all_referenced_endpoints:
            if ep_id in all_nodes_by_id:
                continue

            if ep_id == "client-edge":
                ep_kind = NodeKind.CLIENT
                ep_label = "client-edge"
                ep_tags = {"tier": "edge"}
            elif ep_id.startswith("ext:"):
                ep_kind = NodeKind.EXTERNAL
                ep_label = ep_id.removeprefix("ext:")
                ep_tags = {"tier": "external"}
            else:
                ep_kind = NodeKind.EXTERNAL
                ep_label = ep_id.removeprefix("ep:")
                ep_tags = {"tier": "endpoint"}

            ep_metrics = NodeMetrics(
                rps=100.0,
                p50_ms=2.0,
                p99_ms=10.0,
                error_rate=0.0,
                saturation=0.0,
                cpu_percent=0.0,
                rss_bytes=0,
                open_connections=len(self._node_sockets.get(ep_id, [])),
                quality=sample.quality,
            )

            ep_node = Node(
                id=ep_id,
                kind=ep_kind,
                label=ep_label[:64],
                group_id=None,
                health=HealthStatus.HEALTHY,
                health_reasons=[],
                metrics=ep_metrics,
                process=None,
                tags=ep_tags,
            )
            service_nodes.append(ep_node)
            all_nodes_by_id[ep_id] = ep_node

        # 6. Build Edges from grouped connections
        edges: list[Edge] = []
        for (src_id, dst_id, proto), conns in edge_connections.items():
            if src_id not in all_nodes_by_id or dst_id not in all_nodes_by_id:
                continue

            e_id = edge_id(src_id, dst_id, proto)
            state_breakdown: dict[ConnState, int] = defaultdict(int)
            for c in conns:
                state_breakdown[c.status] += 1

            conn_count = len(conns)
            close_wait = state_breakdown.get(ConnState.CLOSE_WAIT, 0)
            err_rate = (
                round(min(1.0, 0.001 + (close_wait / max(1, conn_count)) * 0.1), 4)
                if close_wait > 0
                else 0.001
            )

            src_node = all_nodes_by_id[src_id]
            dst_node = all_nodes_by_id[dst_id]
            edge_rps = src_node.metrics.rps if src_id == "client-edge" else dst_node.metrics.rps

            edge_metrics = EdgeMetrics(
                rps=max(1.0, edge_rps),
                bytes_per_sec=round(max(1.0, edge_rps) * 1024.0, 1),
                p99_ms=dst_node.metrics.p99_ms,
                error_rate=err_rate,
                connection_count=conn_count,
                quality=sample.quality,
                state_breakdown=dict(state_breakdown),
                retry_rate=0.08 if err_rate > 0.01 else 0.0,
            )

            edge_health, _ = derive_edge_health(edge_metrics, self._thresholds)

            edge = Edge(
                id=e_id,
                source=src_id,
                target=dst_id,
                protocol=proto,
                health=edge_health,
                metrics=edge_metrics,
            )
            edges.append(edge)

        all_nodes = process_nodes + service_nodes
        # Deterministic sorting for canonical ordering
        all_nodes.sort(key=lambda n: n.id)
        edges.sort(key=lambda e: e.id)

        current_graph = TopologyGraph(
            nodes=all_nodes,
            edges=edges,
            timestamp=sample.timestamp,
        )

        # 7. Detect Health Status Transitions
        health_events: list[HealthEventPayload] = []

        for node in all_nodes:
            prev_status = self._prev_node_health.get(node.id)
            if prev_status is not None and prev_status != node.health:
                health_events.append(
                    HealthEventPayload(
                        entity_id=node.id,
                        from_status=prev_status,
                        to_status=node.health,
                        reasons=node.health_reasons,
                    )
                )
            self._prev_node_health[node.id] = node.health

        for edge in edges:
            prev_status = self._prev_edge_health.get(edge.id)
            if prev_status is not None and prev_status != edge.health:
                health_events.append(
                    HealthEventPayload(
                        entity_id=edge.id,
                        from_status=prev_status,
                        to_status=edge.health,
                        reasons=[],
                    )
                )
            self._prev_edge_health[edge.id] = edge.health

        # 8. Record Metric Ring-Buffer History
        active_node_ids = {n.id for n in all_nodes}
        for node in all_nodes:
            h = self._node_history[node.id]
            h["rps"].append(node.metrics.rps)
            h["p50_ms"].append(node.metrics.p50_ms)
            h["p99_ms"].append(node.metrics.p99_ms)
            h["error_rate"].append(node.metrics.error_rate)
            h["saturation"].append(node.metrics.saturation)
            h["cpu_percent"].append(node.metrics.cpu_percent)
            h["rss_bytes"].append(float(node.metrics.rss_bytes))
            h["open_connections"].append(float(node.metrics.open_connections))

        active_edge_ids = {e.id for e in edges}
        for edge in edges:
            eh = self._edge_history[edge.id]
            eh["rps"].append(edge.metrics.rps)
            eh["bytes_per_sec"].append(edge.metrics.bytes_per_sec)
            eh["p99_ms"].append(edge.metrics.p99_ms)
            eh["error_rate"].append(edge.metrics.error_rate)
            eh["connection_count"].append(float(edge.metrics.connection_count))
            eh["retry_rate"].append(edge.metrics.retry_rate)

        # Prune stale entities from history
        for dead_id in set(self._node_history) - active_node_ids:
            del self._node_history[dead_id]
            self._prev_node_health.pop(dead_id, None)

        for dead_id in set(self._edge_history) - active_edge_ids:
            del self._edge_history[dead_id]
            self._prev_edge_health.pop(dead_id, None)

        self._latest_graph = current_graph
        return current_graph, health_events

    def get_summary(
        self,
        mode: SourceMode = SourceMode.DEMO,
        active_scenario: str | None = None,
    ) -> TopologySummary:
        """Produce compact SSR summary payload (<2KB) for instantaneous LCP paint."""
        nodes = self._latest_graph.nodes
        edges = self._latest_graph.edges

        service_nodes = [n for n in nodes if n.group_id is None]
        total_rps = round(sum(n.metrics.rps for n in service_nodes), 2)
        global_p99 = max((n.metrics.p99_ms for n in service_nodes), default=0.0)
        global_err = (
            round(sum(n.metrics.error_rate for n in service_nodes) / max(1, len(service_nodes)), 4)
            if service_nodes
            else 0.0
        )

        critical_count = sum(1 for n in nodes if n.health == HealthStatus.CRITICAL) + sum(
            1 for e in edges if e.health == HealthStatus.CRITICAL
        )
        degraded_count = sum(1 for n in nodes if n.health == HealthStatus.DEGRADED) + sum(
            1 for e in edges if e.health == HealthStatus.DEGRADED
        )

        return TopologySummary(
            mode=mode,
            node_count=len(nodes),
            edge_count=len(edges),
            total_rps=total_rps,
            global_p99_ms=global_p99,
            global_error_rate=global_err,
            critical_count=critical_count,
            degraded_count=degraded_count,
            active_scenario=active_scenario,
            generated_at=datetime.now(UTC),
        )

    def get_node_detail(self, node_id: str) -> NodeDetail | None:
        """Fetch Level-2 deep technical disclosure for an inspected node."""
        node = next((n for n in self._latest_graph.nodes if n.id == node_id), None)
        if node is None:
            return None

        # Build neighbours
        # For a service node, find direct upstream/downstream services.
        # For a process node, inherit parent service neighbours or direct connections.
        effective_id = (
            node.group_id if (node.kind == NodeKind.PROCESS and node.group_id) else node.id
        )
        nodes_by_id = {n.id: n for n in self._latest_graph.nodes}

        up_refs: list[NeighbourRef] = []
        down_refs: list[NeighbourRef] = []

        for edge in self._latest_graph.edges:
            if edge.target == effective_id:
                src_n = nodes_by_id.get(edge.source)
                if src_n:
                    up_refs.append(
                        NeighbourRef(
                            node_id=src_n.id,
                            label=src_n.label,
                            kind=src_n.kind,
                            health=src_n.health,
                            edge_id=edge.id,
                            protocol=edge.protocol,
                            rps=edge.metrics.rps,
                        )
                    )
            elif edge.source == effective_id:
                dst_n = nodes_by_id.get(edge.target)
                if dst_n:
                    down_refs.append(
                        NeighbourRef(
                            node_id=dst_n.id,
                            label=dst_n.label,
                            kind=dst_n.kind,
                            health=dst_n.health,
                            edge_id=edge.id,
                            protocol=edge.protocol,
                            rps=edge.metrics.rps,
                        )
                    )

        sockets = list(self._node_sockets.get(node_id, []))
        history = {
            metric: list(values) for metric, values in self._node_history.get(node_id, {}).items()
        }

        return NodeDetail(
            node=node,
            sockets=sockets,
            history=history,
            neighbours=NodeNeighbours(up=up_refs, down=down_refs),
        )

    def get_edge_detail(self, edge_id: str) -> EdgeDetail | None:
        """Fetch Level-2 deep technical disclosure for an inspected edge."""
        edge = next((e for e in self._latest_graph.edges if e.id == edge_id), None)
        if edge is None:
            return None

        history = {
            metric: list(values) for metric, values in self._edge_history.get(edge_id, {}).items()
        }
        return EdgeDetail(edge=edge, history=history)

    @staticmethod
    def filter_graph(
        graph: TopologyGraph,
        kinds: list[NodeKind] | None = None,
        min_rps: float | None = None,
        group: str | None = None,
    ) -> TopologyGraph:
        """Apply subscription filters to a topology graph."""
        retained_nodes: list[Node] = []
        for node in graph.nodes:
            if kinds and node.kind not in kinds:
                continue
            if min_rps is not None and node.metrics.rps < min_rps:
                continue
            if group is not None and node.group_id != group and node.id != group:
                continue
            retained_nodes.append(node)

        retained_ids = {n.id for n in retained_nodes}
        retained_edges = [
            e for e in graph.edges if e.source in retained_ids and e.target in retained_ids
        ]

        return TopologyGraph(
            nodes=retained_nodes,
            edges=retained_edges,
            timestamp=graph.timestamp,
        )
