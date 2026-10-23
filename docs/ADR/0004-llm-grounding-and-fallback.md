# ADR 0004: LLM Grounding Guard & Deterministic Heuristic Fallback

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

An AI optimization advisor must never block or fail when `GEMINI_API_KEY` is omitted in CI/local environments, when upstream LLM quotas are exhausted, or when the model hallucinates non-existent node identifiers. Furthermore, raw OS process command lines and full historical buffers must never be transmitted to external LLM APIs.

## Decision

1. **Privacy-Preserving Compact Digest (`≤ 6 KB`)**: Summarize only aggregated metric statistics and canonical IDs for the top 25 anomalous nodes and top 30 edges, hashed via SHA-256 (`digest_hash`).
2. **Strict Grounding Guard**: Validate every `evidence_ids` entry returned by Gemini (`gemini-3.8-flash` with Structured Outputs) against the live `TopologyGraph`. Strip unknown IDs and reject ungrounded recommendations.
3. **Deterministic SRE Heuristic Fallback**: Pair the Gemini client with a 7-category deterministic rule engine (`heuristics.py`) that executes in `< 2 ms` whenever Gemini is unconfigured, times out, or errors, tagging the report provenance cleanly (`source: "gemini" | "heuristic"`).

## Consequences

- **Positive:** 100% availability for `/insights` across offline, CI, and cloud environments, zero hallucinated evidence links in the UI, and strict data-minimization guarantees.
- **Trade-off:** Heuristic rules require threshold calibration alongside domain health thresholds.
