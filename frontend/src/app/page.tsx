"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ApiError,
  cancelScan,
  createScan,
  getScan,
  getStats,
  ScanDetail,
  Stats,
} from "@/lib/api";
import { formatBytes, formatScore } from "@/lib/format";
import { SCAN_STATUS } from "@/lib/constants";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusBadge } from "@/components/StatusBadge";
import { ScanWorkspace } from "@/components/ScanWorkspace";
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
      .catch((fetchError) => console.error("Failed to load stats", fetchError))
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

  const handleScan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!image.trim()) {
      return;
    }

    setError(null);
    setLoading(true);
    setScan(null);

    try {
      const created = await createScan(image.trim());
      if (isActiveScanStatus(created.scan_status)) {
        setScan({ ...created, vulnerabilities: [], build: null });
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
    if (!scan) {
      return;
    }
    const scanId = scan.id;
    setActiveScanId(null);
    try {
      const updated = await cancelScan(scanId);
      setScan((current) =>
        current ? { ...current, ...updated } : { ...updated, vulnerabilities: [], build: null }
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

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex flex-col gap-5 rounded-[30px] border border-slate-200/80 bg-white/85 px-5 py-5 shadow-[0_24px_90px_rgba(15,23,42,0.08)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-none sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500 dark:text-slate-400">
              DockGuard
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50 sm:text-4xl">
              Container image analysis dashboard
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300 sm:text-base">
              Paste a Docker image and get one scan workspace with two lenses: Security for package risk and Build for layer efficiency.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/scans"
              className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-950 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-500 dark:hover:text-white"
            >
              Scan history
            </Link>
            <ThemeToggle />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
          <section className="rounded-[28px] bg-slate-950 px-5 py-6 text-white dark:bg-slate-900 sm:px-7">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
              Command Deck
            </p>
            <form onSubmit={handleScan} className="mt-6 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm text-slate-300">
                  Docker image reference
                </span>
                <input
                  type="text"
                  value={image}
                  onChange={(event) => setImage(event.target.value)}
                  placeholder="Enter image name (e.g. nginx:latest)"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/20"
                  disabled={loading}
                />
              </label>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="submit"
                  disabled={loading || !image.trim()}
                  className="inline-flex items-center gap-2 rounded-full bg-sky-400 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading ? (
                    <>
                      <ScanSpinner />
                      Running analysis
                    </>
                  ) : (
                    "Run analysis"
                  )}
                </button>
                {scan && isActiveScan && (
                  <button
                    type="button"
                    onClick={handleCancel}
                    className="rounded-full border border-white/15 px-4 py-3 text-sm text-slate-300 transition hover:border-rose-400 hover:text-rose-300"
                  >
                    Cancel scan
                  </button>
                )}
              </div>
            </form>
            {error && (
              <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {error}
              </div>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <InsightPanel
              label="Coverage"
              title="Security + Build"
              description="One scan ID now carries both package risk and image construction quality."
            />
            <InsightPanel
              label="Execution"
              title={scan ? scan.scan_status : "idle"}
              description={
                scan
                  ? `Current image: ${scan.image_name}`
                  : "No active analysis. Use the command deck to open a scan workspace."
              }
              footer={scan ? <StatusBadge status={scan.scan_status} /> : undefined}
            />
          </section>
        </div>
      </header>

      <section>
        {statsLoading ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <SkeletonStatCards count={6} />
          </div>
        ) : stats ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
            <StatCard label="Total scans" value={String(stats.total_scans)} />
            <StatCard label="Completed" value={String(stats.completed_scans)} />
            <StatCard label="Critical CVEs" value={String(stats.severity_breakdown.critical)} accent="text-rose-600 dark:text-rose-400" />
            <StatCard label="Build analyses" value={String(stats.build_breakdown.completed)} />
            <StatCard label="Avg efficiency" value={formatScore(stats.avg_efficiency_score)} />
            <StatCard label="Wasted bytes" value={formatBytes(stats.total_wasted_bytes)} />
          </div>
        ) : null}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        {scan ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-slate-200 bg-white/80 px-5 py-4 dark:border-slate-800 dark:bg-slate-950/80">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
                  Active Workspace
                </p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950 dark:text-slate-50">
                  {scan.image_name}
                </h2>
                {isActiveScan && (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                    {scan.scan_status === SCAN_STATUS.RUNNING && scan.started_at
                      ? "Live scan"
                      : "Queued"}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={scan.scan_status} />
                {scan.build_status && <StatusBadge status={scan.build_status} />}
              </div>
            </div>
            <ScanWorkspace key={scan.id} scan={scan} compact />
          </div>
        ) : (
          <EmptyWorkspace />
        )}

        <div className="space-y-6">
          <Panel title="Most scanned images" eyebrow="Overview">
            <div className="space-y-3">
              {stats?.top_images.length ? (
                stats.top_images.map((item) => (
                  <div
                    key={item.image_name}
                    className="flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <span className="truncate font-mono text-xs text-slate-700 dark:text-slate-300">
                      {item.image_name}
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {item.scan_count}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No completed scans yet.
                </p>
              )}
            </div>
          </Panel>

          <Panel title="Top CVEs" eyebrow="Security heat">
            <div className="space-y-3">
              {stats?.top_cves.length ? (
                stats.top_cves.slice(0, 5).map((cve) => (
                  <div
                    key={cve.vuln_id}
                    className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                        {cve.vuln_id}
                      </span>
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {cve.count}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      {cve.title || cve.severity}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No vulnerability trends yet.
                </p>
              )}
            </div>
          </Panel>
        </div>
      </section>
    </main>
  );
}

function StatCard({
  label,
  value,
  accent = "text-slate-950 dark:text-slate-50",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[24px] border border-slate-200/80 bg-white/85 px-5 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-none">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-3 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function InsightPanel({
  label,
  title,
  description,
  footer,
}: {
  label: string;
  title: string;
  description: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="rounded-[26px] border border-slate-200/80 bg-white/85 px-5 py-5 dark:border-slate-800 dark:bg-slate-950/80">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <h2 className="mt-3 text-xl font-semibold text-slate-950 dark:text-slate-50">
        {title}
      </h2>
      <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">
        {description}
      </p>
      {footer && <div className="mt-4">{footer}</div>}
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white/85 px-5 py-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-none">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        {eyebrow}
      </p>
      <h2 className="mt-3 text-xl font-semibold text-slate-950 dark:text-slate-50">
        {title}
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function EmptyWorkspace() {
  return (
    <section className="rounded-[28px] border border-dashed border-slate-300 bg-white/80 px-6 py-10 dark:border-slate-700 dark:bg-slate-950/80">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        Analysis Workspace
      </p>
      <h2 className="mt-3 text-2xl font-semibold text-slate-950 dark:text-slate-50">
        No scan selected yet
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
        Run a scan from the command deck to open the Security and Build workspace. Completed scans render here immediately, while active scans stay live until the analysis pipeline settles.
      </p>
    </section>
  );
}

function ScanSpinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
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
