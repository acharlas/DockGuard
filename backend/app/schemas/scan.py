from datetime import datetime

from pydantic import BaseModel, Field, field_validator

FORBIDDEN_IMAGE_CHARS = set(" \t\r\n;|&`$<>\"'(){}[]\\")


class ScanCreate(BaseModel):
    image: str

    @field_validator("image")
    @classmethod
    def validate_image_name(cls, v: str) -> str:
        v = v.strip()
        if not v or len(v) > 256:
            raise ValueError("Image name must be between 1 and 256 characters")
        if any(char in FORBIDDEN_IMAGE_CHARS for char in v):
            raise ValueError("Invalid image name")
        name_part, separator, digest = v.partition("@")
        if separator:
            if not digest.startswith("sha256:") or len(digest) != 71:
                raise ValueError("Invalid image name")
            digest_value = digest.removeprefix("sha256:")
            if any(ch not in "0123456789abcdefABCDEF" for ch in digest_value):
                raise ValueError("Invalid image name")

        slash_name = name_part.rsplit("/", 1)[-1]
        repository, tag_separator, tag = slash_name.partition(":")
        if not repository:
            raise ValueError("Invalid image name")
        if tag_separator:
            if not tag or len(tag) > 128:
                raise ValueError("Invalid image name")
            if ":" in tag:
                raise ValueError("Invalid image name")
        else:
            tag = ""

        repository_path = name_part[
            : len(name_part) - len(tag) - (1 if tag_separator else 0)
        ]
        if "//" in repository_path or repository_path.endswith("/"):
            raise ValueError("Invalid image name")
        if repository_path.endswith(":"):
            raise ValueError("Invalid image name")
        return v


class ScanSummary(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    unknown: int = 0


class BuildSummary(BaseModel):
    image_size_bytes: int | None = None
    efficiency_score: float | None = None
    wasted_bytes: int | None = None
    wasted_percent: float | None = None
    layer_count: int | None = None
    inefficient_layer_count: int | None = None


class BuildLayerOut(BaseModel):
    index: int
    layer_id: str | None = None
    instruction: str | None = None
    size_bytes: int | None = None
    wasted_bytes: int | None = None
    wasted_percent: float | None = None
    efficiency_score: float | None = None


class BuildReportOut(BaseModel):
    layers: list[BuildLayerOut] = Field(default_factory=list)


class BuildOut(BaseModel):
    status: str
    failure_reason: str | None = None
    summary: BuildSummary | None = None
    report: BuildReportOut | None = None


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
    build_status: str | None = None
    build_summary: BuildSummary | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    summary: ScanSummary | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ScanDetailOut(ScanOut):
    vulnerabilities: list[VulnerabilityOut] = Field(default_factory=list)
    build: BuildOut | None = None


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


class BuildBreakdown(BaseModel):
    completed: int = 0
    failed: int = 0
    unavailable: int = 0


class StatsOut(BaseModel):
    total_scans: int
    completed_scans: int
    failed_scans: int
    severity_breakdown: ScanSummary
    build_breakdown: BuildBreakdown
    avg_efficiency_score: float | None = None
    total_wasted_bytes: int
    top_cves: list[TopCve]
    top_images: list[TopImage]
