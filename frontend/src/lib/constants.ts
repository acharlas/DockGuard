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
};

export const SEVERITY_STYLES: Record<string, string> = {
  CRITICAL: "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-950/50",
  HIGH: "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-950/50",
  MEDIUM:
    "text-yellow-700 bg-yellow-50 dark:text-yellow-400 dark:bg-yellow-950/50",
  LOW: "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-950/50",
};

export const SEVERITY_COLORS: Record<string, string> = {
  CRITICAL: "#dc2626",
  HIGH: "#ea580c",
  MEDIUM: "#ca8a04",
  LOW: "#2563eb",
};

export const SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
