"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getScan, ScanDetail, Vulnerability } from "@/lib/api";

const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "text-red-600 bg-red-50",
  HIGH: "text-orange-600 bg-orange-50",
  MEDIUM: "text-yellow-700 bg-yellow-50",
  LOW: "text-blue-600 bg-blue-50",
};

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
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
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-gray-400">Loading...</p>
      </main>
    );
  }

  if (error || !scan) {
    return (
      <main className="max-w-6xl mx-auto px-4 py-8">
        <p className="text-red-600">{error ?? "Scan not found"}</p>
      </main>
    );
  }

  const filtered: Vulnerability[] =
    filter === "ALL"
      ? scan.vulnerabilities
      : scan.vulnerabilities.filter((v) => v.severity === filter);

  const sorted = [...filtered].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <a href="/scans" className="text-sm text-blue-600 hover:underline">
          ← History
        </a>
        <h1 className="text-2xl font-bold font-mono">{scan.image_name}</h1>
        <span
          className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[scan.scan_status] ?? "bg-gray-100 text-gray-800"}`}
        >
          {scan.scan_status}
        </span>
      </div>

      {scan.summary && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {SEVERITY_ORDER.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(filter === s ? "ALL" : s)}
              className={`rounded-xl p-4 text-left transition-all border-2 ${
                filter === s ? "border-gray-400" : "border-transparent"
              } bg-white shadow hover:shadow-md`}
            >
              <p className="text-xs text-gray-500 mb-1">{s}</p>
              <p
                className={`text-2xl font-bold ${SEVERITY_STYLES[s]?.split(" ")[0] ?? "text-gray-900"}`}
              >
                {scan.summary![s.toLowerCase() as keyof typeof scan.summary] ?? 0}
              </p>
            </button>
          ))}
        </div>
      )}

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold">
            Vulnerabilities ({sorted.length}
            {filter !== "ALL" && ` · ${filter}`})
          </h2>
          {filter !== "ALL" && (
            <button
              onClick={() => setFilter("ALL")}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Clear filter
            </button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-6 py-3">Severity</th>
                <th className="px-6 py-3">CVE ID</th>
                <th className="px-6 py-3">Package</th>
                <th className="px-6 py-3">Installed</th>
                <th className="px-6 py-3">Fixed</th>
                <th className="px-6 py-3">Title</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No vulnerabilities found
                  </td>
                </tr>
              ) : (
                sorted.map((v, i) => (
                  <tr key={`${v.vuln_id}-${i}`} className="hover:bg-gray-50">
                    <td className="px-6 py-3">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-medium ${SEVERITY_STYLES[v.severity] ?? ""}`}
                      >
                        {v.severity}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono text-xs">{v.vuln_id}</td>
                    <td className="px-6 py-3">{v.package_name}</td>
                    <td className="px-6 py-3 font-mono text-xs">{v.installed_version}</td>
                    <td className="px-6 py-3 font-mono text-xs">
                      {v.fixed_version ?? (
                        <span className="text-gray-400">No fix</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500 max-w-xs truncate">{v.title}</td>
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
