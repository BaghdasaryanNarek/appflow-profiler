"""Unit tests verifying JSON Schema export determinism (Master Plan §4 & Phase 3)."""

import json

from scripts.export_schema import _find_repo_root, export_schemas


def test_export_schemas_determinism() -> None:
    repo_root = _find_repo_root()
    schema_dir = repo_root / "packages" / "contracts" / "schema"

    # Export schemas
    export_schemas()

    expected_files = [
        "topology.schema.json",
        "ws-protocol.schema.json",
        "insights.schema.json",
    ]

    for filename in expected_files:
        path = schema_dir / filename
        assert path.is_file(), f"Expected schema file missing: {filename}"

        content = path.read_text(encoding="utf-8")
        assert content.endswith("\n"), f"{filename} must end with a single newline"

        # Verify JSON is parseable
        data = json.loads(content)
        assert isinstance(data, dict)
        assert "$defs" in data or "properties" in data

        # Verify sorted keys formatting determinism
        reformatted = json.dumps(data, indent=2, sort_keys=True) + "\n"
        assert content == reformatted, (
            f"{filename} formatting is not deterministic with sorted keys"
        )


def test_export_schemas_idempotent() -> None:
    repo_root = _find_repo_root()
    schema_dir = repo_root / "packages" / "contracts" / "schema"

    export_schemas()
    first_pass = {f.name: f.read_bytes() for f in schema_dir.glob("*.json")}

    export_schemas()
    second_pass = {f.name: f.read_bytes() for f in schema_dir.glob("*.json")}

    assert first_pass == second_pass, "Schema export must be strictly idempotent"
