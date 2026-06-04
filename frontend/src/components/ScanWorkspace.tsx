"use client";

import { useMemo } from "react";
import { BuildLayer, BuildSummary, ScanDetail, Vulnerability } from "@/lib/api";
import { formatBytes, formatPercent, formatScore } from "@/lib/format";
import {
  getSeverityPresentation,
  SEVERITY_ORDER,
} from "@/lib/constants";

export type WorkspaceTab = "security" | "build";

type ScanWorkspaceProps = {
  scan: ScanDetail;
  compact?: boolean;
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
};

export function ScanWorkspace({
  scan,
  compact = false,
  activeTab,
  onTabChange,
}: ScanWorkspaceProps) {
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
    <section className="overflow-hidden rounded-[24px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] shadow-none sm:rounded-[30px] sm:shadow-[0_24px_80px_rgba(120,53,15,0.08)]">
      <div className="flex flex-col gap-4 border-b border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-4 sm:px-7 sm:py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="min-w-0 truncate font-mono text-sm text-[color:var(--dockguard-ink)] sm:text-base">
            {scan.image_name}
          </h2>
          {scan.image_digest && (
            <p className="max-w-full truncate font-mono text-xs text-[color:var(--dockguard-muted)] sm:max-w-sm">
              {scan.image_digest}
            </p>
          )}
        </div>
        <div className="inline-flex w-full rounded-full border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-1">
          <TabButton
            label="Security"
            active={activeTab === "security"}
            onClick={() => onTabChange("security")}
          />
          <TabButton
            label="Build"
            active={activeTab === "build"}
            onClick={() => onTabChange("build")}
          />
        </div>
      </div>

      <div
        className={
          compact
            ? "px-5 pb-5 pt-3 sm:px-7 sm:pb-7 sm:pt-4"
            : "px-6 pb-6 pt-4 sm:px-8 sm:pb-8 sm:pt-5"
        }
      >
        {activeTab === "security" ? (
          <SecurityWorkspace vulnerabilities={vulnerabilities} />
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
          ? "bg-[color:var(--dockguard-accent)] text-[color:var(--dockguard-ink)]"
          : "text-[color:var(--dockguard-muted)] hover:text-[color:var(--dockguard-ink)]"
      }`}
    >
      {label}
    </button>
  );
}

function SecurityWorkspace({
  vulnerabilities,
}: {
  vulnerabilities: Vulnerability[];
}) {
  return (
    <div className="space-y-5 sm:space-y-7 md:space-y-0">
      <div className="overflow-x-auto sm:overflow-hidden sm:rounded-[24px] sm:border sm:border-[color:var(--dockguard-border)]">
        <div className="px-1 pb-3 sm:border-b sm:border-[color:var(--dockguard-border)] sm:bg-[color:var(--dockguard-panel)] sm:px-5 sm:py-4">
          <h3 className="text-lg font-semibold text-[color:var(--dockguard-ink)]">
            Vulnerabilities ({vulnerabilities.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--dockguard-surface)] text-left text-[11px] uppercase tracking-[0.24em] text-[color:var(--dockguard-muted)]">
              <tr>
                <th className="px-5 py-3">Severity</th>
                <th className="px-5 py-3">CVE</th>
                <th className="px-5 py-3">Package</th>
                <th className="px-5 py-3">Installed</th>
                <th className="px-5 py-3">Fixed</th>
                <th className="px-5 py-3">Title</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--dockguard-border)]">
              {vulnerabilities.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-[color:var(--dockguard-muted)]"
                  >
                    No vulnerabilities found.
                  </td>
                </tr>
              ) : (
                vulnerabilities.map((vulnerability, index) => {
                  const severityPresentation = getSeverityPresentation(
                    vulnerability.severity
                  );

                  return (
                    <tr
                      key={`${vulnerability.vuln_id}-${index}`}
                      className="transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                      style={{
                        boxShadow: `inset 3px 0 0 ${severityPresentation.color}`,
                      }}
                    >
                      <td className="px-5 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${severityPresentation.badgeClassName}`}
                        >
                          {vulnerability.severity}
                        </span>
                      </td>
                      <td
                        className={`px-5 py-3 font-mono text-xs font-semibold ${severityPresentation.textClassName}`}
                      >
                        <a
                          href={`https://nvd.nist.gov/vuln/detail/${vulnerability.vuln_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                        >
                          {vulnerability.vuln_id}
                        </a>
                      </td>
                      <td className="px-5 py-3 text-[color:var(--dockguard-ink)]">
                        {vulnerability.package_name}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-[color:var(--dockguard-muted)]">
                        {vulnerability.installed_version}
                      </td>
                      <td className="px-5 py-3 font-mono text-xs">
                        {vulnerability.fixed_version ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            {vulnerability.fixed_version}
                          </span>
                        ) : (
                          <span className="text-[color:var(--dockguard-muted)]">No fix</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-[color:var(--dockguard-muted)]">
                        {vulnerability.title}
                      </td>
                    </tr>
                  );
                })
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
        message="No build report on this scan yet."
      />
    );
  }

  if (buildStatus !== "completed") {
    return (
      <EmptyBuildState
        reason={buildFailureReason}
        title="Build analysis failed"
        message="Security results are available, but the build report is not."
      />
    );
  }

  return (
    <div className="space-y-5 sm:space-y-7 md:space-y-0">
      <div className="grid gap-3 md:hidden">
        <BuildMetricCard
          label="Image Size"
          value={formatBytes(buildSummary.image_size_bytes)}
        />
        <BuildMetricCard
          label="Wasted Space"
          value={formatBytes(buildSummary.wasted_bytes)}
        />
        <BuildMetricCard
          label="Efficiency Score"
          value={formatScore(buildSummary.efficiency_score)}
        />
        <BuildMetricCard
          label="Wasted Percent"
          value={formatPercent(buildSummary.wasted_percent)}
        />
        <BuildMetricCard label="Layers" value={String(buildSummary.layer_count ?? "—")} />
        <BuildMetricCard
          label="Waste Contributors"
          value={String(buildSummary.inefficient_layer_count ?? "—")}
        />
      </div>

      <div className="overflow-x-auto sm:overflow-hidden sm:rounded-[24px] sm:border sm:border-[color:var(--dockguard-border)]">
        <div className="px-1 pb-3 sm:border-b sm:border-[color:var(--dockguard-border)] sm:bg-[color:var(--dockguard-panel)] sm:px-5 sm:py-4">
          <h3 className="text-lg font-semibold text-[color:var(--dockguard-ink)]">
            Highest waste contributors
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[color:var(--dockguard-surface)] text-left text-[11px] uppercase tracking-[0.24em] text-[color:var(--dockguard-muted)]">
              <tr>
                <th className="px-5 py-3">Rank</th>
                <th className="px-5 py-3">Source</th>
                <th className="px-5 py-3">Size</th>
                <th className="px-5 py-3">Waste</th>
                <th className="px-5 py-3">Waste %</th>
                <th className="px-5 py-3">Efficiency</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[color:var(--dockguard-border)]">
              {layers.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-sm text-[color:var(--dockguard-muted)]"
                  >
                    No waste data available.
                  </td>
                </tr>
              ) : (
                layers.map((layer) => (
                  <tr
                    key={`${layer.layer_id ?? "layer"}-${layer.index}`}
                    className="transition-colors hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <td className="px-5 py-3 font-mono text-xs text-[color:var(--dockguard-ink)]">
                      #{layer.index + 1}
                    </td>
                    <td className="px-5 py-3 text-[color:var(--dockguard-ink)]">
                      <div className="max-w-lg truncate">{layer.instruction ?? "—"}</div>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[color:var(--dockguard-muted)]">
                      {formatBytes(layer.size_bytes)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[color:var(--dockguard-accent)]">
                      {formatBytes(layer.wasted_bytes)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[color:var(--dockguard-muted)]">
                      {formatPercent(layer.wasted_percent)}
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-[color:var(--dockguard-muted)]">
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

export function BuildMetricCard({
  label,
  value,
  accent = "text-[color:var(--dockguard-ink)]",
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="rounded-[18px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-4 sm:rounded-[22px] sm:px-5 sm:py-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[color:var(--dockguard-muted)]">
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
    <div className="rounded-[24px] border border-dashed border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-6 py-10">
      <h3 className="text-xl font-semibold text-[color:var(--dockguard-ink)]">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-[color:var(--dockguard-muted)]">{message}</p>
      {reason && (
        <p className="mt-4 font-mono text-xs uppercase tracking-[0.2em] text-[color:var(--dockguard-muted)]">
          reason: {reason}
        </p>
      )}
    </div>
  );
}
