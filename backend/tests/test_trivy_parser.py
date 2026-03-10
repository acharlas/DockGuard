from app.services.trivy_parser import compute_summary, parse_vulnerabilities


def test_parse_vulnerabilities(trivy_report):
    vulns = parse_vulnerabilities(trivy_report)
    assert len(vulns) == 4
    assert vulns[0]["vuln_id"] == "CVE-2024-0001"
    assert vulns[0]["severity"] == "CRITICAL"
    assert vulns[0]["package_name"] == "libssl3"
    assert vulns[0]["fixed_version"] == "3.0.13-1~deb12u2"
    assert vulns[2]["fixed_version"] is None


def test_parse_vulnerabilities_empty():
    assert parse_vulnerabilities(None) == []
    assert parse_vulnerabilities({}) == []
    assert parse_vulnerabilities({"Results": []}) == []


def test_compute_summary(trivy_report):
    summary = compute_summary(trivy_report)
    assert summary == {"critical": 1, "high": 1, "medium": 1, "low": 1}


def test_compute_summary_empty():
    assert compute_summary(None) == {
        "critical": 0, "high": 0, "medium": 0, "low": 0,
    }
