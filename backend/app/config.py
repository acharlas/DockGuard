from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = (
        "postgresql+asyncpg://dockguard:dockguard@localhost:5432/dockguard"
    )
    cors_origins: list[str] = ["http://localhost:3000"]
    trivy_timeout: int = 300
    max_concurrent_scans: int = 3

    model_config = {"env_file": ".env"}


settings = Settings()
