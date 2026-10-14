"""Commerce Platform topology blueprint and DAG validation (Master Plan §5.2)."""

from dataclasses import dataclass, field

from appflow.domain.enums import NodeKind, Protocol
from appflow.domain.ids import process_id


@dataclass(frozen=True)
class CallEdge:
    """Directed dependency call from a caller service to a downstream target."""

    target_id: str
    protocol: Protocol
    fanout: float = 1.0  # k multiplier
    probability: float = 1.0  # p invocation probability
    is_sync: bool = True  # whether latency chains synchronously


@dataclass(frozen=True)
class ServiceDefinition:
    """Architectural specification of a simulated microservice, datastore, or boundary."""

    id: str
    name: str
    kind: NodeKind
    base_instances: int = 1
    service_rate: float = 100.0  # mu: per-instance service capacity in req/s
    base_latency_ms: float = 5.0
    pool_size: int | None = None
    retry_probability: float = 0.0  # r: fraction of failed requests retried
    timeout_ms: float = 1000.0
    cores_per_instance: float = 2.0
    downstream_calls: tuple[CallEdge, ...] = ()
    tags: dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class ProcessInstance:
    """Synthetic runtime process instance belonging to a service."""

    pid: int
    create_time: float
    proc_id: str
    service_id: str
    name: str
    cmdline: str
    port: int


class Blueprint:
    """Simulation topology graph with DAG validation, cycle detection, and topological sorting."""

    def __init__(self, services: dict[str, ServiceDefinition]) -> None:
        self.services = services
        self.topological_order: list[str] = []
        self.validate_dag()

    def validate_dag(self) -> None:
        """Verify that dependencies exist, have no cycles, and compute topological order."""
        # 1. Verify all targets exist
        for s_id, service in self.services.items():
            for edge in service.downstream_calls:
                if edge.target_id not in self.services:
                    raise ValueError(
                        f"Target service {edge.target_id!r} referenced by {s_id!r} "
                        "is not defined in the blueprint."
                    )

        # 2. Compute in-degree for topological sort (Kahn's algorithm)
        in_degree: dict[str, int] = dict.fromkeys(self.services, 0)
        adjacency: dict[str, list[str]] = {s_id: [] for s_id in self.services}

        for s_id, service in self.services.items():
            for edge in service.downstream_calls:
                adjacency[s_id].append(edge.target_id)
                in_degree[edge.target_id] += 1

        queue = [s_id for s_id, deg in in_degree.items() if deg == 0]
        order: list[str] = []

        while queue:
            # Deterministic ordering by ID among candidates
            queue.sort()
            curr = queue.pop(0)
            order.append(curr)

            for neighbor in adjacency[curr]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)

        if len(order) != len(self.services):
            unresolved = [s_id for s_id, deg in in_degree.items() if deg > 0]
            raise ValueError(f"Cycle detected in simulation blueprint among services: {unresolved}")

        self.topological_order = order

    def get_expanded_processes(self, scale: float = 1.0) -> list[ProcessInstance]:
        """Expand services into synthetic processes scaled by scale factor."""
        processes: list[ProcessInstance] = []
        base_epoch = 1700000000.0

        for svc_idx, s_id in enumerate(self.topological_order):
            service = self.services[s_id]
            # External endpoints and client-edge do not create internal OS processes
            if service.kind in (NodeKind.EXTERNAL, NodeKind.CLIENT):
                continue

            instance_count = max(1, round(service.base_instances * scale))
            base_port = 8000 + (svc_idx * 50)
            base_pid = 10000 + (svc_idx * 100)

            for inst_idx in range(instance_count):
                pid = base_pid + inst_idx
                port = base_port + inst_idx
                create_time = base_epoch + (svc_idx * 100.0) + (inst_idx * 10.0)
                proc_id = process_id(pid, int(create_time * 1000))
                cmdline = f"/usr/local/bin/{service.name} --port {port}"

                processes.append(
                    ProcessInstance(
                        pid=pid,
                        create_time=create_time,
                        proc_id=proc_id,
                        service_id=s_id,
                        name=service.name,
                        cmdline=cmdline,
                        port=port,
                    )
                )

        return processes


def create_default_blueprint() -> Blueprint:
    """Build the canonical Commerce Platform blueprint defined in Master Plan §5.2."""
    services: dict[str, ServiceDefinition] = {
        # 1. Ingress traffic boundary
        "client-edge": ServiceDefinition(
            id="client-edge",
            name="client-edge",
            kind=NodeKind.CLIENT,
            base_instances=1,
            service_rate=10000.0,
            base_latency_ms=0.0,
            downstream_calls=(
                CallEdge(
                    target_id="svc:api-gateway",
                    protocol=Protocol.HTTP,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=True,
                ),
            ),
            tags={"tier": "edge"},
        ),
        # 2. API Gateway
        "svc:api-gateway": ServiceDefinition(
            id="svc:api-gateway",
            name="api-gateway",
            kind=NodeKind.GATEWAY,
            base_instances=4,
            service_rate=250.0,
            base_latency_ms=4.0,
            timeout_ms=1000.0,
            cores_per_instance=4.0,
            downstream_calls=(
                CallEdge(
                    target_id="svc:auth-svc",
                    protocol=Protocol.GRPC,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=True,
                ),
                CallEdge(
                    target_id="svc:catalog-svc",
                    protocol=Protocol.HTTP,
                    fanout=1.0,
                    probability=0.45,
                    is_sync=True,
                ),
                CallEdge(
                    target_id="svc:orders-svc",
                    protocol=Protocol.HTTP,
                    fanout=1.0,
                    probability=0.25,
                    is_sync=True,
                ),
                CallEdge(
                    target_id="svc:search-svc",
                    protocol=Protocol.HTTP,
                    fanout=1.0,
                    probability=0.30,
                    is_sync=True,
                ),
            ),
            tags={"tier": "routing"},
        ),
        # 3. Authentication service
        "svc:auth-svc": ServiceDefinition(
            id="svc:auth-svc",
            name="auth-svc",
            kind=NodeKind.SERVICE,
            base_instances=3,
            service_rate=300.0,
            base_latency_ms=8.0,
            timeout_ms=200.0,
            retry_probability=0.05,
            cores_per_instance=2.0,
            tags={"tier": "security"},
        ),
        # 4. Catalog service
        "svc:catalog-svc": ServiceDefinition(
            id="svc:catalog-svc",
            name="catalog-svc",
            kind=NodeKind.SERVICE,
            base_instances=4,
            service_rate=200.0,
            base_latency_ms=10.0,
            timeout_ms=500.0,
            cores_per_instance=2.0,
            downstream_calls=(
                CallEdge(
                    target_id="svc:redis-cache",
                    protocol=Protocol.REDIS,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=True,
                ),
                CallEdge(
                    target_id="svc:postgres-replica",
                    protocol=Protocol.PG,
                    fanout=1.0,
                    probability=0.05,  # Cache miss rate in steady state
                    is_sync=True,
                ),
            ),
            tags={"tier": "domain"},
        ),
        # 5. Orders service
        "svc:orders-svc": ServiceDefinition(
            id="svc:orders-svc",
            name="orders-svc",
            kind=NodeKind.SERVICE,
            base_instances=4,
            service_rate=150.0,
            base_latency_ms=15.0,
            timeout_ms=1000.0,
            retry_probability=0.10,
            cores_per_instance=4.0,
            downstream_calls=(
                CallEdge(
                    target_id="svc:payments-svc",
                    protocol=Protocol.GRPC,
                    fanout=1.0,
                    probability=0.90,
                    is_sync=True,
                ),
                CallEdge(
                    target_id="svc:inventory-svc",
                    protocol=Protocol.GRPC,
                    fanout=1.0,
                    probability=0.95,
                    is_sync=True,
                ),
                CallEdge(
                    target_id="svc:kafka-orders",
                    protocol=Protocol.KAFKA,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=False,
                ),
                CallEdge(
                    target_id="svc:postgres-primary",
                    protocol=Protocol.PG,
                    fanout=2.0,
                    probability=1.0,
                    is_sync=True,
                ),
            ),
            tags={"tier": "domain"},
        ),
        # 6. Search service
        "svc:search-svc": ServiceDefinition(
            id="svc:search-svc",
            name="search-svc",
            kind=NodeKind.SERVICE,
            base_instances=3,
            service_rate=180.0,
            base_latency_ms=10.0,
            timeout_ms=600.0,
            cores_per_instance=2.0,
            downstream_calls=(
                CallEdge(
                    target_id="svc:opensearch",
                    protocol=Protocol.HTTP,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=True,
                ),
            ),
            tags={"tier": "domain"},
        ),
        # 7. Payments service
        "svc:payments-svc": ServiceDefinition(
            id="svc:payments-svc",
            name="payments-svc",
            kind=NodeKind.SERVICE,
            base_instances=3,
            service_rate=120.0,
            base_latency_ms=18.0,
            timeout_ms=1500.0,
            retry_probability=0.08,
            cores_per_instance=2.0,
            downstream_calls=(
                CallEdge(
                    target_id="svc:postgres-primary",
                    protocol=Protocol.PG,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=True,
                ),
                CallEdge(
                    target_id="ext:payments-provider",
                    protocol=Protocol.HTTP,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=True,
                ),
            ),
            tags={"tier": "domain"},
        ),
        # 8. Inventory service
        "svc:inventory-svc": ServiceDefinition(
            id="svc:inventory-svc",
            name="inventory-svc",
            kind=NodeKind.SERVICE,
            base_instances=3,
            service_rate=200.0,
            base_latency_ms=8.0,
            timeout_ms=500.0,
            cores_per_instance=2.0,
            downstream_calls=(
                CallEdge(
                    target_id="svc:postgres-primary",
                    protocol=Protocol.PG,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=True,
                ),
            ),
            tags={"tier": "domain"},
        ),
        # 9. Kafka messaging queue
        "svc:kafka-orders": ServiceDefinition(
            id="svc:kafka-orders",
            name="kafka-orders",
            kind=NodeKind.QUEUE,
            base_instances=3,
            service_rate=1000.0,
            base_latency_ms=2.0,
            timeout_ms=200.0,
            downstream_calls=(
                CallEdge(
                    target_id="svc:notification-worker",
                    protocol=Protocol.KAFKA,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=False,
                ),
            ),
            tags={"tier": "queue"},
        ),
        # 10. Notification worker
        "svc:notification-worker": ServiceDefinition(
            id="svc:notification-worker",
            name="notification-worker",
            kind=NodeKind.PROCESS,
            base_instances=2,
            service_rate=100.0,
            base_latency_ms=20.0,
            timeout_ms=2000.0,
            downstream_calls=(
                CallEdge(
                    target_id="ext:smtp-relay",
                    protocol=Protocol.TCP,
                    fanout=1.0,
                    probability=1.0,
                    is_sync=False,
                ),
            ),
            tags={"tier": "worker"},
        ),
        # 11. Redis cache
        "svc:redis-cache": ServiceDefinition(
            id="svc:redis-cache",
            name="redis-cache",
            kind=NodeKind.CACHE,
            base_instances=2,
            service_rate=3000.0,
            base_latency_ms=1.0,
            timeout_ms=100.0,
            tags={"tier": "cache"},
        ),
        # 12. PostgreSQL Read Replica
        "svc:postgres-replica": ServiceDefinition(
            id="svc:postgres-replica",
            name="postgres-replica",
            kind=NodeKind.DATASTORE,
            base_instances=2,
            service_rate=400.0,
            base_latency_ms=5.0,
            timeout_ms=500.0,
            pool_size=40,
            tags={"tier": "data"},
        ),
        # 13. PostgreSQL Primary
        "svc:postgres-primary": ServiceDefinition(
            id="svc:postgres-primary",
            name="postgres-primary",
            kind=NodeKind.DATASTORE,
            base_instances=1,
            service_rate=350.0,
            base_latency_ms=8.0,
            timeout_ms=1000.0,
            pool_size=50,
            tags={"tier": "data"},
        ),
        # 14. OpenSearch cluster
        "svc:opensearch": ServiceDefinition(
            id="svc:opensearch",
            name="opensearch",
            kind=NodeKind.DATASTORE,
            base_instances=3,
            service_rate=300.0,
            base_latency_ms=15.0,
            timeout_ms=800.0,
            tags={"tier": "data"},
        ),
        # 15. External Payment Gateway
        "ext:payments-provider": ServiceDefinition(
            id="ext:payments-provider",
            name="payments-provider",
            kind=NodeKind.EXTERNAL,
            base_instances=1,
            service_rate=500.0,
            base_latency_ms=80.0,
            timeout_ms=2000.0,
            tags={"tier": "external"},
        ),
        # 16. External SMTP Relay
        "ext:smtp-relay": ServiceDefinition(
            id="ext:smtp-relay",
            name="smtp-relay",
            kind=NodeKind.EXTERNAL,
            base_instances=1,
            service_rate=500.0,
            base_latency_ms=50.0,
            timeout_ms=2000.0,
            tags={"tier": "external"},
        ),
    }

    return Blueprint(services)
