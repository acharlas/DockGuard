from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://dockguard:dockguard@localhost:5432/dockguard"
    )
    cors_origins: list[str] = ["http://localhost:3000"]
    trivy_timeout: int = 600
    build_timeout: int = 600
    enable_build_analysis: bool = True
    max_concurrent_scans: int = 3
    max_pending_scans: int = 25
    semaphore_acquire_timeout: int = 1800
    redis_url: str | None = None  # Optional — cache disabled when absent
    # Limits how many recent completed scans are aggregated for the top-CVE list.
    # Prevents unbounded memory use as scan history grows.
    stats_recent_scan_limit: int = 100
    shutdown_timeout_seconds: float = 10.0
    tag_dedup_enabled: bool = True
    tag_dedup_cache_seconds: int = 300

    model_config = {"env_file": ".env"}


settings = Settings()
