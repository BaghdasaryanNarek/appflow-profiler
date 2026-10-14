"""Unit tests for simulation blueprint and DAG validation (Master Plan §5.2)."""

import pytest

from appflow.domain.enums import NodeKind, Protocol
from appflow.simulation.blueprint import (
    Blueprint,
    CallEdge,
    ServiceDefinition,
    create_default_blueprint,
)


def test_default_blueprint_structure() -> None:
    bp = create_default_blueprint()
    assert len(bp.services) == 16
    assert len(bp.topological_order) == 16

    # Ingress starts at client-edge
    assert bp.topological_order[0] == "client-edge"

    # Endpoints with no downstream calls are towards the end
    terminals = [s_id for s_id, s in bp.services.items() if not s.downstream_calls]
    assert "ext:smtp-relay" in terminals
    assert "svc:redis-cache" in terminals
    assert "svc:postgres-primary" in terminals


def test_blueprint_cycle_detection() -> None:
    # Construct a circular dependency: svc:a -> svc:b -> svc:a
    cyclic_services = {
        "svc:a": ServiceDefinition(
            id="svc:a",
            name="a",
            kind=NodeKind.SERVICE,
            downstream_calls=(CallEdge(target_id="svc:b", protocol=Protocol.HTTP),),
        ),
        "svc:b": ServiceDefinition(
            id="svc:b",
            name="b",
            kind=NodeKind.SERVICE,
            downstream_calls=(CallEdge(target_id="svc:a", protocol=Protocol.HTTP),),
        ),
    }

    with pytest.raises(ValueError, match="Cycle detected"):
        Blueprint(cyclic_services)


def test_blueprint_missing_dependency() -> None:
    services = {
        "svc:gateway": ServiceDefinition(
            id="svc:gateway",
            name="gateway",
            kind=NodeKind.GATEWAY,
            downstream_calls=(CallEdge(target_id="svc:non-existent", protocol=Protocol.HTTP),),
        ),
    }

    with pytest.raises(ValueError, match="not defined in the blueprint"):
        Blueprint(services)


def test_process_expansion_scale() -> None:
    bp = create_default_blueprint()
    base_procs = bp.get_expanded_processes(scale=1.0)
    assert len(base_procs) > 20

    scaled_procs = bp.get_expanded_processes(scale=2.0)
    assert len(scaled_procs) > len(base_procs)

    # Unique PIDs and valid ports
    pids = [p.pid for p in base_procs]
    assert len(pids) == len(set(pids))
    for p in base_procs:
        assert p.pid >= 10000
        assert p.port >= 8000
        assert p.proc_id.startswith(f"proc:{p.pid}:")
