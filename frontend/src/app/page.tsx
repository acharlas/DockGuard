"use client";

import { useState } from "react";
import { ScanInsightPanel } from "@/components/ScanInsightPanel";
import { ScanWorkspace, WorkspaceTab } from "@/components/ScanWorkspace";
import { MobileSeveritySummary } from "@/components/SeverityDonut";
import { useActiveScan } from "@/hooks/useActiveScan";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("security");
  const [severityFilter, setSeverityFilter] = useState<Set<string>>(
    () => new Set(["CRITICAL", "HIGH"])
  );
  const {
    image,
    setImage,
    scan,
    loading,
    error,
    isActiveScan,
    runScan,
    cancelActiveScan,
  } = useActiveScan();

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void runScan();
  };

  const handleCancel = () => {
    void cancelActiveScan();
  };

  return (
    <div className="space-y-4 lg:space-y-8">
      <section className="rounded-[18px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-3 shadow-none sm:rounded-[30px] sm:p-6 sm:shadow-[0_18px_48px_rgba(120,53,15,0.08)]">
        <h1 className="text-xl font-semibold tracking-tight text-[color:var(--dockguard-ink)] sm:mt-3 sm:text-4xl">
          Scan an image
        </h1>
        <p className="mt-1 text-xs text-[color:var(--dockguard-muted)]">
          Pulls any public image from Docker Hub, GitHub Container Registry, or Quay
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-3 grid gap-2.5 lg:mt-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-4"
        >
          <label className="block">
            <span className="sr-only">Docker image reference</span>
            <input
              type="text"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              placeholder="nginx:latest"
              className="w-full rounded-[18px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-3 font-mono text-sm text-[color:var(--dockguard-ink)] placeholder:text-[color:var(--dockguard-muted)] focus:border-[color:var(--dockguard-accent)] focus:outline-none focus:ring-2 focus:ring-[color:var(--dockguard-accent-soft)] sm:rounded-[22px] sm:py-4"
              disabled={loading}
            />
          </label>

          <div className="flex flex-wrap items-center gap-3 lg:justify-end">
            <button
              type="submit"
              disabled={loading || !image.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[color:var(--dockguard-accent)] px-4 py-2.5 text-sm font-semibold text-[color:var(--dockguard-ink)] transition hover:bg-[color:var(--dockguard-accent-strong)] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5 sm:py-3"
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
                className="rounded-full border border-[color:var(--dockguard-border)] px-4 py-2.5 text-sm font-medium text-[color:var(--dockguard-muted)] transition hover:border-rose-300 hover:text-rose-700 dark:hover:text-rose-300 sm:py-3"
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

      <section className="md:grid md:gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px] xl:items-start">
        <div className="min-w-0">
          {loading || isActiveScan ? (
            <ScanningSkeleton imageName={image} />
          ) : scan ? (
            <div className="space-y-4">
              <ScanWorkspace
                key={scan.id}
                scan={scan}
                compact
                activeTab={activeTab}
                onTabChange={setActiveTab}
                severityFilter={severityFilter}
                onSeverityFilter={setSeverityFilter}
              />
              <MobileSeveritySummary summary={scan.summary ?? null} />
            </div>
          ) : (
            <EmptyWorkspace />
          )}
        </div>

        <div className="hidden md:block">
          <ScanInsightPanel
            activeTab={activeTab}
            scan={scan}
            severityFilter={severityFilter}
            onSeverityFilter={setSeverityFilter}
          />
        </div>
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

function ScanningSkeleton({ imageName }: { imageName: string }) {
  return (
    <section className="overflow-hidden rounded-[24px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] shadow-none sm:rounded-[30px] sm:shadow-[0_24px_80px_rgba(120,53,15,0.08)]">
      <div className="border-b border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-5 py-4 sm:px-7 sm:py-5">
        <h2 className="truncate font-mono text-sm text-[color:var(--dockguard-ink)] sm:text-base">
          {imageName}
        </h2>
      </div>
      <div className="inline-flex w-full border-b border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-1">
        <span className="flex-1 rounded-full px-4 py-2 text-center text-sm font-medium text-[color:var(--dockguard-muted)]">
          Security
        </span>
        <span className="flex-1 rounded-full px-4 py-2 text-center text-sm font-medium text-[color:var(--dockguard-muted)]">
          Build
        </span>
      </div>
      <div className="flex flex-col items-center gap-4 px-8 py-12 text-center">
        <div className="animate-spin rounded-full h-6 w-6 border-2 border-[color:var(--dockguard-border)] border-t-[color:var(--dockguard-accent)]" />
        <p className="text-sm text-[color:var(--dockguard-muted)]">
          Scanning image for vulnerabilities and build efficiency...
        </p>
      </div>
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
      role="img"
      aria-label="Loading"
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
