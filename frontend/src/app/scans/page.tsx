"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listScans, Scan } from "@/lib/api";
import { formatBytes, formatPercent, formatRelativeTime } from "@/lib/format";
import { SkeletonTableRows } from "@/components/Skeleton";

const HEALTH_LABELS: Record<string, string> = {
  complete: "Complete",
  incomplete: "Incomplete",
  failed: "Failed",
  cancelled: "Cancelled",
  pending: "Pending",
  running: "Running",
};

const HEALTH_STYLES: Record<string, string> = {
  complete:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  incomplete:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
};

const PERIODS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
];

const STATUS_TOGGLES = [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
];

const STATUS_TOGGLE_LABELS: Record<string, string> = {
  pending: "Pending",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_TOGGLE_STYLES: Record<string, string> = {
  pending:
    "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-400",
  running:
    "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400",
  completed:
    "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400",
  failed:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400",
  cancelled:
    "border-gray-300 bg-gray-50 text-gray-600 dark:border-gray-700 dark:bg-gray-900/30 dark:text-gray-400",
};

function healthStatus(scan: Scan): string {
  if (scan.scan_status === "pending") return "pending";
  if (scan.scan_status === "running") return "running";
  if (scan.scan_status === "failed") return "failed";
  if (scan.scan_status === "cancelled") return "cancelled";
  if (scan.scan_status === "completed") {
    if (!scan.build_status || scan.build_status === "completed") {
      return "complete";
    }
    return "incomplete";
  }
  return scan.scan_status;
}

function getDates(period: string) {
  const now = new Date();
  if (period === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return { date_from: start.toISOString(), date_to: undefined };
  }
  if (period === "week") {
    const start = new Date(now);
    start.setDate(start.getDate() - 7);
    return { date_from: start.toISOString(), date_to: undefined };
  }
  if (period === "month") {
    const start = new Date(now);
    start.setMonth(start.getMonth() - 1);
    return { date_from: start.toISOString(), date_to: undefined };
  }
  return { date_from: undefined, date_to: undefined };
}

export default function ScansPage() {
  const router = useRouter();
  const [scans, setScans] = useState<Scan[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [requestedPage, setRequestedPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Set<string>>(
    () => new Set(["pending", "running", "completed"])
  );
  const [period, setPeriod] = useState("all");
  const PAGE_SIZE = 20;

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    const targetPage = requestedPage;
    setLoading(true);
    setError(null);

    const { date_from, date_to } = getDates(period);

    listScans({
      page: targetPage,
      size: PAGE_SIZE,
      status:
        statusFilter.size > 0
          ? [...statusFilter].join(",")
          : undefined,
      date_from,
      date_to,
      search: debouncedSearch.trim() || undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setScans(data.items);
        setTotal(data.total);
        setPage(targetPage);
      })
      .catch(() => {
        if (cancelled) return;
        setError(
          "Failed to load scan history. Check backend availability."
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [requestedPage, reloadToken, statusFilter, period, debouncedSearch]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasScans = scans.length > 0;
  const showInitialLoadingState = loading && !hasScans;
  const showEmptyState = !loading && !error && !hasScans;
  const showErrorState = !loading && !!error && !hasScans;

  const requestPage = useCallback(
    (nextPage: number) => {
      if (loading || nextPage === page) return;
      if (nextPage === requestedPage) {
        setReloadToken((c) => c + 1);
        return;
      }
      setRequestedPage(nextPage);
    },
    [loading, page, requestedPage]
  );

  const hasActiveFilters =
    statusFilter.size !== 3 || period !== "all" || !!debouncedSearch;

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

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setRequestedPage(1);
            }}
            placeholder="Search image name..."
            className="w-full rounded-full border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-2 text-sm text-[color:var(--dockguard-ink)] placeholder:text-[color:var(--dockguard-muted)] focus:border-[color:var(--dockguard-accent)] focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--dockguard-muted)]">
              Status
            </span>
            {STATUS_TOGGLES.map((s) => {
              const active = statusFilter.has(s);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    const next = new Set(statusFilter);
                    if (active) next.delete(s);
                    else next.add(s);
                    setStatusFilter(next);
                    setRequestedPage(1);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    active
                      ? STATUS_TOGGLE_STYLES[s]
                      : "border-[color:var(--dockguard-border)] text-[color:var(--dockguard-muted)] hover:border-[color:var(--dockguard-accent-border)]"
                  }`}
                >
                  {STATUS_TOGGLE_LABELS[s]}
                </button>
              );
            })}
            <select
              value={period}
              onChange={(e) => {
                setPeriod(e.target.value);
                setRequestedPage(1);
              }}
              className="ml-auto rounded-full border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-2 text-sm text-[color:var(--dockguard-ink)] focus:border-[color:var(--dockguard-accent)] focus:outline-none"
            >
              {PERIODS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setDebouncedSearch("");
                  setStatusFilter(
                    new Set(["pending", "running", "completed"])
                  );
                  setPeriod("all");
                  setRequestedPage(1);
                }}
                className="rounded-full border border-[color:var(--dockguard-border)] px-3 py-2 text-xs text-[color:var(--dockguard-muted)] transition hover:text-[color:var(--dockguard-ink)]"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-[24px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] shadow-none sm:rounded-[30px] sm:shadow-[0_18px_48px_rgba(120,53,15,0.08)]">
        {error && !loading && scans.length > 0 && (
          <div className="border-b border-[color:var(--dockguard-border)] px-4 py-4 sm:px-6">
            <LoadErrorState
              message={error}
              onRetry={() => setReloadToken((c) => c + 1)}
              compact
            />
          </div>
        )}
        <div className="space-y-3 p-4 sm:hidden">
          {showInitialLoadingState
            ? Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 rounded-[22px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] skeleton-shimmer"
                />
              ))
            : showErrorState
              ? (
                <LoadErrorState
                  message={error}
                  onRetry={() => setReloadToken((c) => c + 1)}
                />
              )
              : showEmptyState
                ? (
                  <div className="rounded-[20px] border border-dashed border-[color:var(--dockguard-border)] px-4 py-10 text-center text-sm text-[color:var(--dockguard-muted)]">
                    No scans found.
                  </div>
                )
                : (
                  scans.map((scan) => {
                    const h = healthStatus(scan);
                    return (
                      <button
                        key={scan.id}
                        type="button"
                        onClick={() =>
                          router.push(`/scans/${scan.id}`)}
                        className="w-full rounded-[22px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <p className="min-w-0 truncate font-mono text-xs text-[color:var(--dockguard-ink)]">
                            {scan.image_name}
                          </p>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${HEALTH_STYLES[h]}`}
                          >
                            {HEALTH_LABELS[h]}
                          </span>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[color:var(--dockguard-muted)]">
                          <span className="text-rose-600 dark:text-rose-400">
                            C {scan.summary?.critical ?? "—"}
                          </span>
                          <span className="text-orange-600 dark:text-orange-400">
                            H {scan.summary?.high ?? "—"}
                          </span>
                          <span>
                            {formatPercent(
                              scan.build_summary?.wasted_percent
                            )}
                          </span>
                          <span>
                            {formatBytes(
                              scan.build_summary?.image_size_bytes
                            )}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-[color:var(--dockguard-muted)]">
                          {formatRelativeTime(scan.created_at)}
                        </p>
                      </button>
                    );
                  })
                )}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--dockguard-panel)] text-left text-[11px] uppercase tracking-[0.24em] text-[color:var(--dockguard-muted)]">
              <tr>
                <th className="px-6 py-4">Image</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-center">C</th>
                <th className="px-6 py-4 text-center">H</th>
                <th className="px-6 py-4">Waste %</th>
                <th className="px-6 py-4">Size</th>
                <th className="px-6 py-4">Submitted</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--dockguard-border)]">
              {showInitialLoadingState
                ? <SkeletonTableRows rows={8} cols={7} />
                : showErrorState
                  ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8">
                        <LoadErrorState
                          message={error}
                          onRetry={() =>
                            setReloadToken((c) => c + 1)}
                        />
                      </td>
                    </tr>
                  )
                  : showEmptyState
                    ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="px-6 py-12 text-center text-sm text-[color:var(--dockguard-muted)]"
                        >
                          No scans found.
                        </td>
                      </tr>
                    )
                    : (
                      scans.map((scan) => {
                        const h = healthStatus(scan);
                        return (
                          <tr
                            key={scan.id}
                            className="cursor-pointer transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                            onClick={() =>
                              router.push(`/scans/${scan.id}`)}
                          >
                            <td className="px-6 py-4 font-mono text-xs text-[color:var(--dockguard-ink)]">
                              {scan.image_name}
                            </td>
                            <td className="px-6 py-4">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${HEALTH_STYLES[h]}`}
                              >
                                {HEALTH_LABELS[h]}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-center font-mono text-xs font-semibold text-rose-600 dark:text-rose-400">
                              {scan.summary?.critical ?? "—"}
                            </td>
                            <td className="px-6 py-4 text-center font-mono text-xs font-semibold text-orange-600 dark:text-orange-400">
                              {scan.summary?.high ?? "—"}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-[color:var(--dockguard-muted)]">
                              {formatPercent(
                                scan.build_summary?.wasted_percent
                              )}
                            </td>
                            <td className="px-6 py-4 font-mono text-xs text-[color:var(--dockguard-muted)]">
                              {formatBytes(
                                scan.build_summary?.image_size_bytes
                              )}
                            </td>
                            <td className="px-6 py-4 text-xs text-[color:var(--dockguard-muted)]">
                              {formatRelativeTime(scan.created_at)}
                            </td>
                          </tr>
                        );
                      })
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
              onClick={() =>
                requestPage(Math.min(totalPages, page + 1))}
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
