"""Runtime configuration loaded from environment variables (Master Plan §6.5, Phase 17)."""

import re
from enum import StrEnum
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

LogLevel = Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"]


def _normalize_suffix(raw: str) -> str:
    """Normalize an origin domain suffix (e.g. '*.vercel.app' or 'vercel.app' -> '.vercel.app')."""
    cleaned = raw.strip().lower().rstrip("/")
    if cleaned.startswith("*."):
        cleaned = cleaned[1:]
    elif cleaned and not cleaned.startswith("."):
        cleaned = f".{cleaned}"
    return cleaned


class Environment(StrEnum):
    """Selects the topology source: real OS sockets, simulation, or deterministic test mode."""

    LIVE = "live"
    DEMO = "demo"
    TEST = "test"


class Settings(BaseSettings):
    """Application settings. Every field maps to an upper-case environment variable."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
        frozen=True,
    )

    env: Environment = Environment.LIVE
    tick_ms: int = Field(default=1000, ge=50, le=60_000)
    snapshot_every_s: int = Field(default=30, ge=1, le=3600)
    max_ws_clients: int = Field(default=50, ge=1, le=10_000)
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000", "http://127.0.0.1:3000"]
    )
    allowed_origin_suffixes: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [".vercel.app"]
    )

    sim_seed: int = 42
    sim_scale: float = Field(default=1.0, gt=0, le=100)
    sim_autoplay: bool = True

    gemini_api_key: SecretStr | None = None
    gemini_model: str = "gemini-3.8-flash"
    advisor_timeout_s: float = Field(default=25.0, gt=0, le=120)

    log_level: LogLevel = "INFO"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_csv(cls, value: object) -> object:
        """Accept a comma-separated string or list and strip whitespace and trailing slashes."""
        if isinstance(value, str):
            return [origin.strip().rstrip("/") for origin in value.split(",") if origin.strip()]
        if isinstance(value, list):
            return [str(origin).strip().rstrip("/") for origin in value if str(origin).strip()]
        return value

    @field_validator("allowed_origin_suffixes", mode="before")
    @classmethod
    def _split_suffix_csv(cls, value: object) -> object:
        """Accept a comma-separated string or list of HTTPS domain suffixes (e.g. '.vercel.app')."""
        if isinstance(value, str):
            return [_normalize_suffix(item) for item in value.split(",") if item.strip()]
        if isinstance(value, list):
            return [_normalize_suffix(str(item)) for item in value if str(item).strip()]
        return value

    @field_validator("log_level", mode="before")
    @classmethod
    def _upper_log_level(cls, value: object) -> object:
        return value.upper() if isinstance(value, str) else value

    @property
    def allow_origin_regex(self) -> str | None:
        """Build a compiled-safe regex for HTTPS preview origins matching configured suffixes."""
        if not self.allowed_origin_suffixes:
            return None
        escaped = [re.escape(suffix) for suffix in self.allowed_origin_suffixes if suffix]
        if not escaped:
            return None
        joined = "|".join(escaped)
        return rf"^https://[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*(?:{joined})$"

    def is_origin_allowed(self, origin: str | None) -> bool:
        """Check whether an HTTP or WebSocket Origin header is permitted."""
        if not origin:
            return True
        clean = origin.strip().rstrip("/")
        if any(allowed == "*" or allowed.rstrip("/") == clean for allowed in self.allowed_origins):
            return True
        regex = self.allow_origin_regex
        return bool(regex and re.fullmatch(regex, clean))

    @property
    def is_simulated(self) -> bool:
        """True when topology data comes from the simulation engine instead of psutil."""
        return self.env in (Environment.DEMO, Environment.TEST)

    @property
    def ai_enabled(self) -> bool:
        """True when a Gemini API key is configured."""
        return self.gemini_api_key is not None and bool(self.gemini_api_key.get_secret_value())


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()
