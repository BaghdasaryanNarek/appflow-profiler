"""Unit tests for TopologySource factory and lazy import guarantees (Master Plan §4 & §5.1)."""

import subprocess
import sys

import pytest

from appflow.config import Environment, Settings
from appflow.sources.base import TopologySource
from appflow.sources.factory import build_source
from appflow.sources.psutil_source import PsutilSource


def test_lazy_import_no_psutil_leak() -> None:
    """Importing appflow.sources must not eagerly import psutil."""
    code = (
        "import sys\n"
        "import appflow.sources\n"
        "import appflow.sources.base\n"
        "import appflow.sources.factory\n"
        "assert 'psutil' not in sys.modules, f'psutil leaked: {sys.modules.get(\"psutil\")}'\n"
    )
    res = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=False)
    assert res.returncode == 0, f"Subprocess failed with stderr:\n{res.stderr}"


def test_build_source_live() -> None:
    settings = Settings(env=Environment.LIVE)
    source = build_source(settings)
    assert isinstance(source, TopologySource)
    assert isinstance(source, PsutilSource)


def test_build_source_demo_raises_phase5_notice() -> None:
    settings = Settings(env=Environment.DEMO)
    with pytest.raises(RuntimeError, match="Phase 5"):
        build_source(settings)


def test_build_source_test_raises_phase5_notice() -> None:
    settings = Settings(env=Environment.TEST)
    with pytest.raises(RuntimeError, match="Phase 5"):
        build_source(settings)


def test_build_source_unsupported_mode() -> None:
    settings = Settings()
    # Force an invalid environment value on settings
    object.__setattr__(settings, "env", "unsupported_mode")
    with pytest.raises(ValueError, match="Unsupported environment mode"):
        build_source(settings)
