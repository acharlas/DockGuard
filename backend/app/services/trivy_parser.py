def parse_vulnerabilities(raw_report: dict | None) -> list[dict]:
    """Extract flat vulnerability list from Trivy JSON report.

    Trivy output structure:
    {"Results": [{"Vulnerabilities": [{"VulnerabilityID": ..., ...}]}]}
    """
    if not raw_report:
        return []

    vulns = []
    for result in raw_report.get("Results", []):
        for v in result.get("Vulnerabilities", []):
            vulns.append(
                {
                    "vuln_id": v.get("VulnerabilityID", ""),
                    "package_name": v.get("PkgName", ""),
                    "installed_version": v.get("InstalledVersion", ""),
                    "fixed_version": v.get("FixedVersion"),
                    "severity": v.get("Severity", "UNKNOWN"),
                    "title": v.get("Title", ""),
                }
            )
    return vulns


def extract_image_digest(raw_report: dict | None) -> str | None:
    """Return the immutable image digest reported by Trivy, if available."""
    if not raw_report:
        return None

    metadata = raw_report.get("Metadata") or {}
    for repo_digest in metadata.get("RepoDigests", []):
        _, separator, digest = repo_digest.partition("@")
        if separator and digest.startswith("sha256:"):
            return digest

    image_id = metadata.get("ImageID")
    if isinstance(image_id, str) and image_id.startswith("sha256:"):
        return image_id
    return None


def compute_summary(raw_report: dict | None) -> dict:
    """Count vulnerabilities by severity from Trivy JSON report."""
    summary = {"critical": 0, "high": 0, "medium": 0, "low": 0, "unknown": 0}
    for v in parse_vulnerabilities(raw_report):
        key = v["severity"].lower()
        if key in summary:
            summary[key] += 1
    return summary
