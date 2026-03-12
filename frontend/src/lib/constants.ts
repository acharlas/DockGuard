export const SCAN_STATUS = {
  PENDING: "pending",
  RUNNING: "running",
  COMPLETED: "completed",
  FAILED: "failed",
  CANCELLED: "cancelled",
} as const;

export const STATUS_STYLES: Record<string, string> = {
  pending:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  running:
    "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  completed:
    "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  unavailable:
    "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

export const SEVERITY_PRESENTATION: Record<
  string,
  {
    badgeClassName: string;
    color: string;
    textClassName: string;
  }
> = {
  CRITICAL: {
    badgeClassName:
      "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50",
    color: "#dc2626",
    textClassName: "text-red-600 dark:text-red-400",
  },
  HIGH: {
    badgeClassName:
      "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/50",
    color: "#ea580c",
    textClassName: "text-orange-600 dark:text-orange-400",
  },
  MEDIUM: {
    badgeClassName:
      "text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/50",
    color: "#ca8a04",
    textClassName: "text-yellow-700 dark:text-yellow-400",
  },
  LOW: {
    badgeClassName:
      "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50",
    color: "#2563eb",
    textClassName: "text-blue-600 dark:text-blue-400",
  },
  UNKNOWN: {
    badgeClassName:
      "text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-950/50",
    color: "#6b7280",
    textClassName: "text-gray-600 dark:text-gray-400",
  },
};

export const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"];

export function getSeverityPresentation(severity: string) {
  return (
    SEVERITY_PRESENTATION[severity.toUpperCase()] ?? SEVERITY_PRESENTATION.UNKNOWN
  );
}
