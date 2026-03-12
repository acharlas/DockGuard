"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getScan, ScanDetail } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { ThemeToggle } from "@/components/ThemeToggle";
import { StatusBadge } from "@/components/StatusBadge";
import { SkeletonDetailPage } from "@/components/Skeleton";
import { ScanWorkspace } from "@/components/ScanWorkspace";

export default function ScanDetailPage() {
  const { id } = useParams<{ id: string }>();
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
      <main className="mx-auto max-w-6xl px-4 py-8">
        <p className="text-red-600 dark:text-red-400">{error ?? "Scan not found"}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="rounded-[30px] border border-slate-200/80 bg-white/85 px-5 py-5 shadow-[0_24px_90px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-none sm:px-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
              <Link href="/scans" className="transition-colors hover:text-slate-950 dark:hover:text-slate-100">
                ← Scan history
              </Link>
              <span>/</span>
              <Link href="/" className="transition-colors hover:text-slate-950 dark:hover:text-slate-100">
                Dashboard
              </Link>
            </div>
            <h1 className="mt-4 truncate text-3xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
              {scan.image_name}
            </h1>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge status={scan.scan_status} />
              {scan.build_status && <StatusBadge status={scan.build_status} />}
            </div>
          </div>
          <ThemeToggle />
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetaCard label="Submitted" value={formatDateTime(scan.created_at)} />
          <MetaCard label="Started" value={formatDateTime(scan.started_at)} />
          <MetaCard label="Completed" value={formatDateTime(scan.completed_at)} />
          <MetaCard label="Digest" value={scan.image_digest ?? "—"} mono />
        </div>
      </header>

      <ScanWorkspace key={scan.id} scan={scan} />
    </main>
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
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/70 px-4 py-4 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p
        className={`mt-3 text-sm text-slate-900 dark:text-slate-100 ${
          mono ? "font-mono break-all text-xs" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}
