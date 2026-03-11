"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getScan, ScanDetail, Vulnerability } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SkeletonDetailPage } from "@/components/Skeleton";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL:
    "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50",
  HIGH: "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/50",
  MEDIUM:
    "text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/50",
  LOW: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50",
};

const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
};

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [filter, setFilter] = useState<string>("ALL");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getScan(Number(id))
      .then(setScan)
      .catch(() => setError("Scan not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <SkeletonDetailPage />;
  }

  if (error || !scan) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-red-600 dark:text-red-400">
          {error ?? "Scan not found"}
        </p>
      </main>
    );
  }

  const filtered: Vulnerability[] =
    filter === "ALL"
      ? scan.vulnerabilities
      : scan.vulnerabilities.filter((v) => v.severity === filter);

  const sorted = [...filtered].sort(
    (a, b) =>
      SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <a
            href="/scans"
            className="shrink-0 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            ← History
          </a>
          <h1 className="text-xl font-bold font-mono text-gray-900 dark:text-gray-100 truncate">
            {scan.image_name}
          </h1>
          <span
            className={`shrink-0 px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[scan.scan_status] ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"}`}
          >
            {scan.scan_status}
          </span>
        </div>
        <ThemeToggle />
      </div>

      {scan.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {SEVERITY_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? "ALL" : s)}
              className={`rounded-xl p-4 text-left transition-all border-2 bg-white dark:bg-gray-900 shadow hover:shadow-md ${
                filter === s
                  ? "border-gray-400 dark:border-gray-500"
                  : "border-transparent"
              }`}
            >
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wider">
                {s}
              </p>
              <p
                className={`text-2xl font-bold font-mono ${SEVERITY_STYLES[s]?.split(" ")[0] ?? "text-gray-900 dark:text-gray-100"}`}
              >
                {scan.summary![s.toLowerCase() as keyof typeof scan.summary] ??
                  0}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            Vulnerabilities{" "}
            <span className="font-mono text-gray-900 dark:text-gray-100">
              ({sorted.length}
              {filter !== "ALL" && (
                <span className="text-gray-400 dark:text-gray-500">
                  {" "}
                  · {filter}
                </span>
              )}
              )
            </span>
          </h2>
          {filter !== "ALL" && (
            <button
              onClick={() => setFilter("ALL")}
              className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
            >
              Clear filter ×
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Severity</th>
                <th className="px-6 py-3">CVE ID</th>
                <th className="px-6 py-3">Package</th>
                <th className="px-6 py-3">Installed</th>
                <th className="px-6 py-3">Fixed</th>
                <th className="px-6 py-3">Title</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-gray-400 dark:text-gray-600 text-sm"
                  >
                    No vulnerabilities found
                  </td>
                </tr>
              ) : (
                sorted.map((v, i) => (
                  <tr
                    key={`${v.vuln_id}-${i}`}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                  >
                    <td className="px-6 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_STYLES[v.severity] ?? ""}`}
                      >
                        {v.severity}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {v.vuln_id}
                    </td>
                    <td className="px-6 py-3 text-gray-700 dark:text-gray-300">
                      {v.package_name}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">
                      {v.installed_version}
                    </td>
                    <td className="px-6 py-3 font-mono text-xs">
                      {v.fixed_version ? (
                        <span className="text-green-600 dark:text-green-400">
                          {v.fixed_version}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-600">
                          No fix
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500 dark:text-gray-400 max-w-xs truncate">
                      {v.title}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
