"use client";

import { useEffect, useState } from "react";
import { ApiError, cancelScan, createScan, getScan, ScanDetail } from "@/lib/api";
import { SCAN_STATUS } from "@/lib/constants";
import { StatusBadge } from "@/components/StatusBadge";
import { ScanWorkspace } from "@/components/ScanWorkspace";
import { SeverityDonut } from "@/components/SeverityDonut";

function isActiveScanStatus(status: string) {
  return status === SCAN_STATUS.PENDING || status === SCAN_STATUS.RUNNING;
}

export default function Dashboard() {
  const [image, setImage] = useState("");
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [activeScanId, setActiveScanId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, [activeScanId]);

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
        current
          ? { ...current, ...updated }
          : { ...updated, vulnerabilities: [], build: null }
      );

      if (isActiveScanStatus(updated.scan_status)) {
        setLoading(true);
        setActiveScanId(scanId);
      } else {
        setLoading(false);
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const latest = await getScan(scanId);
          setScan(latest);
          setLoading(false);
          if (isActiveScanStatus(latest.scan_status)) {
            setActiveScanId(scanId);
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
    <div className="space-y-6 lg:space-y-8">
      <section className="rounded-[30px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-5 shadow-[0_18px_48px_rgba(120,53,15,0.08)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--dockguard-muted)]">
              Analysis
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--dockguard-ink)] sm:text-4xl">
              Scan an image
            </h1>
          </div>
          {scan && (
            <div className="flex items-center gap-2">
              <StatusBadge status={scan.scan_status} />
              {scan.build_status && <StatusBadge status={scan.build_status} />}
            </div>
          )}
        </div>

        <form
          onSubmit={handleScan}
          className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"
        >
          <label className="block">
            <span className="sr-only">Docker image reference</span>
            <input
              type="text"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder="nginx:latest"
              className="w-full rounded-[22px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-4 font-mono text-sm text-[color:var(--dockguard-ink)] placeholder:text-[color:var(--dockguard-muted)] focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20"
              disabled={loading}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <button
              type="submit"
              disabled={loading || !image.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? (
                <>
                  <ScanSpinner />
                  Running
                </>
              ) : (
                "Run analysis"
              )}
            </button>
            {scan && isActiveScan && (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-full border border-[color:var(--dockguard-border)] px-4 py-3 text-sm font-medium text-[color:var(--dockguard-muted)] transition hover:border-rose-300 hover:text-rose-700 dark:hover:text-rose-300"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {error && (
          <div className="mt-4 rounded-[20px] border border-rose-300/40 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-200">
            {error}
          </div>
        )}
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px] xl:items-start">
        <div className="min-w-0">
          {scan ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[24px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate font-mono text-xs text-[color:var(--dockguard-muted)]">
                    {scan.image_name}
                  </p>
                  {scan.image_digest && (
                    <p className="mt-2 truncate font-mono text-[11px] text-[color:var(--dockguard-muted)]">
                      {scan.image_digest}
                    </p>
                  )}
                </div>
                {isActiveScan && (
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--dockguard-muted)]">
                    {scan.scan_status === SCAN_STATUS.RUNNING ? "Running" : "Queued"}
                  </p>
                )}
              </div>
              <ScanWorkspace key={scan.id} scan={scan} compact />
            </div>
          ) : (
            <EmptyWorkspace />
          )}
        </div>

        <SeverityDonut summary={scan?.summary ?? null} />
      </section>
    </div>
  );
}

function EmptyWorkspace() {
  return (
    <section className="rounded-[30px] border border-dashed border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] px-6 py-10 sm:px-8">
      <div className="inline-flex rounded-full border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] p-1">
        <DisabledTab label="Security" />
        <DisabledTab label="Build" />
      </div>
      <p className="mt-6 text-sm text-[color:var(--dockguard-muted)]">
        Run a scan to open the workspace.
      </p>
    </section>
  );
}

function DisabledTab({ label }: { label: string }) {
  return (
    <span className="rounded-full px-4 py-2 text-sm font-medium text-[color:var(--dockguard-muted)]">
      {label}
    </span>
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
