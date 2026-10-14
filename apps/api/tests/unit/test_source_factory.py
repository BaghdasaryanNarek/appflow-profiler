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


def test_build_source_demo() -> None:
    settings = Settings(env=Environment.DEMO)
    source = build_source(settings)
    assert isinstance(source, TopologySource)
    assert source.__class__.__name__ == "SimulationSource"


def test_build_source_test() -> None:
    settings = Settings(env=Environment.TEST)
    source = build_source(settings)
    assert isinstance(source, TopologySource)
    assert source.__class__.__name__ == "SimulationSource"


def test_demo_mode_no_psutil_subprocess() -> None:
    """Building demo source and stepping simulation must never import psutil."""
    code = (
        "import sys, asyncio\n"
        "from appflow.config import Settings, Environment\n"
        "from appflow.sources.factory import build_source\n"
        "settings = Settings(env=Environment.DEMO)\n"
        "source = build_source(settings)\n"
        "asyncio.run(source.sample())\n"
        "assert 'psutil' not in sys.modules, f'psutil leaked: {sys.modules.get(\"psutil\")}'\n"
    )
    res = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=False)
    assert res.returncode == 0, f"Subprocess failed with stderr:\n{res.stderr}"


def test_build_source_unsupported_mode() -> None:
    settings = Settings()
    # Force an invalid environment value on settings
    object.__setattr__(settings, "env", "unsupported_mode")
    with pytest.raises(ValueError, match="Unsupported environment mode"):
        build_source(settings)
