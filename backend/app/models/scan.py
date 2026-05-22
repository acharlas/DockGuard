from datetime import datetime
from enum import StrEnum

from sqlalchemy import JSON, DateTime, Index, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class ScanStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class BuildStatus(StrEnum):
    COMPLETED = "completed"
    FAILED = "failed"
    UNAVAILABLE = "unavailable"


class Base(DeclarativeBase):
    pass


class ScanResult(Base):
    __tablename__ = "scan_results"
    __table_args__ = (
        Index("idx_image_status", "image_name", "scan_status"),
        Index("idx_scan_status", "scan_status"),
        Index("idx_status_created", "scan_status", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    image_name: Mapped[str] = mapped_column(String(255))
    image_digest: Mapped[str | None] = mapped_column(String(255))
    scan_status: Mapped[str] = mapped_column(String(20), default=ScanStatus.PENDING)
    failure_reason: Mapped[str | None] = mapped_column(String(255))
    cancel_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    summary: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql")
    )
    raw_report: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql")
    )
    build_status: Mapped[str | None] = mapped_column(String(20))
    build_failure_reason: Mapped[str | None] = mapped_column(String(255))
    build_summary: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql")
    )
    build_report: Mapped[dict | None] = mapped_column(
        JSON().with_variant(JSONB(), "postgresql")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
