"""Unit tests for command line sanitization and credential redaction (Master Plan §4 & §5.1)."""

import pytest

from appflow.sources.sanitize import sanitize_argv, sanitize_cmdline


@pytest.mark.parametrize(
    ("argv", "expected"),
    [
        # Empty input
        ([], ""),
        ([""], ""),
        # Benign commands
        (
            ["python3", "-m", "appflow.main", "--port", "8000"],
            "python3 -m appflow.main --port 8000",
        ),
        # Two-token sensitive flags
        (
            ["myapp", "--password", "supersecret123", "--host", "127.0.0.1"],
            "myapp --password [REDACTED] --host 127.0.0.1",
        ),
        (
            ["cli", "--token", "ghp_xxxxxxxxxxxxxxxxxxxx", "--debug"],
            "cli --token [REDACTED] --debug",
        ),
        (
            ["svc", "--api-key", "sk-1234567890abcdef1234567890abcdef"],
            "svc --api-key [REDACTED]",
        ),
        (
            ["agent", "--secret", "my-confidential-secret"],
            "agent --secret [REDACTED]",
        ),
        # Inline sensitive flags (--flag=value)
        (
            ["server", "--password=mypassword", "--db=mydb"],
            "server --password=[REDACTED] --db=mydb",
        ),
        (
            ["tool", "--access-token=xyz789", "--verbose"],
            "tool --access-token=[REDACTED] --verbose",
        ),
        (
            ["runner", "--client-secret=top_secret_key"],
            "runner --client-secret=[REDACTED]",
        ),
        (
            ["env_tool", "SECRET_KEY=confidential_token"],
            "env_tool SECRET_KEY=[REDACTED]",
        ),
        # Case insensitivity
        (
            ["proc", "--PASSWORD", "secret1", "--API_KEY=key2"],
            "proc --PASSWORD [REDACTED] --API_KEY=[REDACTED]",
        ),
        # Port flag (-p) preservation vs password flag
        (
            ["docker", "run", "-p", "8080", "nginx"],
            "docker run -p 8080 nginx",
        ),
        (
            ["docker", "run", "-p", "8080:80", "nginx"],
            "docker run -p 8080:80 nginx",
        ),
        (
            ["mysql", "-u", "root", "-p", "db_password"],
            "mysql -u root -p [REDACTED]",
        ),
        # URL userinfo credentials
        (
            [
                "worker",
                "--db",
                "postgresql://admin:supersecret@postgres.internal:5432/appflow",
            ],
            "worker --db postgresql://admin:[REDACTED]@postgres.internal:5432/appflow",
        ),
        (
            [
                "client",
                "--url",
                "https://user:pass123@api.stripe.com/v1/charges",
            ],
            "client --url https://user:[REDACTED]@api.stripe.com/v1/charges",
        ),
        # URL query parameter secrets
        (
            [
                "fetcher",
                "https://service.internal/webhook?token=secrettoken123&env=prod",
            ],
            "fetcher https://service.internal/webhook?token=[REDACTED]&env=prod",
        ),
        # Bearer tokens
        (
            ["curl", "-H", "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"],
            "curl -H Bearer [REDACTED]",
        ),
        # High entropy standalone secrets
        (
            ["auth", "ghp_1234567890abcdef1234567890abcdef"],
            "auth [REDACTED]",
        ),
        (
            ["daemon", "xoxb-123456789012-1234567890123-abcdef"],
            "daemon [REDACTED]",
        ),
        # Safe long filesystem paths (contain '/') should NOT be redacted
        (
            [
                "/usr/local/bin/python3",
                "/var/lib/docker/overlay2/longrandomhash1234567890abcdef123456/merged",
            ],
            (
                "/usr/local/bin/python3 "
                "/var/lib/docker/overlay2/longrandomhash1234567890abcdef123456/merged"
            ),
        ),
    ],
)
def test_sanitize_cmdline(argv: list[str], expected: str) -> None:
    assert sanitize_cmdline(argv) == expected


def test_sanitize_argv_preserves_token_list() -> None:
    tokens = ["app", "--password", "secret", "--flag=token_val"]
    result = sanitize_argv(tokens)
    assert result == ["app", "--password", "[REDACTED]", "--flag=token_val"]
