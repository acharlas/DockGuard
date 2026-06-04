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
  unknown: number;
}

export interface BuildSummary {
  image_size_bytes: number | null;
  efficiency_score: number | null;
  wasted_bytes: number | null;
  wasted_percent: number | null;
  layer_count: number | null;
  inefficient_layer_count: number | null;
}

export interface BuildLayer {
  index: number;
  layer_id: string | null;
  instruction: string | null;
  size_bytes: number | null;
  wasted_bytes: number | null;
  wasted_percent: number | null;
  efficiency_score: number | null;
}

export interface BuildReport {
  layers: BuildLayer[];
}

export interface BuildAnalysis {
  status: string;
  failure_reason: string | null;
  summary: BuildSummary | null;
  report: BuildReport | null;
}

export interface Scan {
  id: number;
  image_name: string;
  image_digest?: string | null;
  scan_status: string;
  build_status?: string | null;
  build_summary?: BuildSummary | null;
  started_at: string | null;
  completed_at: string | null;
  summary: ScanSummary | null;
  created_at: string;
}

export interface ScanDetail extends Scan {
  vulnerabilities: Vulnerability[];
  build?: BuildAnalysis | null;
}

export class ApiError extends Error {
  status: number;
  detail: string | null;

  constructor(status: number, detail: string | null, fallbackMessage: string) {
    super(detail ?? fallbackMessage);
    this.status = status;
    this.detail = detail;
  }
}

async function throwApiError(res: Response, fallbackMessage: string): Promise<never> {
  let detail: string | null = null;
  try {
    const body = (await res.json()) as { detail?: string };
    detail = body.detail ?? null;
  } catch {
    detail = null;
  }
  throw new ApiError(res.status, detail, fallbackMessage);
}

export async function createScan(image: string): Promise<Scan> {
  const res = await fetch("/api/v1/scans", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image }),
  });
  if (!res.ok) {
    await throwApiError(res, `Failed to create scan: ${res.status}`);
  }
  return res.json();
}

export async function getScan(id: number, signal?: AbortSignal): Promise<ScanDetail> {
  const res = await fetch(`/api/v1/scans/${id}`, { signal });
  if (!res.ok) {
    await throwApiError(res, `Failed to fetch scan: ${res.status}`);
  }
  return res.json();
}

export async function cancelScan(id: number): Promise<Scan> {
  const res = await fetch(`/api/v1/scans/${id}/cancel`, { method: "POST" });
  if (!res.ok) {
    await throwApiError(res, `Failed to cancel scan: ${res.status}`);
  }
  return res.json();
}

export interface ScanListOut {
  items: Scan[];
  total: number;
  page: number;
  size: number;
}

export interface ScanListParams {
  page?: number;
  size?: number;
  status?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export async function listScans(
  params: ScanListParams = {}
): Promise<ScanListOut> {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.size) query.set("size", String(params.size));
  if (params.status) query.set("status", params.status);
  if (params.date_from) query.set("date_from", params.date_from);
  if (params.date_to) query.set("date_to", params.date_to);
  if (params.search) query.set("search", params.search);

  const res = await fetch(`/api/v1/scans?${query}`);
  if (!res.ok) {
    await throwApiError(res, `Failed to list scans: ${res.status}`);
  }
  return res.json();
}

export interface TopCve {
  vuln_id: string;
  count: number;
  severity: string;
  title: string;
}

export interface TopImage {
  image_name: string;
  scan_count: number;
}

export interface BuildBreakdown {
  completed: number;
  failed: number;
  unavailable: number;
}

export interface Stats {
  total_scans: number;
  completed_scans: number;
  failed_scans: number;
  severity_breakdown: ScanSummary;
  build_breakdown: BuildBreakdown;
  avg_efficiency_score: number | null;
  total_wasted_bytes: number;
  top_cves: TopCve[];
  top_images: TopImage[];
}

export async function getStats(): Promise<Stats> {
  const res = await fetch("/api/v1/stats");
  if (!res.ok) {
    await throwApiError(res, `Failed to fetch stats: ${res.status}`);
  }
  return res.json();
}
