import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.config import settings
from app.models.scan import BuildStatus
from app.services.dive import (
    BUILD_ANALYSIS_DISABLED_REASON,
    analyze_image_build,
    parse_dive_report,
    run_dive,
)

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.asyncio
async def test_run_dive_reads_local_image_without_pulling():
    dive_report = json.loads((FIXTURES / "dive_nginx.json").read_text())

    async def fake_run_logged_command(
        _scan_id: int,
        _label: str,
        *args: str,
        timeout: int,
        capture_stdout: bool = True,
    ):
        output_path = args[-1]
        Path(output_path).write_text(json.dumps(dive_report), encoding="utf-8")
        return b""

    with patch(
        "app.services.dive.run_logged_command",
        side_effect=fake_run_logged_command,
    ):
        report = await run_dive(12, "nginx:latest")

    assert report["image"]["sizeBytes"] == 205000000
    assert report["layers"][1]["wastedBytes"] == 8200000


@pytest.mark.asyncio
async def test_run_dive_pulls_only_when_image_is_missing_locally():
    dive_report = json.loads((FIXTURES / "dive_nginx.json").read_text())
    calls: list[str] = []

    async def fake_run_logged_command(
        _scan_id: int,
        _label: str,
        *args: str,
        timeout: int,
        capture_stdout: bool = True,
    ):
        assert timeout > 0
        calls.append(args[0])
        if args[0] == "docker":
            return b"pulled"

        if calls.count("dive") == 1:
            raise RuntimeError("dive exited with code 1: no such image")

        output_path = args[-1]
        Path(output_path).write_text(json.dumps(dive_report), encoding="utf-8")
        return b""

    with patch(
        "app.services.dive.run_logged_command",
        side_effect=fake_run_logged_command,
    ):
        report = await run_dive(12, "nginx:latest")

    assert calls == ["dive", "docker", "dive"]
    assert report["image"]["sizeBytes"] == 205000000


def test_parse_dive_report_extracts_summary_and_layers(dive_report):
    summary, reduced_report = parse_dive_report(dive_report)

    assert summary == {
        "image_size_bytes": 205000000,
        "efficiency_score": 0.87,
        "wasted_bytes": 18450000,
        "wasted_percent": 9.0,
        "layer_count": 4,
        "inefficient_layer_count": 2,
    }
    assert reduced_report is not None
    assert reduced_report["layers"][0]["layer_id"] == "sha256:layer-3"
    assert reduced_report["layers"][0]["instruction"] == "COPY . /app"


def test_parse_dive_report_supports_current_dive_schema():
    report = {
        "image": {
            "sizeBytes": 160_906_013,
            "efficiencyScore": 0.9872356355,
            "inefficientBytes": 3_741_324,
            "fileReference": [
                {
                    "count": 2,
                    "sizeBytes": 1_645_998,
                    "file": "/var/cache/debconf/templates.dat",
                },
                {
                    "count": 2,
                    "sizeBytes": 1_606_413,
                    "file": "/var/cache/debconf/templates.dat-old",
                },
                {
                    "count": 2,
                    "sizeBytes": 198_022,
                    "file": "/var/lib/dpkg/status",
                },
                {
                    "count": 2,
                    "sizeBytes": 197_496,
                    "file": "/var/lib/dpkg/status-old",
                },
            ],
        },
        "layer": [
            {
                "index": 0,
                "digestId": "sha256:base",
                "sizeBytes": 78_613_569,
                "command": "FROM debian:trixie",
                "fileList": [
                    {"path": "/var/cache/debconf/templates.dat"},
                    {"path": "/var/cache/debconf/templates.dat-old"},
                    {"path": "/var/lib/dpkg/status"},
                    {"path": "/var/lib/dpkg/status-old"},
                ],
            },
            {
                "index": 1,
                "digestId": "sha256:update",
                "sizeBytes": 21_000_000,
                "command": "RUN apt-get update",
                "fileList": [
                    {"path": "/var/cache/debconf/templates.dat"},
                    {"path": "/var/cache/debconf/templates.dat-old"},
                    {"path": "/var/lib/dpkg/status"},
                    {"path": "/var/lib/dpkg/status-old"},
                ],
            },
            {
                "index": 2,
                "digestId": "sha256:app",
                "sizeBytes": 12_500_000,
                "command": "COPY . /app",
                "fileList": [{"path": "/app/server.py"}],
            },
        ],
    }

    summary, reduced_report = parse_dive_report(report)

    assert summary == {
        "image_size_bytes": 160_906_013,
        "efficiency_score": 0.99,
        "wasted_bytes": 3_741_324,
        "wasted_percent": 2.33,
        "layer_count": 3,
        "inefficient_layer_count": 1,
    }
    assert reduced_report is not None
    assert reduced_report["layers"][0]["layer_id"] == "sha256:update"
    assert reduced_report["layers"][0]["instruction"] == "RUN apt-get update"
    assert reduced_report["layers"][0]["wasted_bytes"] == 3_647_929
    assert reduced_report["layers"][0]["wasted_percent"] == 17.37


def test_parse_dive_report_falls_back_to_file_reference_contributors():
    report = {
        "image": {
            "sizeBytes": 100_000_000,
            "efficiencyScore": 0.94,
            "inefficientBytes": 6_000_000,
            "fileReference": [
                {"count": 2, "sizeBytes": 4_000_000, "file": "/tmp/cache.bin"},
                {"count": 2, "sizeBytes": 2_000_000, "file": "/tmp/index.db"},
            ],
        },
        "layer": [
            {
                "index": 0,
                "digestId": "sha256:base",
                "sizeBytes": 80_000_000,
                "command": "FROM base",
                "fileList": [{"path": "/usr/bin/python"}],
            },
            {
                "index": 1,
                "digestId": "sha256:app",
                "sizeBytes": 20_000_000,
                "command": "COPY app /app",
                "fileList": [{"path": "/app/main.py"}],
            },
        ],
    }

    summary, reduced_report = parse_dive_report(report)

    assert summary == {
        "image_size_bytes": 100_000_000,
        "efficiency_score": 0.94,
        "wasted_bytes": 6_000_000,
        "wasted_percent": 6.0,
        "layer_count": 2,
        "inefficient_layer_count": 2,
    }
    assert reduced_report is not None
    assert reduced_report["layers"][0]["instruction"] == "/tmp/cache.bin"
    assert reduced_report["layers"][0]["wasted_bytes"] == 4_000_000
    assert reduced_report["layers"][1]["instruction"] == "/tmp/index.db"


def test_parse_dive_report_returns_none_for_empty_payload():
    summary, reduced_report = parse_dive_report({"layers": []})

    assert summary is None
    assert reduced_report is None


def test_parse_dive_report_keeps_full_contributor_count_when_rows_are_truncated():
    report = {
        "image": {
            "sizeBytes": 120_000_000,
            "efficiencyScore": 0.82,
            "inefficientBytes": 24_000_000,
        },
        "layers": [
            {
                "digestId": f"sha256:layer-{index}",
                "sizeBytes": 5_000_000,
                "wastedBytes": 1_000_000 + index,
                "command": f"RUN step {index}",
            }
            for index in range(15)
        ],
    }

    summary, reduced_report = parse_dive_report(report)

    assert summary is not None
    assert summary["inefficient_layer_count"] == 15
    assert reduced_report is not None
    assert len(reduced_report["layers"]) == 12


@pytest.mark.asyncio
async def test_analyze_image_build_maps_failures_without_crashing():
    with patch(
        "app.services.dive.run_dive",
        AsyncMock(side_effect=RuntimeError("dive exited with code 1: boom")),
    ):
        result = await analyze_image_build(3, "nginx:latest")

    assert result.status == BuildStatus.FAILED
    assert result.failure_reason == "dive_failed"


@pytest.mark.asyncio
async def test_analyze_image_build_returns_unavailable_when_disabled(monkeypatch):
    monkeypatch.setattr(settings, "enable_build_analysis", False)

    with patch("app.services.dive.run_dive", AsyncMock()) as run_dive_mock:
        result = await analyze_image_build(7, "nginx:latest")

    assert result.status == BuildStatus.UNAVAILABLE
    assert result.failure_reason == BUILD_ANALYSIS_DISABLED_REASON
    run_dive_mock.assert_not_awaited()
