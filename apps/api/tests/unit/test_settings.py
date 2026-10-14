"""Settings parsing tests."""

import pytest
from pydantic import ValidationError

from appflow.config import Environment, Settings, get_settings


def test_defaults_are_live_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ENV", raising=False)
    settings = Settings(_env_file=None)
    assert settings.env is Environment.LIVE
    assert settings.tick_ms == 1000
    assert settings.allowed_origins == ["http://localhost:3000"]
    assert settings.gemini_model == "gemini-3.8-flash"
    assert not settings.is_simulated
    assert not settings.ai_enabled


@pytest.mark.parametrize(
    ("raw", "expected", "simulated"),
    [
        ("live", Environment.LIVE, False),
        ("demo", Environment.DEMO, True),
        ("test", Environment.TEST, True),
        ("DEMO", Environment.DEMO, True),
    ],
)
def test_env_variable_selects_mode(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: Environment, simulated: bool
) -> None:
    monkeypatch.setenv("ENV", raw.lower())
    settings = get_settings()
    assert settings.env is expected
    assert settings.is_simulated is simulated


def test_invalid_env_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENV", "production")
    with pytest.raises(ValidationError):
        Settings()


def test_allowed_origins_parses_csv(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALLOWED_ORIGINS", " https://appflow.vercel.app/ , http://localhost:3000,, ")
    assert Settings().allowed_origins == ["https://appflow.vercel.app", "http://localhost:3000"]


def test_allowed_origins_accepts_list() -> None:
    settings = Settings(allowed_origins=["https://a.example", "https://b.example"])
    assert settings.allowed_origins == ["https://a.example", "https://b.example"]


def test_log_level_is_normalised(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_LEVEL", "debug")
    assert Settings().log_level == "DEBUG"


def test_ai_enabled_requires_non_empty_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("GEMINI_API_KEY", "")
    assert not Settings().ai_enabled
    monkeypatch.setenv("GEMINI_API_KEY", "test-key")
    assert Settings().ai_enabled


def test_tick_bounds_are_enforced() -> None:
    with pytest.raises(ValidationError):
        Settings(tick_ms=10)


def test_get_settings_is_cached() -> None:
    assert get_settings() is get_settings()
