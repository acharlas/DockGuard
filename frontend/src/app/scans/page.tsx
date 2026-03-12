"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listScans, Scan } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
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
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--dockguard-muted)]">
            History
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--dockguard-ink)] sm:text-4xl">
            Scan runs
          </h1>
        </div>
        <span className="rounded-full border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] px-4 py-2 text-sm text-[color:var(--dockguard-muted)]">
          {loading ? "Loading" : `${total} scans`}
        </span>
      </header>

      <section className="overflow-hidden rounded-[30px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] shadow-[0_18px_48px_rgba(120,53,15,0.08)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--dockguard-panel)] text-left text-[11px] uppercase tracking-[0.24em] text-[color:var(--dockguard-muted)]">
              <tr>
                <th className="px-6 py-4">Image</th>
                <th className="px-6 py-4">Security</th>
                <th className="px-6 py-4">Build</th>
                <th className="px-6 py-4">Critical</th>
                <th className="px-6 py-4">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--dockguard-border)]">
              {loading ? (
                <SkeletonTableRows rows={8} cols={5} />
              ) : scans.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-sm text-[color:var(--dockguard-muted)]"
                  >
                    No scans yet. Run one from the <Link href="/" className="text-amber-700 hover:underline dark:text-amber-300">analysis view</Link>.
                  </td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr
                    key={scan.id}
                    className="cursor-pointer transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-950/10"
                    onClick={() => router.push(`/scans/${scan.id}`)}
                  >
                    <td className="px-6 py-4 font-mono text-xs text-[color:var(--dockguard-ink)]">
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
                    <td className="px-6 py-4 text-xs text-[color:var(--dockguard-muted)]">
                      {formatDateTime(scan.created_at)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-[color:var(--dockguard-border)] px-6 py-4">
            <button
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={page === 1}
              className="rounded-full border border-[color:var(--dockguard-border)] px-4 py-2 text-sm text-[color:var(--dockguard-muted)] transition hover:bg-[color:var(--dockguard-panel)] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-[color:var(--dockguard-muted)]">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={page === totalPages}
              className="rounded-full border border-[color:var(--dockguard-border)] px-4 py-2 text-sm text-[color:var(--dockguard-muted)] transition hover:bg-[color:var(--dockguard-panel)] disabled:opacity-40"
            >
              Next
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
