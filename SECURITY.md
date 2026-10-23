# Security Policy

## Supported Versions

| Version | Supported |
| :--- | :--- |
| `1.0.x` | Yes |
| `< 1.0.0` | No |

---

## Security Architecture & Controls

**AppFlow Profiler** enforces defense-in-depth across process telemetry collection, WebSocket streaming, LLM integration, and cloud deployment:

1. **Process Command-Line Secret Redaction (`apps/api/src/appflow/sources/sanitize.py`)**:
   - Operating system process `cmdline` arguments are scrubbed via regex before leaving `PsutilSource` (`--password`, `--token`, `--secret`, `--api-key`, `Authorization: Bearer`, connection string credentials, `AWS_SECRET`, `PRIVATE_KEY`) and truncated to a maximum of 256 characters.
   - Process environment variables (`psutil.Process.environ()`) are never read or transmitted.
2. **Server-Side API Key Isolation (`GEMINI_API_KEY`)**:
   - `GEMINI_API_KEY` is stored as a `pydantic.SecretStr` in `apps/api/src/appflow/config.py`, never logged, and never exposed in REST responses or client bundles.
   - Only compact, aggregated `TopologyDigest` payloads (`≤ 6 KB`) are sent to the Gemini API—never raw socket tables or process command lines.
3. **Strict CORS & WebSocket Origin Validation**:
   - Both HTTP requests and `WS /ws/v1/topology` handshakes validate the `Origin` header against `ALLOWED_ORIGINS` and `ALLOWED_ORIGIN_SUFFIXES` (default `.vercel.app`), rejecting unauthorized WebSocket upgrades with status code `1008`.
4. **RFC 9457 Problem Details & Rate Limiting**:
   - All error responses conform to `application/problem+json` without leaking internal stack traces.
   - Mutating simulation endpoints (`/api/v1/simulation/*`) and `/api/v1/insights/analyze` are protected by per-IP token-bucket rate limiters (`Retry-After`).
5. **Container & HTTP Header Hardening**:
   - `apps/api/Dockerfile` runs as non-root `USER appflow` (`UID 10001`).
   - `apps/web/next.config.ts` and `apps/web/vercel.json` enforce `Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and `Permissions-Policy`.

---

## Reporting a Vulnerability

If you discover a security vulnerability in AppFlow Profiler, please report it privately via [GitHub Security Advisories](https://github.com/BaghdasaryanNarek/appflow-profiler/security/advisories/new) rather than opening a public issue. We will acknowledge receipt within 48 hours and provide a remediation timeline.
