from prometheus_client import Counter, Gauge, Histogram

scans_total = Counter(
    "dockguard_scans_total",
    "Total number of scans by final status",
    ["status"],
)

scan_duration_seconds = Histogram(
    "dockguard_scan_duration_seconds",
    "Scan duration in seconds",
    buckets=[5, 10, 30, 60, 120, 300],
)

vulnerabilities_found = Counter(
    "dockguard_vulnerabilities_found",
    "Total vulnerabilities found by severity",
    ["severity"],
)

active_scans = Gauge(
    "dockguard_active_scans",
    "Number of currently running scans",
)
