import { BuildSummary } from "@/lib/api";
import { formatBytes, formatPercent, formatScore } from "@/lib/format";

const RADIUS = 42;
const STROKE_WIDTH = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

type BuildDonutProps = {
  summary: BuildSummary | null;
  status: string | null;
  failureReason: string | null;
  title?: string;
};

export function BuildDonut({
  summary,
  status,
  failureReason,
  title = "Build",
}: BuildDonutProps) {
  if (!summary || status !== "completed") {
    return (
      <section className="rounded-[30px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-5 shadow-[0_18px_48px_rgba(120,53,15,0.08)] sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--dockguard-muted)]">
          {title}
        </p>
        <div className="mt-5 rounded-[24px] border border-dashed border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-6">
          <p className="text-sm font-medium text-[color:var(--dockguard-ink)]">
            Build analysis unavailable
          </p>
          <p className="mt-2 text-sm text-[color:var(--dockguard-muted)]">
            {status === "failed"
              ? "Security results are available, but the build report is not."
              : "Run a scan to open the build overview."}
          </p>
          {failureReason && (
            <p className="mt-3 font-mono text-xs uppercase tracking-[0.2em] text-[color:var(--dockguard-muted)]">
              reason: {failureReason}
            </p>
          )}
        </div>
      </section>
    );
  }

  const imageSize = Math.max(summary.image_size_bytes ?? 0, 0);
  const rawWastedBytes = Math.max(summary.wasted_bytes ?? 0, 0);
  const wastedBytes = imageSize > 0 ? Math.min(rawWastedBytes, imageSize) : rawWastedBytes;
  const efficientBytes = Math.max(imageSize - wastedBytes, 0);
  const total = wastedBytes + efficientBytes;
  const wastedDash = total > 0 ? (wastedBytes / total) * CIRCUMFERENCE : 0;
  const efficientDash = total > 0 ? (efficientBytes / total) * CIRCUMFERENCE : 0;

  return (
    <section className="rounded-[30px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-surface)] p-5 shadow-[0_18px_48px_rgba(120,53,15,0.08)] sm:p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[color:var(--dockguard-muted)]">
        {title}
      </p>
      <div className="mt-5 flex items-center justify-center">
        <div className="relative h-40 w-40">
          <svg
            viewBox="0 0 120 120"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label="Build efficiency distribution"
          >
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              fill="transparent"
              className="text-stone-200 dark:text-slate-800"
            />
            {total > 0 && (
              <>
                <circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  stroke="rgba(16, 185, 129, 0.9)"
                  strokeWidth={STROKE_WIDTH}
                  fill="transparent"
                  strokeDasharray={`${efficientDash} ${CIRCUMFERENCE - efficientDash}`}
                  strokeDashoffset={0}
                  strokeLinecap="butt"
                />
                <circle
                  cx="60"
                  cy="60"
                  r={RADIUS}
                  stroke="var(--dockguard-accent)"
                  strokeWidth={STROKE_WIDTH}
                  fill="transparent"
                  strokeDasharray={`${wastedDash} ${CIRCUMFERENCE - wastedDash}`}
                  strokeDashoffset={-efficientDash}
                  strokeLinecap="butt"
                />
              </>
            )}
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
            <span className="text-2xl font-semibold tracking-tight text-[color:var(--dockguard-ink)]">
              {formatScore(summary.efficiency_score)}
            </span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--dockguard-muted)]">
              score
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        <BuildStat
          label="Image Size"
          value={formatBytes(summary.image_size_bytes)}
          dotClassName="bg-emerald-500/90"
        />
        <BuildStat
          label="Waste %"
          value={formatPercent(summary.wasted_percent)}
          dotClassName="bg-[color:var(--dockguard-accent)]"
        />
        <BuildStat
          label="Layers"
          value={String(summary.layer_count ?? "—")}
          dotClassName="bg-stone-400 dark:bg-stone-500"
        />
        <BuildStat
          label="Contributors"
          value={String(summary.inefficient_layer_count ?? "—")}
          dotClassName="bg-stone-300 dark:bg-stone-600"
        />
      </div>
    </section>
  );
}

function BuildStat({
  label,
  value,
  dotClassName,
}: {
  label: string;
  value: string;
  dotClassName: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-[18px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`h-2.5 w-2.5 rounded-full ${dotClassName}`} />
        <span className="text-sm font-medium text-[color:var(--dockguard-ink)]">
          {label}
        </span>
      </div>
      <span className="font-mono text-sm text-[color:var(--dockguard-muted)]">
        {value}
      </span>
    </div>
  );
}
