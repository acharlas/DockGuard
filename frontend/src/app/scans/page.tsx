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
  const [requestedPage, setRequestedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const PAGE_SIZE = 20;

  useEffect(() => {
    let cancelled = false;
    const targetPage = requestedPage;
    setLoading(true);
    setError(null);
    listScans(targetPage, PAGE_SIZE)
      .then((data) => {
        if (cancelled) {
          return;
        }
        setScans(data.items);
        setTotal(data.total);
        setPage(targetPage);
      })
      .catch(() => {
        if (cancelled) {
          return;
        }
        setError("Failed to load scan history. Check backend availability.");
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [requestedPage, reloadToken]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasScans = scans.length > 0;
  const showInitialLoadingState = loading && !hasScans;
  const showEmptyState = !loading && !error && !hasScans;
  const showErrorState = !loading && !!error && !hasScans;

  function requestPage(nextPage: number) {
    if (loading || nextPage === page) {
      return;
    }

    if (nextPage === requestedPage) {
      setReloadToken((current) => current + 1);
      return;
    }

    setRequestedPage(nextPage);
  }

  return (
    <div className="space-y-4 lg:space-y-8">
      <section className="rounded-[18px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-3 shadow-none sm:rounded-[30px] sm:p-6 sm:shadow-[0_18px_48px_rgba(120,53,15,0.08)]">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--dockguard-muted)]">
              History
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--dockguard-ink)] sm:mt-3 sm:text-4xl">
              Scan runs
            </h1>
          </div>
          <span className="hidden rounded-full border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-2 text-sm text-[color:var(--dockguard-muted)] sm:inline-flex">
            {showInitialLoadingState ? "Loading" : `${total} scans`}
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] shadow-none sm:rounded-[30px] sm:shadow-[0_18px_48px_rgba(120,53,15,0.08)]">
        {error && !loading && scans.length > 0 && (
          <div className="border-b border-[color:var(--dockguard-border)] px-4 py-4 sm:px-6">
            <LoadErrorState
              message={error}
              onRetry={() => setReloadToken((current) => current + 1)}
              compact
            />
          </div>
        )}
        <div className="space-y-3 p-4 sm:hidden">
          {showInitialLoadingState ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="h-28 rounded-[22px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] skeleton-shimmer"
              />
            ))
          ) : showErrorState ? (
            <LoadErrorState
              message={error}
              onRetry={() => setReloadToken((current) => current + 1)}
            />
          ) : showEmptyState ? (
            <div className="rounded-[20px] border border-dashed border-[color:var(--dockguard-border)] px-4 py-10 text-center text-sm text-[color:var(--dockguard-muted)]">
              No scans yet. Run one from the{" "}
              <Link href="/" className="text-[color:var(--dockguard-accent)] hover:underline">
                analysis view
              </Link>
              .
            </div>
          ) : (
            scans.map((scan) => (
              <button
                key={scan.id}
                type="button"
                onClick={() => router.push(`/scans/${scan.id}`)}
                className="w-full rounded-[22px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] p-4 text-left"
              >
                <div className="flex items-start justify-between gap-3">
                  <p className="min-w-0 truncate font-mono text-xs text-[color:var(--dockguard-ink)]">
                    {scan.image_name}
                  </p>
                  <p className="font-mono text-xs text-rose-600 dark:text-rose-400">
                    C {scan.summary?.critical ?? "—"}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={scan.scan_status} />
                  {scan.build_status && <StatusBadge status={scan.build_status} />}
                </div>
                <p className="mt-3 text-xs text-[color:var(--dockguard-muted)]">
                  {formatDateTime(scan.created_at)}
                </p>
              </button>
            ))
          )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
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
              {showInitialLoadingState ? (
                <SkeletonTableRows rows={8} cols={5} />
              ) : showErrorState ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8">
                    <LoadErrorState
                      message={error}
                      onRetry={() => setReloadToken((current) => current + 1)}
                    />
                  </td>
                </tr>
              ) : showEmptyState ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-sm text-[color:var(--dockguard-muted)]"
                  >
                    No scans yet. Run one from the <Link href="/" className="text-[color:var(--dockguard-accent)] hover:underline">analysis view</Link>.
                  </td>
                </tr>
              ) : (
                scans.map((scan) => (
                  <tr
                    key={scan.id}
                    className="cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
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
              onClick={() => requestPage(Math.max(1, page - 1))}
              disabled={loading || page === 1}
              className="rounded-full border border-[color:var(--dockguard-border)] px-4 py-2 text-sm text-[color:var(--dockguard-muted)] transition hover:bg-[color:var(--dockguard-panel)] disabled:opacity-40"
            >
              Previous
            </button>
            <span className="text-sm text-[color:var(--dockguard-muted)]">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => requestPage(Math.min(totalPages, page + 1))}
              disabled={loading || page === totalPages}
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

function LoadErrorState({
  message,
  onRetry,
  compact = false,
}: {
  message: string | null;
  onRetry: () => void;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] border border-rose-300/40 bg-rose-50 px-4 py-4 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200 ${
        compact ? "" : "text-center"
      }`}
    >
      <p>{message ?? "Failed to load scan history."}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-3 inline-flex rounded-full border border-rose-300/60 px-4 py-2 text-sm font-medium transition hover:bg-rose-100 dark:border-rose-800/60 dark:hover:bg-rose-900/40"
      >
        Retry
      </button>
    </div>
  );
}
