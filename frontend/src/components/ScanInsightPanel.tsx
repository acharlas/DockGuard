import { ScanDetail } from "@/lib/api";
import { BuildDonut } from "@/components/BuildDonut";
import { SeverityDonut } from "@/components/SeverityDonut";
import { WorkspaceTab } from "@/components/ScanWorkspace";

type ScanInsightPanelProps = {
  activeTab: WorkspaceTab;
  scan: ScanDetail | null;
};

export function ScanInsightPanel({
  activeTab,
  scan,
}: ScanInsightPanelProps) {
  if (activeTab === "security") {
    return <SeverityDonut summary={scan?.summary ?? null} />;
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
