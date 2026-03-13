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


def _get_candidate(mapping: dict | None, *keys: str) -> object:
    if not isinstance(mapping, dict):
        return None
    for key in keys:
        value = mapping.get(key)
        if value is not None:
            return value
    return None


def _normalize_score(value: object) -> float | None:
    score = _coerce_float(value)
    if score is None:
        return None
    if score > 1:
        score = score / 100
    return round(score, 2)


def _normalize_percent(value: object) -> float | None:
    percent = _coerce_float(value)
    if percent is None:
        return None
    if percent <= 1:
        percent = percent * 100
    return round(percent, 2)


def _collect_duplicate_file_sizes(
    file_references: object,
) -> tuple[dict[str, int], int | None]:
    if not isinstance(file_references, list):
        return {}, None

    duplicate_file_sizes: dict[str, int] = {}
    total_inefficient_bytes = 0
    has_duplicates = False

    for reference in file_references:
        if not isinstance(reference, dict):
            continue

        path = _get_candidate(reference, "file", "path")
        size_bytes = _coerce_int(_get_candidate(reference, "sizeBytes", "size"))
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
        total_inefficient_bytes += size_bytes * (count - 1)
        has_duplicates = True

    return duplicate_file_sizes, total_inefficient_bytes if has_duplicates else None


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


def _build_contributor_rows(
    file_references: object,
    image_size: int | None,
) -> list[dict]:
    if not isinstance(file_references, list):
        return []

    contributors: list[dict] = []
    for index, reference in enumerate(file_references):
        if not isinstance(reference, dict):
            continue

        path = _get_candidate(reference, "file", "path")
        size_bytes = _coerce_int(_get_candidate(reference, "sizeBytes", "size"))
        count = _coerce_int(reference.get("count"))
        if (
            not isinstance(path, str)
            or not path
            or size_bytes is None
            or not count
            or count < 2
        ):
            continue

        wasted_bytes = size_bytes * (count - 1)
        wasted_percent = None
        if image_size:
            wasted_percent = round((wasted_bytes / image_size) * 100, 2)

        contributors.append(
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

    return contributors


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
    return "dive exited with code" in message and any(
        token in message for token in _MISSING_LOCAL_IMAGE_TOKENS
    )


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
    metrics_section = (
        report.get("metrics") if isinstance(report.get("metrics"), dict) else {}
    )
    summary_source = image_section or metrics_section or report

    image_size = _coerce_int(
        _get_candidate(
            summary_source,
            "sizeBytes",
            "size",
            "imageSizeBytes",
            "imageSize",
        )
    )
    wasted_bytes = _coerce_int(
        _get_candidate(
            summary_source,
            "inefficientBytes",
            "wastedBytes",
            "wastedByteCount",
            "wasted",
        )
    )
    efficiency_score = _normalize_score(
        _get_candidate(
            summary_source,
            "efficiencyScore",
            "efficiency",
            "efficiencyPercent",
        )
    )
    wasted_percent = _normalize_percent(
        _get_candidate(
            summary_source,
            "wastedPercent",
            "wastedPercentage",
            "userWastedPercent",
        )
    )

    raw_layers = report.get("layers") if isinstance(report.get("layers"), list) else []
    if not raw_layers and isinstance(report.get("layer"), list):
        raw_layers = report["layer"]

    duplicate_file_sizes, duplicate_wasted_bytes = _collect_duplicate_file_sizes(
        image_section.get("fileReference")
    )
    contributor_rows = _build_contributor_rows(
        image_section.get("fileReference"),
        image_size,
    )
    if wasted_bytes is None:
        wasted_bytes = duplicate_wasted_bytes
    derived_waste_by_layer = _derive_layer_waste_from_files(
        raw_layers,
        duplicate_file_sizes,
    )

    layers: list[dict] = []
    for index, layer in enumerate(raw_layers):
        if not isinstance(layer, dict):
            continue
        size_bytes = _coerce_int(
            _get_candidate(layer, "sizeBytes", "size", "layerSizeBytes")
        )
        layer_wasted_bytes = _coerce_int(
            _get_candidate(
                layer,
                "inefficientBytes",
                "wastedBytes",
                "wasted",
                "wastedByteCount",
            )
        )
        if layer_wasted_bytes is None:
            layer_wasted_bytes = derived_waste_by_layer.get(index)
        layer_wasted_percent = _normalize_percent(
            _get_candidate(layer, "wastedPercent", "wastedPercentage")
        )
        if (
            layer_wasted_percent is None
            and size_bytes
            and layer_wasted_bytes is not None
        ):
            layer_wasted_percent = round((layer_wasted_bytes / size_bytes) * 100, 2)
        layer_efficiency = _normalize_score(
            _get_candidate(layer, "efficiencyScore", "efficiency")
        )
        layers.append(
            {
                "index": index,
                "layer_id": _get_candidate(
                    layer,
                    "digestId",
                    "id",
                    "digest",
                    "layerId",
                ),
                "instruction": _get_candidate(
                    layer,
                    "command",
                    "createdBy",
                    "instruction",
                    "description",
                ),
                "size_bytes": size_bytes,
                "wasted_bytes": layer_wasted_bytes,
                "wasted_percent": layer_wasted_percent,
                "efficiency_score": layer_efficiency,
            }
        )

    layer_count = (
        _coerce_int(_get_candidate(report, "layerCount")) or len(raw_layers) or None
    )
    meaningful_layers = sorted(
        (layer for layer in layers if (layer.get("wasted_bytes") or 0) > 0),
        key=lambda layer: layer.get("wasted_bytes") or 0,
        reverse=True,
    )
    inefficient_layer_count = len(meaningful_layers) or len(contributor_rows) or None

    if wasted_percent is None and image_size and wasted_bytes is not None:
        wasted_percent = round((wasted_bytes / image_size) * 100, 2)

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
