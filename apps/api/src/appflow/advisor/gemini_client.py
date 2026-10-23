"""Gemini Interactions API async client for structured optimization reports (Master Plan §4.4)."""

import asyncio
import json
from typing import Any

import structlog
from google import genai

from appflow.advisor.digest import TopologyDigest
from appflow.advisor.models import OptimizationReport
from appflow.advisor.prompts import SYSTEM_INSTRUCTION, build_analysis_user_prompt

logger = structlog.get_logger(__name__)


class GeminiAdvisorError(Exception):
    """Raised when an interaction with the Gemini API fails or times out."""


class GeminiAdvisorClient:
    """Async client wrapping the Gemini Interactions API with structured output enforcement."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "gemini-3.8-flash",
        timeout_s: float = 25.0,
        client: Any = None,
    ) -> None:
        self._model = model
        self._timeout_s = timeout_s
        self._client = client
        if self._client is None and api_key:
            self._client = genai.Client(api_key=api_key)

    @property
    def is_configured(self) -> bool:
        """Whether a valid client instance is available for API interactions."""
        return self._client is not None

    async def analyze(
        self,
        digest: TopologyDigest,
        focus: str | None = None,
    ) -> OptimizationReport:
        """Call the Gemini Interactions API to generate a structured OptimizationReport.

        Raises:
            GeminiAdvisorError: If client is unconfigured, API call fails, or validation fails.
        """
        if not self.is_configured:
            raise GeminiAdvisorError("Gemini client is not configured (missing GEMINI_API_KEY)")

        user_prompt = build_analysis_user_prompt(digest, focus=focus)
        schema = OptimizationReport.model_json_schema()

        try:
            logger.info(
                "advisor.gemini.request",
                model=self._model,
                scope=digest.scope,
                digest_hash=digest.digest_hash[:8],
                timeout_s=self._timeout_s,
            )

            response = await asyncio.wait_for(
                self._client.aio.interactions.create(
                    model=self._model,
                    input=user_prompt,
                    system_instruction=SYSTEM_INSTRUCTION,
                    store=False,
                    response_mime_type="application/json",
                    response_format=schema,
                    timeout=self._timeout_s,
                ),
                timeout=self._timeout_s,
            )

            raw_text = getattr(response, "output_text", None)
            if not raw_text:
                if isinstance(response, str):
                    raw_text = response
                elif isinstance(response, dict):
                    raw_text = response.get("output_text") or json.dumps(response)
                else:
                    raise GeminiAdvisorError("Gemini interaction response returned empty text")

            cleaned = raw_text.strip()
            if cleaned.startswith("```json"):
                cleaned = cleaned[7:]
            elif cleaned.startswith("```"):
                cleaned = cleaned[3:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]
            cleaned = cleaned.strip()

            report = OptimizationReport.model_validate_json(cleaned)

            # Enforce verified runtime metadata stamps
            return report.model_copy(
                update={
                    "source": "gemini",
                    "model": self._model,
                    "digest_hash": digest.digest_hash,
                }
            )
        except Exception as exc:
            logger.warning(
                "advisor.gemini.failed",
                error=str(exc),
                digest_hash=digest.digest_hash[:8],
            )
            raise GeminiAdvisorError(f"Gemini interaction failed: {exc}") from exc
