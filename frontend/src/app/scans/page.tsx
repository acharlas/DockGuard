"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listScans, Scan } from "@/lib/api";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusBadge } from "@/components/StatusBadge";
import { SkeletonTableRows } from "@/components/Skeleton";

export default function ScansPage() {
  const router = useRouter();
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
          <Link
            href="/"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            ← Back
          </Link>
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
                <th className="px-6 py-3">Submitted</th>
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
                    <Link
                      href="/"
                      className="text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      dashboard
                    </Link>
                  </td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr
                    key={scan.id}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => router.push(`/scans/${scan.id}`)}
                  >
                    <td className="px-6 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">
                      {scan.image_name}
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={scan.scan_status} />
                    </td>
                    <td className="px-6 py-3 font-mono font-medium text-red-600 dark:text-red-400">
                      {scan.summary?.critical ?? "—"}
                    </td>
                    <td className="px-6 py-3 font-mono font-medium text-orange-600 dark:text-orange-400">
                      {scan.summary?.high ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-xs text-gray-400 dark:text-gray-500 font-mono">
                      {new Date(scan.created_at).toLocaleString()}
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
