"use client";

import { useEffect, useState } from "react";
import { listScans, Scan } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SkeletonTableRows } from "@/components/Skeleton";

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

export default function ScansPage() {
  const [scans, setScans] = useState<Scan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const PAGE_SIZE = 20;

  useEffect(() => {
    setLoading(true);
    listScans(page, PAGE_SIZE)
      .then((data) => {
        setScans(data.items);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, [page]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <main className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <a
            href="/"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            ← Back
          </a>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Scan History
          </h1>
          <span className="text-sm font-mono text-gray-400 dark:text-gray-500">
            {loading ? "…" : `${total} total`}
          </span>
        </div>
        <ThemeToggle />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl shadow border border-gray-100 dark:border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-left text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Image</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Critical</th>
                <th className="px-6 py-3">High</th>
                <th className="px-6 py-3">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {loading ? (
                <SkeletonTableRows rows={8} cols={5} />
              ) : scans.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-gray-400 dark:text-gray-600 text-sm"
                  >
                    No scans yet — run your first scan from the{" "}
                    <a
                      href="/"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      dashboard
                    </a>
                  </td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr
                    key={scan.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => (window.location.href = `/scans/${scan.id}`)}
                  >
                    <td className="px-6 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {scan.image_name}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[scan.scan_status] ?? "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300"}`}
                      >
                        {scan.scan_status}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono font-medium text-red-600 dark:text-red-400">
                      {scan.summary?.critical ?? "—"}
                    </td>
                    <td className="px-6 py-3 font-mono font-medium text-orange-600 dark:text-orange-400">
                      {scan.summary?.high ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-400 dark:text-gray-500 font-mono">
                      {new Date(scan.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-40 transition-colors"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500 dark:text-gray-400 font-mono">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-sm border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 disabled:opacity-40 transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
