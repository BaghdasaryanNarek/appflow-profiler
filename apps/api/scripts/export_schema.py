"""Export JSON Schemas from Pydantic domain, protocol, and advisor models.

Run from repository root:
    uv run --project apps/api python apps/api/scripts/export_schema.py
Or from apps/api:
    uv run python scripts/export_schema.py
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import BaseModel, ConfigDict

from appflow.advisor.models import AnalyzeRequest, OptimizationReport
from appflow.domain.models import (
    EdgeDetail,
    MetaResponse,
    NodeDetail,
    ScenarioInfo,
    TopologyGraph,
    TopologySummary,
)
from appflow.streaming.protocol import ClientMessage, ServerMessage

FROZEN_MODEL_CONFIG = ConfigDict(frozen=True, extra="forbid")


class TopologySchemaBundle(BaseModel):
    """Aggregate bundle generating schemas for all graph entities and REST payloads."""

    model_config = FROZEN_MODEL_CONFIG

    graph: TopologyGraph
    summary: TopologySummary
    node_detail: NodeDetail
    edge_detail: EdgeDetail
    meta: MetaResponse
    scenario: ScenarioInfo


class WSProtocolSchemaBundle(BaseModel):
    """Aggregate bundle generating schemas for all real-time WebSocket protocol messages."""

    model_config = FROZEN_MODEL_CONFIG

    server_message: ServerMessage
    client_message: ClientMessage


class InsightsSchemaBundle(BaseModel):
    """Aggregate bundle generating schemas for Optimization Advisor requests and reports."""

    model_config = FROZEN_MODEL_CONFIG

    report: OptimizationReport
    request: AnalyzeRequest


def _find_repo_root() -> Path:
    """Find repository root whether script is run from apps/api or repo root."""
    current = Path(__file__).resolve().parent
    for candidate in [current, *current.parents]:
        if (candidate / "packages" / "contracts").is_dir():
            return candidate
    raise RuntimeError("Could not locate repository root containing packages/contracts")


def export_schemas() -> None:
    """Generate deterministic, sorted JSON schemas with a single trailing newline."""
    repo_root = _find_repo_root()
    schema_dir = repo_root / "packages" / "contracts" / "schema"
    schema_dir.mkdir(parents=True, exist_ok=True)

    targets: list[tuple[str, type[BaseModel]]] = [
        ("topology.schema.json", TopologySchemaBundle),
        ("ws-protocol.schema.json", WSProtocolSchemaBundle),
        ("insights.schema.json", InsightsSchemaBundle),
    ]

    for filename, model_cls in targets:
        schema: dict[str, Any] = model_cls.model_json_schema()
        target_path = schema_dir / filename
        content = json.dumps(schema, indent=2, sort_keys=True) + "\n"
        target_path.write_text(content, encoding="utf-8")
        print(f"Exported: {target_path.relative_to(repo_root)}")


if __name__ == "__main__":
    export_schemas()
