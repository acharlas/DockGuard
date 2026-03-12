import { ScanSummary } from "@/lib/api";
import { SEVERITY_COLORS, SEVERITY_ORDER } from "@/lib/constants";

const RADIUS = 42;
const STROKE_WIDTH = 12;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function getSeverityValue(summary: ScanSummary | null, severity: string) {
  if (!summary) {
    return null;
  }

  return summary[severity.toLowerCase() as keyof ScanSummary];
}

export function SeverityDonut({
  summary,
  title = "Issues",
}: {
  summary: ScanSummary | null;
  title?: string;
}) {
  const hasSummary = summary !== null;
  const values = SEVERITY_ORDER.map((severity) => ({
    severity,
    value: getSeverityValue(summary, severity),
  }));
  const total = values.reduce((acc, item) => acc + (item.value ?? 0), 0);

  let offset = 0;
  const segments = values.flatMap((item) => {
    const value = item.value ?? 0;
    if (!hasSummary || total === 0 || value === 0) {
      return [];
    }

    const dash = (value / total) * CIRCUMFERENCE;
    const segment = {
      severity: item.severity,
      dash,
      offset,
    };
    offset += dash;
    return [segment];
  });

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
            aria-label="Issue distribution"
          >
            <circle
              cx="60"
              cy="60"
              r={RADIUS}
              stroke="currentColor"
              strokeWidth={STROKE_WIDTH}
              fill="transparent"
              className="text-amber-100 dark:text-stone-800"
            />
            {segments.map((segment) => (
              <circle
                key={segment.severity}
                cx="60"
                cy="60"
                r={RADIUS}
                stroke={SEVERITY_COLORS[segment.severity]}
                strokeWidth={STROKE_WIDTH}
                fill="transparent"
                strokeDasharray={`${segment.dash} ${CIRCUMFERENCE - segment.dash}`}
                strokeDashoffset={-segment.offset}
                strokeLinecap="butt"
              />
            ))}
          </svg>

          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-3xl font-semibold tracking-tight text-[color:var(--dockguard-ink)]">
              {hasSummary ? total : "—"}
            </span>
            <span className="mt-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[color:var(--dockguard-muted)]">
              issues
            </span>
          </div>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {values.map((item) => (
          <div
            key={item.severity}
            className="flex items-center justify-between rounded-[18px] border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: SEVERITY_COLORS[item.severity] }}
              />
              <span className="text-sm font-medium text-[color:var(--dockguard-ink)]">
                {item.severity}
              </span>
            </div>
            <span className="font-mono text-sm text-[color:var(--dockguard-muted)]">
              {item.value ?? "—"}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
