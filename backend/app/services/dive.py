import json
import logging
import os
import shutil
import tempfile
from dataclasses import dataclass

from app.config import settings
from app.models.scan import BuildStatus
from app.services.subprocesses import run_logged_command

_MAX_REPORTED_LAYERS = 12
_MISSING_LOCAL_IMAGE_TOKENS = (
    "no such image",
    "image not found",
    "could not find image",
    "reference does not exist",
)
_IMAGE_PULL_FAILURE_TOKENS = (
    "pull access denied",
    "requested access to the resource is denied",
    "manifest unknown",
    "name unknown",
    "repository does not exist",
)
BUILD_ANALYSIS_DISABLED_REASON = "build_analysis_disabled"
logger = logging.getLogger(__name__)


@dataclass(slots=True)
class BuildAnalysisResult:
    status: str
    summary: dict | None = None
    report: dict | None = None
    failure_reason: str | None = None


def _coerce_int(value: object) -> int | None:
    if value is None or value == "":
        return None
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value))
        except ValueError:
            return None
    return None


def _coerce_float(value: object) -> float | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value)
        except ValueError:
            return None
    return None


def _process_file_references(
    file_references: object,
    image_size: int | None,
) -> tuple[dict[str, int], list[dict], int | None]:
    if not isinstance(file_references, list):
        return {}, [], None

    duplicate_file_sizes: dict[str, int] = {}
    contributor_rows: list[dict] = []
    total_inefficient_bytes = 0
    has_duplicates = False

    for index, reference in enumerate(file_references):
        if not isinstance(reference, dict):
            continue

        path = reference.get("file")
        size_bytes = _coerce_int(reference.get("sizeBytes"))
        count = _coerce_int(reference.get("count"))
        if (
            not isinstance(path, str)
            or not path
            or size_bytes is None
            or not count
            or count < 2
        ):
            continue

        duplicate_file_sizes[path] = size_bytes
        wasted_bytes = size_bytes * (count - 1)
        total_inefficient_bytes += wasted_bytes
        has_duplicates = True

        wasted_percent = None
        if image_size:
            wasted_percent = round((wasted_bytes / image_size) * 100, 2)

        contributor_rows.append(
            {
                "index": index,
                "layer_id": path,
                "instruction": path,
                "size_bytes": size_bytes,
                "wasted_bytes": wasted_bytes,
                "wasted_percent": wasted_percent,
                "efficiency_score": None,
            }
        )

    return (
        duplicate_file_sizes,
        contributor_rows,
        total_inefficient_bytes if has_duplicates else None,
    )


def _derive_layer_waste_from_files(
    raw_layers: list[dict],
    duplicate_file_sizes: dict[str, int],
) -> dict[int, int]:
    if not raw_layers or not duplicate_file_sizes:
        return {}

    seen_paths: set[str] = set()
    derived_waste_by_layer: dict[int, int] = {}

    for index, layer in enumerate(raw_layers):
        file_list = (
            layer.get("fileList") if isinstance(layer.get("fileList"), list) else []
        )
        current_paths = {
            path
            for item in file_list
            if isinstance(item, dict)
            for path in [item.get("path")]
            if isinstance(path, str) and path in duplicate_file_sizes
        }
        if not current_paths:
            continue

        wasted_bytes = sum(
            duplicate_file_sizes[path] for path in current_paths if path in seen_paths
        )
        if wasted_bytes > 0:
            derived_waste_by_layer[index] = wasted_bytes

        seen_paths.update(current_paths)

    return derived_waste_by_layer


async def _run_dive_json_file(scan_id: int, image_name: str, output_path: str) -> dict:
    await run_logged_command(
        scan_id,
        "dive",
        "dive",
        image_name,
        "-j",
        output_path,
        timeout=settings.build_timeout,
        capture_stdout=False,
    )
    with open(output_path, encoding="utf-8") as handle:
        return json.load(handle)


def _should_retry_after_pull(exc: RuntimeError) -> bool:
    message = str(exc).lower()
    return any(token in message for token in _MISSING_LOCAL_IMAGE_TOKENS)


async def run_dive(scan_id: int, image_name: str) -> dict:
    fd, output_path = tempfile.mkstemp(prefix="dockguard-dive-", suffix=".json")
    os.close(fd)
    try:
        try:
            return await _run_dive_json_file(scan_id, image_name, output_path)
        except RuntimeError as exc:
            if not _should_retry_after_pull(exc):
                raise

        await run_logged_command(
            scan_id,
            "docker",
            "docker",
            "pull",
            image_name,
            timeout=settings.build_timeout,
            capture_stdout=False,
        )
        return await _run_dive_json_file(scan_id, image_name, output_path)
    finally:
        if os.path.exists(output_path):
            os.unlink(output_path)


def log_build_runtime_status() -> None:
    if not settings.enable_build_analysis:
        logger.info("Build analysis disabled by configuration")
        return
    if shutil.which("dive") is None:
        logger.warning("Build analysis unavailable: dive binary is missing")
        return
    if shutil.which("docker") is None:
        logger.warning("Build analysis unavailable: docker CLI is missing")
        return
    if not os.path.exists("/var/run/docker.sock"):
        logger.warning(
            "Build analysis unavailable: /var/run/docker.sock is not mounted"
        )


def parse_dive_report(report: dict | None) -> tuple[dict | None, dict | None]:
    if not isinstance(report, dict):
        return None, None

    image_section = report.get("image") if isinstance(report.get("image"), dict) else {}

    image_size = _coerce_int(image_section.get("sizeBytes"))
    wasted_bytes = _coerce_int(image_section.get("inefficientBytes"))
    efficiency_score = _coerce_float(image_section.get("efficiencyScore"))
    if efficiency_score is not None:
        efficiency_score = round(efficiency_score, 2)

    # Dive v0.13.1 uses "layer" (singular); accept "layers" as fallback
    raw_layers = report.get("layer") if isinstance(report.get("layer"), list) else []
    if not raw_layers and isinstance(report.get("layers"), list):
        raw_layers = report["layers"]

    duplicate_file_sizes, contributor_rows, duplicate_wasted_bytes = (
        _process_file_references(image_section.get("fileReference"), image_size)
    )
    if wasted_bytes is None:
        wasted_bytes = duplicate_wasted_bytes
    derived_waste_by_layer = _derive_layer_waste_from_files(
        raw_layers,
        duplicate_file_sizes,
    )

    wasted_percent = None
    if image_size and wasted_bytes is not None:
        wasted_percent = round((wasted_bytes / image_size) * 100, 2)

    layers: list[dict] = []
    for index, layer in enumerate(raw_layers):
        if not isinstance(layer, dict):
            continue
        size_bytes = _coerce_int(layer.get("sizeBytes"))
        layer_wasted_bytes = derived_waste_by_layer.get(index)
        layer_wasted_percent = None
        if layer_wasted_bytes is not None and size_bytes:
            layer_wasted_percent = round((layer_wasted_bytes / size_bytes) * 100, 2)
        layers.append(
            {
                "index": index,
                "layer_id": layer.get("digestId"),
                "instruction": layer.get("command"),
                "size_bytes": size_bytes,
                "wasted_bytes": layer_wasted_bytes,
                "wasted_percent": layer_wasted_percent,
                "efficiency_score": None,
            }
        )

    layer_count = len(raw_layers) or None
    meaningful_layers = sorted(
        (layer for layer in layers if (layer.get("wasted_bytes") or 0) > 0),
        key=lambda layer: layer.get("wasted_bytes") or 0,
        reverse=True,
    )
    inefficient_layer_count = len(meaningful_layers) or len(contributor_rows) or None

    summary = {
        "image_size_bytes": image_size,
        "efficiency_score": efficiency_score,
        "wasted_bytes": wasted_bytes,
        "wasted_percent": wasted_percent,
        "layer_count": layer_count,
        "inefficient_layer_count": inefficient_layer_count,
    }
    if all(value is None for value in summary.values()):
        return None, None

    reduced_report = {
        "layers": meaningful_layers[:_MAX_REPORTED_LAYERS]
        or contributor_rows[:_MAX_REPORTED_LAYERS]
    }
    return summary, reduced_report


def _build_failure_reason(exc: Exception) -> str:
    message = str(exc).lower()
    if (
        "cannot connect to the docker daemon" in message
        or "permission denied" in message
        or "docker exited with code" in message
        or "docker: not found" in message
    ):
        return "docker_unavailable"
    if any(token in message for token in _IMAGE_PULL_FAILURE_TOKENS):
        return "image_pull_failed"
    return "dive_failed"


async def analyze_image_build(scan_id: int, image_name: str) -> BuildAnalysisResult:
    if not settings.enable_build_analysis:
        return BuildAnalysisResult(
            status=BuildStatus.UNAVAILABLE,
            failure_reason=BUILD_ANALYSIS_DISABLED_REASON,
        )
    try:
        report = await run_dive(scan_id, image_name)
        summary, reduced_report = parse_dive_report(report)
        if summary is None:
            return BuildAnalysisResult(
                status=BuildStatus.FAILED,
                failure_reason="build_report_unparseable",
            )
        return BuildAnalysisResult(
            status=BuildStatus.COMPLETED,
            summary=summary,
            report=reduced_report,
        )
    except FileNotFoundError:
        return BuildAnalysisResult(
            status=BuildStatus.UNAVAILABLE,
            failure_reason="docker_unavailable",
        )
    except Exception as exc:
        reason = _build_failure_reason(exc)
        status = (
            BuildStatus.UNAVAILABLE
            if reason == "docker_unavailable"
            else BuildStatus.FAILED
        )
        return BuildAnalysisResult(status=status, failure_reason=reason)
