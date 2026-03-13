"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getScan, ScanDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { ScanInsightPanel } from "@/components/ScanInsightPanel";
import { StatusBadge } from "@/components/StatusBadge";
import { SkeletonDetailPage } from "@/components/Skeleton";
import { ScanWorkspace, WorkspaceTab } from "@/components/ScanWorkspace";

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("security");
  const [scan, setScan] = useState<ScanDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getScan(Number(id))
      .then(setScan)
      .catch(() => setError("Scan not found"))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <SkeletonDetailPage />;
  }

  if (error || !scan) {
    return (
      <section className="rounded-[28px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] px-6 py-8">
        <p className="text-rose-700 dark:text-rose-300">{error ?? "Scan not found"}</p>
      </section>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-8">
      <section className="rounded-[18px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-3 shadow-none sm:rounded-[30px] sm:p-6 sm:shadow-[0_18px_48px_rgba(120,53,15,0.08)]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[color:var(--dockguard-muted)]">
          Analysis
        </p>
        <h1 className="mt-3 break-all text-2xl font-semibold tracking-tight text-[color:var(--dockguard-ink)] sm:text-4xl">
          {scan.image_name}
        </h1>

        <div className="mt-4 flex flex-wrap items-center gap-2 sm:mt-5">
          <StatusBadge status={scan.scan_status} />
          {scan.build_status && <StatusBadge status={scan.build_status} />}
        </div>

        <div className="mt-5 grid gap-3 sm:mt-6 sm:gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetaCard label="Submitted" value={formatDateTime(scan.created_at)} />
          <MetaCard label="Started" value={formatDateTime(scan.started_at)} />
          <MetaCard label="Completed" value={formatDateTime(scan.completed_at)} />
          <MetaCard label="Digest" value={scan.image_digest ?? "—"} mono />
        </div>
      </section>

      <section className="md:grid md:gap-6 xl:grid-cols-[minmax(0,1.35fr)_320px] xl:items-start">
        <div className="min-w-0">
          <ScanWorkspace
            key={scan.id}
            scan={scan}
            activeTab={activeTab}
            onTabChange={setActiveTab}
          />
        </div>

        <div className="hidden md:block">
          <ScanInsightPanel activeTab={activeTab} scan={scan} />
        </div>
      </section>
    </div>
  );
}

function MetaCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-[22px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--dockguard-muted)]">
        {label}
      </p>
      <p
        className={`mt-3 text-sm text-[color:var(--dockguard-ink)] ${
          mono ? "break-all font-mono text-xs" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
