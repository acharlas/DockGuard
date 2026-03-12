"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import {
  ApiError,
  cancelScan,
  createScan,
  getScan,
  getStats,
  ScanDetail,
  Stats,
  Vulnerability,
} from "@/lib/api";
import {
  SCAN_STATUS,
  SEVERITY_COLORS,
  SEVERITY_ORDER,
  SEVERITY_STYLES,
} from "@/lib/constants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusBadge } from "@/components/StatusBadge";
import { SkeletonStatCards } from "@/components/Skeleton";

function isActiveScanStatus(status: string) {
  return status === SCAN_STATUS.PENDING || status === SCAN_STATUS.RUNNING;
}

export default function Dashboard() {
  const [image, setImage] = useState("");
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const refreshStats = useCallback((showLoading: boolean) => {
    if (showLoading) {
      setStatsLoading(true);
    }
    return getStats()
      .then(setStats)
      .catch((e) => console.error("Failed to load stats", e))
      .finally(() => {
        if (showLoading) {
          setStatsLoading(false);
        }
      });
  }, []);

  useEffect(() => {
    void refreshStats(true);
  }, [refreshStats]);

  useEffect(() => {
    if (activeScanId === null) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;
    const controller = new AbortController();

    const poll = async () => {
      try {
        const data = await getScan(activeScanId, controller.signal);
        if (cancelled || data.id !== activeScanId) {
          return;
        }
        setScan(data);
        if (isActiveScanStatus(data.scan_status)) {
          timeoutId = window.setTimeout(poll, 2000);
          return;
        }
        setActiveScanId(null);
        setLoading(false);
        void refreshStats(false);
      } catch (err) {
        if (cancelled) {
          return;
        }
        if (err instanceof DOMException && err.name === "AbortError") {
          return;
        }
        setError("Failed to fetch scan status");
        setActiveScanId(null);
        setLoading(false);
      }
    };

    void poll();

    return () => {
      cancelled = true;
      controller.abort();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [activeScanId, refreshStats]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!image.trim()) return;

    setError(null);
    setLoading(true);
    setScan(null);

    try {
      const created = await createScan(image.trim());
      if (isActiveScanStatus(created.scan_status)) {
        setScan({ ...created, vulnerabilities: [] });
        setActiveScanId(created.id);
        return;
      }

      const detail = await getScan(created.id);
      setScan(detail);
      setLoading(false);
      void refreshStats(false);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setError(err.detail ?? "Scan queue is full. Try again later.");
      } else {
        setError("Failed to start scan. Check the image name.");
      }
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    if (!scan) return;
    const scanId = scan.id;
    setActiveScanId(null);
    try {
      const updated = await cancelScan(scanId);
      setScan((current) =>
        current
          ? { ...current, ...updated }
          : { ...updated, vulnerabilities: [] }
      );
      if (isActiveScanStatus(updated.scan_status)) {
        setLoading(true);
        setActiveScanId(scanId);
      } else {
        setLoading(false);
        void refreshStats(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const latest = await getScan(scanId);
          setScan(latest);
          setLoading(false);
          if (!isActiveScanStatus(latest.scan_status)) {
            void refreshStats(false);
          }
          return;
        } catch {
          // Fall through to the generic error state below.
        }
      }

      setActiveScanId(scanId);
      setError("Failed to cancel scan.");
    }
  };

  const isActiveScan = scan ? isActiveScanStatus(scan.scan_status) : false;

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
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <span className="text-xl font-mono font-bold tracking-tight text-gray-900 dark:text-gray-100">
            DockGuard
          </span>
          <span className="text-xs font-mono text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700 rounded px-1.5 py-0.5">
            v0.1
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/scans"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            Scan history →
          </Link>
          <ThemeToggle />
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statsLoading ? (
          <SkeletonStatCards count={4} />
        ) : (
          stats && (
            <>
              <StatCard label="Total scans" value={stats.total_scans} />
              <StatCard
                label="Completed"
                value={stats.completed_scans}
                color="text-green-600 dark:text-green-400"
              />
              <StatCard
                label="Failed"
                value={stats.failed_scans}
                color="text-red-600 dark:text-red-400"
              />
              <StatCard
                label="Critical CVEs"
                value={stats.severity_breakdown.critical}
                color="text-red-600 dark:text-red-400"
              />
            </>
          )
        )}
      </div>

      {/* Scan form */}
      <form onSubmit={handleScan} className="flex gap-3 mb-8">
        <input
          type="text"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          placeholder="Enter image name (e.g. nginx:latest)"
          className="flex-1 px-4 py-2.5 font-mono text-sm border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 transition-colors"
          disabled={loading}
        />
        <button
          type="submit"
          disabled={loading || !image.trim()}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600 text-white text-sm font-medium rounded-lg disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <ScanSpinner />
              Scanning
            </span>
          ) : (
            "Scan"
          )}
        </button>
      </form>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Scan status */}
      {scan && (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm font-mono text-gray-500 dark:text-gray-400">
            {scan.image_name}
          </span>
          <span className="text-gray-300 dark:text-gray-700">—</span>
          <StatusBadge status={scan.scan_status} />
          {isActiveScan && (
            <>
              {scan.scan_status === SCAN_STATUS.RUNNING && scan.started_at ? (
                <ElapsedTimer startedAt={scan.started_at} />
              ) : (
                <span className="text-xs font-mono uppercase tracking-wide text-amber-500 dark:text-amber-400">
                  Queued
                </span>
              )}
              <button
                onClick={handleCancel}
                className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}

      {/* Scanning skeleton */}
      {scan && isActiveScan && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
            <div className="skeleton-shimmer h-5 rounded w-40 mb-4" />
            <div className="flex items-center justify-center h-[250px]">
              <div className="skeleton-shimmer rounded-full w-40 h-40" />
            </div>
          </div>
          <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
            <div className="p-6 pb-3">
              <div className="skeleton-shimmer h-5 rounded w-32" />
            </div>
            <table className="w-full text-sm">
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => (
                  <tr
                    key={i}
                    className="border-b border-gray-100 dark:border-gray-800"
                  >
                    {[40, 70, 55, 45, 35].map((w, j) => (
                      <td key={j} className="px-6 py-3">
                        <div
                          className="skeleton-shimmer h-4 rounded"
                          style={{ width: `${w}%` }}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Results: chart + table */}
      {scan?.scan_status === "completed" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Donut chart */}
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-6">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">
              Severity Breakdown
            </h2>
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
                  <Tooltip
                    contentStyle={{
                      background: "var(--tooltip-bg, #fff)",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-gray-400 dark:text-gray-600 text-center py-16 text-sm">
                No vulnerabilities found
              </p>
            )}
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mt-4 justify-center">
              {SEVERITY_ORDER.map((s) => (
                <div key={s} className="flex items-center gap-1.5 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: SEVERITY_COLORS[s] }}
                  />
                  <span className="text-gray-600 dark:text-gray-400">
                    {s}{" "}
                    <span className="font-mono font-bold">
                      (
                      {scan.summary?.[
                        s.toLowerCase() as keyof ScanDetail["summary"]
                      ] ?? 0}
                      )
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Vulnerability table */}
          <div className="lg:col-span-2 bg-white dark:bg-gray-900 rounded-xl shadow overflow-hidden">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 p-6 pb-3">
              Vulnerabilities{" "}
              <span className="font-mono text-gray-900 dark:text-gray-100">
                ({scan.vulnerabilities.length})
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-3">Severity</th>
                    <th className="px-6 py-3">CVE ID</th>
                    <th className="px-6 py-3">Package</th>
                    <th className="px-6 py-3">Installed</th>
                    <th className="px-6 py-3">Fixed</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {[...scan.vulnerabilities]
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

function ScanSpinner() {
  return (
    <svg
      className="animate-spin h-3.5 w-3.5"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
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
    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
      {m}:{String(s).padStart(2, "0")}
    </span>
  );
}

function StatCard({
  label,
  value,
  color = "text-gray-900 dark:text-gray-100",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl shadow p-4 border border-gray-100 dark:border-gray-800">
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
        {label}
      </p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
    </div>
  );
}

function VulnRow({ vuln }: { vuln: Vulnerability }) {
  return (
    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <td className="px-6 py-3">
        <span
          className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_STYLES[vuln.severity] ?? ""}`}
        >
          {vuln.severity}
        </span>
      </td>
      <td className="px-6 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
        {vuln.vuln_id}
      </td>
      <td className="px-6 py-3 text-gray-700 dark:text-gray-300">
        {vuln.package_name}
      </td>
      <td className="px-6 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
        {vuln.installed_version}
      </td>
      <td className="px-6 py-3 font-mono text-xs">
        {vuln.fixed_version ? (
          <span className="text-green-600 dark:text-green-400">
            {vuln.fixed_version}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-600">No fix</span>
        )}
      </td>
    </tr>
  );
}
