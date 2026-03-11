"use client";

import { useEffect, useState } from "react";
import { listScans, Scan } from "@/lib/api";

const STATUS_STYLES: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  running: "bg-blue-100 text-blue-800",
  completed: "bg-green-100 text-green-800",
  failed: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
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
      <div className="flex items-center gap-4 mb-8">
        <a href="/" className="text-sm text-blue-600 hover:underline">
          ← Back
        </a>
        <h1 className="text-3xl font-bold">Scan History</h1>
        <span className="text-sm text-gray-400">{total} scans total</span>
      </div>

      <div className="bg-white rounded-xl shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-6 py-3">Image</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Critical</th>
                <th className="px-6 py-3">High</th>
                <th className="px-6 py-3">Started</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    Loading...
                  </td>
                </tr>
              ) : scans.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-gray-400">
                    No scans yet
                  </td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr
                    key={scan.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => (window.location.href = `/scans/${scan.id}`)}
                  >
                    <td className="px-6 py-3 font-mono text-xs">{scan.image_name}</td>
                    <td className="px-6 py-3">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[scan.scan_status] ?? "bg-gray-100 text-gray-800"}`}
                      >
                        {scan.scan_status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-red-600 font-medium">
                      {scan.summary?.critical ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-orange-600 font-medium">
                      {scan.summary?.high ?? "—"}
                    </td>
                    <td className="px-6 py-3 text-gray-400 text-xs">
                      {new Date(scan.started_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
