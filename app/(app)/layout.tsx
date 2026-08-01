import { LeftRail } from "@/components/shell/LeftRail";
import { TopBar } from "@/components/shell/TopBar";
import { Toast } from "@/components/shell/Toast";
import { getAllDeals, getNeglectedDeals } from "@/lib/repositories/deals";
import { getPendingApprovals } from "@/lib/repositories/approvals";
import { getPipelines } from "@/lib/repositories/pipelines";
import { PIPES, PIPELINE_IDS } from "@/lib/pipelines";

export const dynamic = "force-dynamic";

/**
 * Counts for the rail badges and the top-bar approval chip. These go through
 * the same repository functions the Manager dashboard and Approvals queue
 * use — a second hand-written query here would drift from the per-pipeline
 * neglect rule and the badge would contradict the screen it links to.
 */
async function railData() {
  try {
    const [approvals, neglected, pipelines, deals] = await Promise.all([
      getPendingApprovals(),
      getNeglectedDeals(),
      getPipelines(),
      getAllDeals(),
    ]);
    const pipelineCounts: Record<string, number> = {};
    for (const d of deals) {
      pipelineCounts[d.pipe] = (pipelineCounts[d.pipe] ?? 0) + 1;
    }
    return {
      approvalCount: approvals.length,
      neglectedCount: neglected.length,
      pipelines,
      pipelineCounts,
    };
  } catch {
    // The shell must render even before the first migration/seed lands.
    return {
      approvalCount: 0,
      neglectedCount: 0,
      pipelines: PIPELINE_IDS.map((id) => PIPES[id]),
      pipelineCounts: {},
    };
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { approvalCount, neglectedCount, pipelines, pipelineCounts } =
    await railData();

  return (
    <div
      style={{
        display: "flex",
        minHeight: "100vh",
        width: "100%",
        background: "#0d0f0d",
        color: "#e9ede9",
        fontSize: 14,
      }}
    >
      <LeftRail
        approvalCount={approvalCount}
        neglectedCount={neglectedCount}
        pipelines={pipelines}
        pipelineCounts={pipelineCounts}
      />
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <TopBar approvalCount={approvalCount} />
        {children}
      </div>
      <Toast />
    </div>
  );
}
