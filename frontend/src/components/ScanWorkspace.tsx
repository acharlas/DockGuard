"use client";

import { useMemo, useState } from "react";
import {
  BuildLayer,
  BuildSummary,
  ScanDetail,
  Vulnerability,
} from "@/lib/api";
import { formatBytes, formatPercent, formatScore } from "@/lib/format";
import { SEVERITY_ORDER, SEVERITY_STYLES } from "@/lib/constants";
import { StatusBadge } from "@/components/StatusBadge";

type WorkspaceTab = "security" | "build";

type ScanWorkspaceProps = {
  scan: ScanDetail;
  compact?: boolean;
  initialTab?: WorkspaceTab;
};

export function ScanWorkspace({
  scan,
  compact = false,
  initialTab = "security",
}: ScanWorkspaceProps) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>(initialTab);

  const vulnerabilities = useMemo(
    () =>
      [...scan.vulnerabilities].sort(
        (a, b) =>
          SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
      ),
    [scan.vulnerabilities]
  );

  const buildLayers = scan.build?.report?.layers ?? [];
  const buildSummary = scan.build?.summary;

  return (
    <section className="rounded-[28px] border border-slate-200/80 bg-white/90 shadow-[0_24px_80px_rgba(15,23,42,0.08)] dark:border-slate-800 dark:bg-slate-950/80 dark:shadow-none overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200/80 bg-slate-50/80 px-5 py-5 dark:border-slate-800 dark:bg-slate-900/70 sm:px-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Analysis Workspace
            </p>
            <h2 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {scan.image_name}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={scan.scan_status} />
            {scan.build_status && <StatusBadge status={scan.build_status} />}
          </div>
        </div>
        <div className="inline-flex w-full max-w-md rounded-full border border-slate-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-950">
          <TabButton
            label="Security"
            active={activeTab === "security"}
            onClick={() => setActiveTab("security")}
          />
          <TabButton
            label="Build"
            active={activeTab === "build"}
            onClick={() => setActiveTab("build")}
          />
        </div>
      </div>

      <div className={compact ? "p-5 sm:p-7" : "p-6 sm:p-8"}>
        {activeTab === "security" ? (
          <SecurityWorkspace scan={scan} vulnerabilities={vulnerabilities} />
        ) : (
          <BuildWorkspace
            buildStatus={scan.build_status ?? null}
            buildSummary={buildSummary ?? null}
            buildFailureReason={scan.build?.failure_reason ?? null}
            layers={buildLayers}
          />
        )}
      </div>
    </section>
  );
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950"
          : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

function SecurityWorkspace({
  scan,
  vulnerabilities,
}: {
  scan: ScanDetail;
  vulnerabilities: Vulnerability[];
}) {
  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {SEVERITY_ORDER.map((severity) => {
          const value =
            scan.summary?.[
              severity.toLowerCase() as keyof NonNullable<ScanDetail["summary"]>
            ] ?? 0;
          return (
            <MetricCard
              key={severity}
              label={severity}
              value={String(value)}
              accent={SEVERITY_STYLES[severity]?.split(" ")[0] ?? "text-slate-900"}
            />
          );
        })}
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-800">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
              Security Findings
            </p>
            <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
              Vulnerabilities ({vulnerabilities.length})
            </h3>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-left text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">CVE</th>
                <th className="px-5 py-3">Package</th>
                <th className="px-5 py-3">Installed</th>
                <th className="px-5 py-3">Fixed</th>
                <th className="px-5 py-3">Title</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {vulnerabilities.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No vulnerabilities found for this image.
                  </td>
                </tr>
              ) : (
                vulnerabilities.map((vulnerability, index) => (
                  <tr
                    key={`${vulnerability.vuln_id}-${index}`}
                    className="bg-white transition-colors hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70"
                  >
                    <td className="px-5 py-3">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${SEVERITY_STYLES[vulnerability.severity] ?? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"}`}
                      >
                        {vulnerability.severity}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                      {vulnerability.vuln_id}
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200">
                      {vulnerability.package_name}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {vulnerability.installed_version}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs">
                      {vulnerability.fixed_version ? (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          {vulnerability.fixed_version}
                        </span>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">
                          No fix
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-500 dark:text-slate-400">
                      {vulnerability.title}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function BuildWorkspace({
  buildStatus,
  buildSummary,
  buildFailureReason,
  layers,
}: {
  buildStatus: string | null;
  buildSummary: BuildSummary | null;
  buildFailureReason: string | null;
  layers: BuildLayer[];
}) {
  if (!buildStatus || !buildSummary) {
    return (
      <EmptyBuildState
        reason={buildFailureReason}
        title="Build analysis unavailable"
        message="This scan does not have Dive output yet. Historical scans remain readable, but only newer runs include Build data."
      />
    );
  }

  if (buildStatus !== "completed") {
    return (
      <EmptyBuildState
        reason={buildFailureReason}
        title="Build analysis could not complete"
        message="Security results are available, but Build analysis could not be collected for this scan."
      />
    );
  }

  return (
    <div className="space-y-7">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Image Size"
          value={formatBytes(buildSummary.image_size_bytes)}
        />
        <MetricCard
          label="Wasted Space"
          value={formatBytes(buildSummary.wasted_bytes)}
        />
        <MetricCard
          label="Efficiency Score"
          value={formatScore(buildSummary.efficiency_score)}
        />
        <MetricCard
          label="Wasted Percent"
          value={formatPercent(buildSummary.wasted_percent)}
        />
        <MetricCard
          label="Layers"
          value={String(buildSummary.layer_count ?? "—")}
        />
        <MetricCard
          label="Waste Contributors"
          value={String(buildSummary.inefficient_layer_count ?? "—")}
        />
      </div>

      <div className="overflow-hidden rounded-[24px] border border-slate-200 dark:border-slate-800">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/70">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
            Build Waste
          </p>
          <h3 className="mt-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
            Highest waste contributors
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-left text-[11px] uppercase tracking-[0.24em] text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              <tr>
                <th className="px-5 py-3">Rank</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Waste</th>
                <th className="px-5 py-3">Waste %</th>
                <th className="px-5 py-3">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
              {layers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400"
                  >
                    No layer-level waste data available.
                  </td>
                </tr>
              ) : (
                layers.map((layer) => (
                  <tr
                    key={`${layer.layer_id ?? "layer"}-${layer.index}`}
                    className="bg-white transition-colors hover:bg-slate-50 dark:bg-slate-950 dark:hover:bg-slate-900/70"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-slate-700 dark:text-slate-300">
                      #{layer.index + 1}
                    </td>
                    <td className="px-5 py-3 text-slate-700 dark:text-slate-200">
                      <div className="max-w-lg truncate">{layer.instruction ?? "—"}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {formatBytes(layer.size_bytes)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-amber-700 dark:text-amber-300">
                      {formatBytes(layer.wasted_bytes)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {formatPercent(layer.wasted_percent)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500 dark:text-slate-400">
                      {formatScore(layer.efficiency_score)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  accent = "text-slate-900 dark:text-slate-100",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[22px] border border-slate-200 bg-slate-50/60 px-5 py-5 dark:border-slate-800 dark:bg-slate-900/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        {label}
      </p>
      <p className={`mt-3 text-2xl font-semibold ${accent}`}>{value}</p>
    </div>
  );
}

function EmptyBuildState({
  title,
  message,
  reason,
}: {
  title: string;
  message: string;
  reason: string | null;
}) {
  return (
    <div className="rounded-[24px] border border-dashed border-slate-300 bg-slate-50/80 px-6 py-10 dark:border-slate-700 dark:bg-slate-900/60">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-slate-400">
        Build Lens
      </p>
      <h3 className="mt-3 text-xl font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h3>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 dark:text-slate-300">
        {message}
      </p>
      {reason && (
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500">
          reason: {reason}
        </p>
      )}
    </div>
  );
}
