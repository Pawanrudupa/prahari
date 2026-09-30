from pydantic_settings import BaseSettings

INSECURE_PLACEHOLDER_SECRETS = {
    "prahari-admin-dev-secret",
    "prahari-audit-checkpoint-hmac-secret",
    "prahari-session-dev-secret",
    "admin",
    "secret",
    "change-me",
}


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://prahari:prahari@localhost:5432/prahari"
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    ENV: str = "development"

    # Admin API authentication token
    ADMIN_TOKEN: str = "prahari-admin-dev-secret"

    # HMAC key used to generate signed checkpoints of the audit chain
    AUDIT_HMAC_KEY: str = "prahari-audit-checkpoint-hmac-secret"

    # Checkpoint interval (auto-checkpoint every N appends)
    AUDIT_CHECKPOINT_INTERVAL: int = 50

    # Web session authentication secret
    SESSION_SECRET_KEY: str = "prahari-session-dev-secret"

    # Governance rule: limits fail closed unless explicitly set to fail open
    LIMITS_FAIL_OPEN: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


def validate_security_configuration(s: Settings) -> None:
    """Refuse startup if insecure default placeholder secrets are used outside development."""
    if s.ENV.lower() not in ("development", "dev", "test"):
        if s.ADMIN_TOKEN in INSECURE_PLACEHOLDER_SECRETS or len(s.ADMIN_TOKEN) < 16:
            raise RuntimeError(
                "CRITICAL SECURITY ABORT: ADMIN_TOKEN contains an insecure placeholder "
                "or is too short for non-development environment."
            )
        if s.AUDIT_HMAC_KEY in INSECURE_PLACEHOLDER_SECRETS or len(s.AUDIT_HMAC_KEY) < 16:
            raise RuntimeError(
                "CRITICAL SECURITY ABORT: AUDIT_HMAC_KEY contains an insecure placeholder "
                "or is too short for non-development environment."
            )
        if s.SESSION_SECRET_KEY in INSECURE_PLACEHOLDER_SECRETS or len(s.SESSION_SECRET_KEY) < 16:
            raise RuntimeError(
                "CRITICAL SECURITY ABORT: SESSION_SECRET_KEY contains an insecure placeholder "
                "or is too short for non-development environment."
            )


settings = Settings()
validate_security_configuration(settings)

