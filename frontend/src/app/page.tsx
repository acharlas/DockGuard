"use client";

import { useState, useEffect, useCallback } from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  cancelScan,
  createScan,
  getScan,
  getStats,
  ScanDetail,
  Stats,
  Vulnerability,
} from "@/lib/api";

const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#ca8a04",
  LOW: "#2563eb",
};

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

export default function Dashboard() {
  const [image, setImage] = useState("");
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    getStats()
      .then(setStats)
      .catch((e) => console.error("Failed to load stats", e));
  }, []);

  const pollScan = useCallback(async (id: number) => {
    try {
      const data = await getScan(id);
      setScan(data);
      if (data.scan_status === "pending" || data.scan_status === "running") {
        setTimeout(() => pollScan(id), 2000);
      } else {
        setLoading(false);
        getStats()
          .then(setStats)
          .catch((e) => console.error("Failed to load stats", e));
      }
    } catch {
      setError("Failed to fetch scan status");
      setLoading(false);
    }
  }, []);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image.trim()) return;

    setError(null);
    setLoading(true);
    setScan(null);

    try {
      const created = await createScan(image.trim());
      setScan({ ...created, vulnerabilities: [] });
      pollScan(created.id);
    } catch {
      setError("Failed to start scan. Check the image name.");
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!scan) return;
    try {
      const updated = await cancelScan(scan.id);
      setScan({ ...updated, vulnerabilities: [] });
      setLoading(false);
    } catch {
      setError("Failed to cancel scan.");
    }
  };

  const chartData =
    scan?.summary
      ? SEVERITY_ORDER.filter(
          (s) =>
            scan.summary![s.toLowerCase() as keyof typeof scan.summary] > 0
        ).map((s) => ({
          name: s,
          value: scan.summary![s.toLowerCase() as keyof typeof scan.summary],
        }))
      : [];

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">DockGuard</h1>
        <a href="/scans" className="text-sm text-blue-600 hover:underline">
          Scan history →
        </a>
      </div>

      {/* Stats cards */}
      {stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total scans" value={stats.total_scans} />
          <StatCard
            label="Completed"
            value={stats.completed_scans}
            color="text-green-600"
          />
          <StatCard
            label="Failed"
            value={stats.failed_scans}
            color="text-red-600"
          />
          <StatCard
            label="Critical CVEs"
            value={stats.severity_breakdown.critical}
            color="text-red-600"
          />
        </div>
      )}

      {/* Scan form */}
      <form onSubmit={handleScan} className="flex gap-3 mb-8">
        <input
          type="text"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="Enter image name (e.g. nginx:latest)"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !image.trim()}
          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Scanning..." : "Scan"}
        </button>
      </form>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg">
          {error}
        </div>
      )}

      {/* Scan status */}
      {scan && (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm text-gray-500">{scan.image_name} &mdash;</span>
          <StatusBadge status={scan.scan_status} />
          {(scan.scan_status === "pending" || scan.scan_status === "running") && (
            <>
              <ElapsedTimer startedAt={scan.started_at} />
              <button
                onClick={handleCancel}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Results: chart + table */}
      {scan?.scan_status === "completed" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Donut chart */}
          <div className="bg-white rounded-xl shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Severity Breakdown</h2>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.name}
                        fill={SEVERITY_COLORS[entry.name]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 text-center py-16">
                No vulnerabilities found
              </p>
            )}
            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 justify-center">
              {SEVERITY_ORDER.map((s) => (
                <div key={s} className="flex items-center gap-1.5 text-sm">
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ backgroundColor: SEVERITY_COLORS[s] }}
                  />
                  {s} (
                  {scan.summary?.[
                    s.toLowerCase() as keyof ScanDetail["summary"]
                  ] ?? 0}
                  )
                </div>
              ))}
            </div>
          </div>

          {/* Vulnerability table */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow overflow-hidden">
            <h2 className="text-lg font-semibold p-6 pb-3">
              Vulnerabilities ({scan.vulnerabilities.length})
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-left text-gray-600">
                  <tr>
                    <th className="px-6 py-3">Severity</th>
                    <th className="px-6 py-3">CVE ID</th>
                    <th className="px-6 py-3">Package</th>
                    <th className="px-6 py-3">Installed</th>
                    <th className="px-6 py-3">Fixed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {scan.vulnerabilities
                    .sort(
                      (a, b) =>
                        SEVERITY_ORDER.indexOf(a.severity) -
                        SEVERITY_ORDER.indexOf(b.severity)
                    )
                    .map((v, i) => (
                      <VulnRow key={`${v.vuln_id}-${i}`} vuln={v} />
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    running: "bg-blue-100 text-blue-800",
    completed: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    cancelled: "bg-gray-100 text-gray-600",
  };

  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] ?? "bg-gray-100 text-gray-800"}`}
    >
      {status}
    </span>
  );
}

function ElapsedTimer({ startedAt }: { startedAt: string }) {
  const [elapsed, setElapsed] = useState(
    Math.floor((Date.now() - Date.parse(startedAt)) / 1000)
  );

  useEffect(() => {
    const id = setInterval(
      () => setElapsed(Math.floor((Date.now() - Date.parse(startedAt)) / 1000)),
      1000
    );
    return () => clearInterval(id);
  }, [startedAt]);

  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return (
    <span className="text-xs text-gray-400 font-mono">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function StatCard({
  label,
  value,
  color = "text-gray-900",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function VulnRow({ vuln }: { vuln: Vulnerability }) {
  const severityStyles: Record<string, string> = {
    CRITICAL: "text-red-600 bg-red-50",
    HIGH: "text-orange-600 bg-orange-50",
    MEDIUM: "text-yellow-700 bg-yellow-50",
    LOW: "text-blue-600 bg-blue-50",
  };

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-6 py-3">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${severityStyles[vuln.severity] ?? ""}`}
        >
          {vuln.severity}
        </span>
      </td>
      <td className="px-6 py-3 font-mono text-xs">{vuln.vuln_id}</td>
      <td className="px-6 py-3">{vuln.package_name}</td>
      <td className="px-6 py-3 font-mono text-xs">
        {vuln.installed_version}
      </td>
      <td className="px-6 py-3 font-mono text-xs">
        {vuln.fixed_version ?? (
          <span className="text-gray-400">No fix</span>
        )}
      </td>
    </tr>
  );
}
