"""Unit tests for deterministic ID generators (Master Plan §4.1)."""

import pytest

from appflow.domain.enums import Protocol
from appflow.domain.ids import (
    edge_id,
    endpoint_id,
    external_id,
    process_id,
    service_id,
)


@pytest.mark.parametrize(
    ("pid", "create_time_ms", "expected"),
    [
        (1, 1000, "proc:1:1000"),
        (45120, 1728000000123, "proc:45120:1728000000123"),
        (0, 0, "proc:0:0"),
    ],
)
def test_process_id_format(pid: int, create_time_ms: int, expected: str) -> None:
    assert process_id(pid, create_time_ms) == expected


@pytest.mark.parametrize(
    ("service_name", "expected"),
    [
        ("orders-api", "svc:orders-api"),
        (" catalog-service ", "svc:catalog-service"),
        ("payments_worker", "svc:payments_worker"),
    ],
)
def test_service_id_format(service_name: str, expected: str) -> None:
    assert service_id(service_name) == expected


@pytest.mark.parametrize(
    ("ip", "port", "expected"),
    [
        # IPv4
        ("127.0.0.1", 8080, "ep:127.0.0.1:8080"),
        ("10.0.0.15", 5432, "ep:10.0.0.15:5432"),
        (" 192.168.1.1 ", 80, "ep:192.168.1.1:80"),
        # IPv6 unbracketed
        ("::1", 9092, "ep:[::1]:9092"),
        ("2001:db8::1", 443, "ep:[2001:db8::1]:443"),
        ("fe80::1ff:fe23:4567:890a", 6379, "ep:[fe80::1ff:fe23:4567:890a]:6379"),
        # IPv6 pre-bracketed
        ("[::1]", 9092, "ep:[::1]:9092"),
        (" [2001:db8::2] ", 8080, "ep:[2001:db8::2]:8080"),
    ],
)
def test_endpoint_id_format(ip: str, port: int, expected: str) -> None:
    assert endpoint_id(ip, port) == expected


@pytest.mark.parametrize(
    ("target", "expected"),
    [
        ("api.stripe.com", "ext:api.stripe.com"),
        (" 10.200.0.0/16 ", "ext:10.200.0.0/16"),
        ("smtp-relay.internal", "ext:smtp-relay.internal"),
    ],
)
def test_external_id_format(target: str, expected: str) -> None:
    assert external_id(target) == expected


@pytest.mark.parametrize(
    ("src", "dst", "protocol", "expected"),
    [
        ("svc:gateway", "svc:orders", Protocol.HTTP, "edge:svc:gateway->svc:orders:http"),
        ("proc:100:1", "ep:127.0.0.1:5432", Protocol.PG, "edge:proc:100:1->ep:127.0.0.1:5432:pg"),
        ("svc:orders", "svc:redis", "redis", "edge:svc:orders->svc:redis:redis"),
        (
            "svc:orders",
            "ext:stripe",
            "https",
            "edge:svc:orders->ext:stripe:https",
        ),
    ],
)
def test_edge_id_format(src: str, dst: str, protocol: Protocol | str, expected: str) -> None:
    assert edge_id(src, dst, protocol) == expected
