import { ScanSummary } from "@/lib/api";
import { getSeverityPresentation, SEVERITY_ORDER } from "@/lib/constants";

const MOBILE_SEVERITIES = [
  { key: "CRITICAL", label: "Critical", color: "#dc2626" },
  { key: "HIGH", label: "High", color: "#ea580c" },
  { key: "MEDIUM", label: "Med", color: "#ca8a04" },
  { key: "LOW", label: "Low", color: "#2563eb" },
] as const;

export function MobileSeveritySummary({ summary }: { summary: ScanSummary | null }) {
  if (!summary) return null;

  const items = MOBILE_SEVERITIES.map((s) => ({
    ...s,
    count: summary[s.key.toLowerCase() as keyof ScanSummary] as number,
  })).filter((s) => s.count > 0);

  const total = items.reduce((acc, s) => acc + s.count, 0);

  if (total === 0) {
    return (
      <div className="flex items-center gap-2 md:hidden">
        <span className="h-2 w-2 rounded-full bg-emerald-500" />
        <span className="text-xs text-[color:var(--dockguard-muted)]">No vulnerabilities found</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 md:hidden">
      {items.map((item) => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--dockguard-border)] bg-[color:var(--dockguard-panel)] px-3 py-1 text-xs"
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="font-semibold tabular-nums text-[color:var(--dockguard-ink)]">{item.count}</span>
          <span className="text-[color:var(--dockguard-muted)]">{item.label}</span>
        </span>
      ))}
    </div>
  );
}

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
              className="text-stone-200 dark:text-slate-800"
            />
            {segments.map((segment) => (
              <circle
                key={segment.severity}
                cx="60"
                cy="60"
                r={RADIUS}
                stroke={getSeverityPresentation(segment.severity).color}
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
                style={{
                  backgroundColor: getSeverityPresentation(item.severity).color,
                }}
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
