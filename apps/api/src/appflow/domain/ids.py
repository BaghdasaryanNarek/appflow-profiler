"""Deterministic identifier generators for entities and edges (Master Plan §4.1)."""

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from appflow.domain.enums import Protocol


def process_id(pid: int, create_time_epoch_ms: int) -> str:
    """Generate a deterministic process node ID.

    ``create_time_epoch_ms`` prevents collision across PID re-use cycles.
    """
    return f"proc:{pid}:{create_time_epoch_ms}"


def service_id(service_name: str) -> str:
    """Generate a service group node ID."""
    clean_name = service_name.strip()
    return f"svc:{clean_name}"


def endpoint_id(ip: str, port: int) -> str:
    """Generate a remote endpoint ID.

    IPv6 addresses are wrapped in brackets (e.g., ``[::1]:8080``).
    """
    clean_ip = ip.strip()
    if ":" in clean_ip:
        # Normalize and wrap IPv6 in brackets if not already wrapped
        unbracketed = clean_ip.strip("[]")
        formatted_ip = f"[{unbracketed}]"
    else:
        formatted_ip = clean_ip
    return f"ep:{formatted_ip}:{port}"


def external_id(hostname_or_cidr: str) -> str:
    """Generate an external unmanaged service or CIDR node ID."""
    clean_target = hostname_or_cidr.strip()
    return f"ext:{clean_target}"


def edge_id(src_id: str, dst_id: str, protocol: "Protocol | str") -> str:
    """Generate a deterministic directed edge ID."""
    proto_val = protocol.value if hasattr(protocol, "value") else str(protocol)
    return f"edge:{src_id}->{dst_id}:{proto_val}"
