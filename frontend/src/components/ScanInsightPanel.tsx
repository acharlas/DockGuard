import { ScanDetail } from "@/lib/api";
import { BuildDonut } from "@/components/BuildDonut";
import { SeverityDonut } from "@/components/SeverityDonut";
import { WorkspaceTab } from "@/components/ScanWorkspace";

type ScanInsightPanelProps = {
  activeTab: WorkspaceTab;
  scan: ScanDetail | null;
  severityFilter: string | null;
  onSeverityFilter: (severity: string | null) => void;
};

export function ScanInsightPanel({
  activeTab,
  scan,
  severityFilter,
  onSeverityFilter,
}: ScanInsightPanelProps) {
  if (activeTab === "security") {
    return (
      <SeverityDonut
        summary={scan?.summary ?? null}
        severityFilter={severityFilter}
        onSeverityFilter={onSeverityFilter}
      />
    );
  }

  const buildSummary = scan?.build?.summary ?? null;
  const buildStatus = scan?.build_status ?? null;
  const buildFailureReason = scan?.build?.failure_reason ?? null;

  return (
    <BuildDonut
      summary={buildSummary}
      status={buildStatus}
      failureReason={buildFailureReason}
    />
  );
}
