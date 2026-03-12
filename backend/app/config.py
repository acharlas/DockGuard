from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://dockguard:dockguard@localhost:5432/dockguard"
    )
    cors_origins: list[str] = ["http://localhost:3000"]
    trivy_timeout: int = 600
    max_concurrent_scans: int = 3
    max_pending_scans: int = 25
    stats_recent_scan_limit: int = 100
    redis_url: str | None = None  # Optional — cache disabled when absent

    model_config = {"env_file": ".env"}


settings = Settings()
