"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listScans, Scan } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
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
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="rounded-[30px] border border-slate-200/80 bg-white/85 px-5 py-5 shadow-[0_24px_90px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-none sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <Link href="/" className="transition-colors hover:text-slate-950 dark:hover:text-slate-100">
                ← Dashboard
              </Link>
              <span>/</span>
              <span>History</span>
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              Scan history
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {loading ? "Loading recent analysis runs..." : `${total} scans recorded`}
            </p>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <section className="overflow-hidden rounded-[28px] border border-slate-200/80 bg-white/85 shadow-[0_18px_48px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-none">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
              <tr>
                <th className="px-6 py-4">Image</th>
                <th className="px-6 py-4">Security</th>
                <th className="px-6 py-4">Build</th>
                <th className="px-6 py-4">Critical</th>
                <th className="px-6 py-4">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {loading ? (
                <SkeletonTableRows rows={8} cols={5} />
              ) : scans.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No scans yet. Run your first analysis from the{" "}
                    <Link href="/" className="text-sky-600 hover:underline dark:text-sky-400">
                      dashboard
                    </Link>
                    .
                  </td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr
                    key={scan.id}
                    className="cursor-pointer bg-white transition-colors hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70"
                    onClick={() => router.push(`/scans/${scan.id}`)}
                  >
                    <td className="px-6 py-4 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {scan.image_name}
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={scan.scan_status} />
                    </td>
                    <td className="px-6 py-4">
                      {scan.build_status ? <StatusBadge status={scan.build_status} /> : "—"}
                    </td>
                    <td className="px-6 py-4 font-mono font-medium text-rose-600 dark:text-rose-400">
                      {scan.summary?.critical ?? "—"}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-500 dark:text-slate-400">
                      {formatDateTime(scan.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Previous
            </button>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
