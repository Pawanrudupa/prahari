from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://prahari:prahari@localhost:5432/prahari"
    REDIS_URL: str = "redis://localhost:6379/0"
    CORS_ORIGINS: list[str] = ["http://localhost:5173"]
    ENV: str = "development"

    # Admin API authentication token
    ADMIN_TOKEN: str = "prahari-admin-dev-secret"

    # HMAC key used to generate external checkpoints of the audit chain
    AUDIT_HMAC_KEY: str = "prahari-audit-checkpoint-hmac-secret"

    # Governance rule: whether to fail closed when Redis rate limiter is down
    LIMITS_FAIL_CLOSED: bool = False

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
