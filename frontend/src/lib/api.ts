export interface Vulnerability {
  vuln_id: string;
  package_name: string;
  installed_version: string;
  fixed_version: string | null;
  severity: string;
  title: string;
}

export interface ScanSummary {
  critical: number;
  high: number;
  medium: number;
  low: number;
}

export interface Scan {
  id: number;
  image_name: string;
  scan_status: string;
  started_at: string;
  completed_at: string | null;
  summary: ScanSummary | null;
  created_at: string;
}

export interface ScanDetail extends Scan {
  vulnerabilities: Vulnerability[];
}

export async function createScan(image: string): Promise<Scan> {
  const res = await fetch("/api/v1/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) throw new Error(`Failed to create scan: ${res.status}`);
  return res.json();
}

export async function getScan(id: number): Promise<ScanDetail> {
  const res = await fetch(`/api/v1/scans/${id}`);
  if (!res.ok) throw new Error(`Failed to fetch scan: ${res.status}`);
  return res.json();
}

export async function cancelScan(id: number): Promise<Scan> {
  const res = await fetch(`/api/v1/scans/${id}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error(`Failed to cancel scan: ${res.status}`);
  return res.json();
}
