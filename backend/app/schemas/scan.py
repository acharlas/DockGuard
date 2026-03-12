import re
from datetime import datetime

from pydantic import BaseModel, field_validator

IMAGE_NAME_PATTERN = re.compile(
    r"^[a-zA-Z0-9]([a-zA-Z0-9._/-]*[a-zA-Z0-9])?(:[\w][\w.-]{0,127})?(@sha256:[a-fA-F0-9]{64})?$"
)


class ScanCreate(BaseModel):
    image: str

    @field_validator("image")
    @classmethod
    def validate_image_name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 256:
            raise ValueError("Image name must be between 1 and 256 characters")
        if not IMAGE_NAME_PATTERN.match(v):
            raise ValueError("Invalid image name")
        return v


class ScanSummary(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    unknown: int = 0


class VulnerabilityOut(BaseModel):
    vuln_id: str
    package_name: str
    installed_version: str
    fixed_version: str | None = None
    severity: str
    title: str


class ScanOut(BaseModel):
    id: int
    image_name: str
    image_digest: str | None = None
    scan_status: str
    started_at: datetime
    completed_at: datetime | None = None
    summary: ScanSummary | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanDetailOut(ScanOut):
    vulnerabilities: list[VulnerabilityOut] = []


class ScanListOut(BaseModel):
    items: list[ScanOut]
    total: int
    page: int
    size: int


class TopCve(BaseModel):
    vuln_id: str
    count: int
    severity: str
    title: str


class TopImage(BaseModel):
    image_name: str
    scan_count: int


class StatsOut(BaseModel):
    total_scans: int
    completed_scans: int
    failed_scans: int
    severity_breakdown: ScanSummary
    top_cves: list[TopCve]
    top_images: list[TopImage]
