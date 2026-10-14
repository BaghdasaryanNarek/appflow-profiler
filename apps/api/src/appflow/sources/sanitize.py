"""Sanitization of command line arguments and credentials (Master Plan §4 & §5.1)."""

import re
from collections.abc import Sequence

# Canonical sensitive parameter names (case-insensitive, hyphens/underscores normalized)
SENSITIVE_PARAM_NAMES = {
    "password",
    "passwd",
    "pass",
    "token",
    "access_token",
    "api_key",
    "apikey",
    "key",
    "secret",
    "secret_key",
    "client_secret",
    "private_key",
    "auth",
    "authorization",
    "jwt",
}

# Regex to redact credentials in URL userinfo: scheme://user:password@host
_URL_USERINFO_RE = re.compile(r"([a-zA-Z][a-zA-Z0-9+.-]*://[^:/@\s]+):([^@\s]+)@")

# Regex to redact query parameters in URLs: ?password=... &token=...
_URL_QUERY_SECRET_RE = re.compile(
    r"([?&](?:password|passwd|token|api_key|apikey|secret|key|access_token)=)[^&\s]+",
    re.IGNORECASE,
)

# Known token prefixes (GitHub tokens, JWT headers, Slack tokens)
_KNOWN_TOKEN_PREFIXES = ("ghp_", "gho_", "ghu_", "ghs_", "ghr_", "xoxb-", "xoxp-", "eyJ")

# Long random hex / base64 secret pattern
# (>= 32 chars of pure alphanumeric/dashes without path separators)
_OPAQUE_SECRET_RE = re.compile(r"^[A-Za-z0-9_-]{32,}$")

# Numeric port or port-pair pattern for -p flag (e.g. 8080 or 8080:80)
_PORT_PATTERN_RE = re.compile(r"^\d+(?::\d+)?$")


def _is_sensitive_key(key: str) -> bool:
    """Check if normalized flag name matches sensitive keyword registry."""
    normalized = key.lstrip("-").lower().replace("-", "_")
    if normalized in SENSITIVE_PARAM_NAMES:
        return True
    return any(
        normalized.endswith(suffix)
        for suffix in ("_key", "_secret", "_token", "_password", "_passwd")
    )


def _sanitize_string_value(val: str) -> str:
    """Redact embedded credentials inside a single string argument."""
    # 1. Redact URL credentials: scheme://user:secret@host -> scheme://user:[REDACTED]@host
    redacted = _URL_USERINFO_RE.sub(r"\1:[REDACTED]@", val)

    # 2. Redact sensitive query parameters in URLs
    redacted = _URL_QUERY_SECRET_RE.sub(r"\1[REDACTED]", redacted)

    # 3. Check for known token prefixes or Bearer tokens
    if redacted.lower().startswith("bearer ") and len(redacted) > 7:
        return "Bearer [REDACTED]"

    for prefix in _KNOWN_TOKEN_PREFIXES:
        if redacted.startswith(prefix):
            return "[REDACTED]"

    # 4. Check for standalone high-entropy hex / base64 secret token
    # Exclude filesystem paths (containing '/') or domain names / files (containing '.')
    if "/" not in redacted and "." not in redacted and _OPAQUE_SECRET_RE.match(redacted):
        return "[REDACTED]"

    return redacted


def sanitize_argv(argv: Sequence[str]) -> list[str]:
    """Sanitize a list of command line arguments, redacting sensitive tokens and flags."""
    if not argv:
        return []

    sanitized: list[str] = []
    skip_next = False

    for i, token in enumerate(argv):
        if skip_next:
            skip_next = False
            continue

        token_str = str(token)

        # Handle --flag=value or KEY=value
        if "=" in token_str and not token_str.startswith("http"):
            key_part, val_part = token_str.split("=", 1)
            if _is_sensitive_key(key_part):
                sanitized.append(f"{key_part}=[REDACTED]")
                continue

            # Even if key is not explicitly sensitive, sanitize value for URLs/tokens
            sanitized_val = _sanitize_string_value(val_part)
            sanitized.append(f"{key_part}={sanitized_val}")
            continue

        # Handle two-token flags: --password <val> or -p <val>
        if token_str.startswith("-"):
            norm_flag = token_str.lstrip("-").lower().replace("-", "_")

            # Short -p flag (distinguish port vs password)
            if norm_flag == "p" and i + 1 < len(argv):
                next_val = argv[i + 1]
                if _PORT_PATTERN_RE.match(next_val):
                    sanitized.append(token_str)
                    continue

                sanitized.append(token_str)
                sanitized.append("[REDACTED]")
                skip_next = True
                continue

            # General sensitive flag: --password <val>, --token <val>, etc.
            if _is_sensitive_key(token_str) and i + 1 < len(argv):
                sanitized.append(token_str)
                sanitized.append("[REDACTED]")
                skip_next = True
                continue

        # General string sanitization (URLs, tokens, etc.)
        sanitized.append(_sanitize_string_value(token_str))

    return sanitized


def sanitize_cmdline(argv: Sequence[str]) -> str:
    """Format and sanitize command line arguments into a display-safe string."""
    if not argv:
        return ""
    sanitized_tokens = sanitize_argv(argv)
    return " ".join(sanitized_tokens)
