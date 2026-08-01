import { LeftRail } from "@/components/shell/LeftRail";
import { TopBar } from "@/components/shell/TopBar";
import { Toast } from "@/components/shell/Toast";
import { getNeglectedDeals } from "@/lib/repositories/deals";
import { getPendingApprovals } from "@/lib/repositories/approvals";

export const dynamic = "force-dynamic";

/**
 * Counts for the rail badges and the top-bar approval chip. These go through
 * the same repository functions the Manager dashboard and Approvals queue
 * use — a second hand-written query here would drift from the per-pipeline
 * neglect rule and the badge would contradict the screen it links to.
 */
async function railCounts() {
  try {
    const [approvals, neglected] = await Promise.all([
      getPendingApprovals(),
      getNeglectedDeals(),
    ]);
    return {
      approvalCount: approvals.length,
      neglectedCount: neglected.length,
    };
  } catch {
    // The shell must render even before the first migration/seed lands.
    return { approvalCount: 0, neglectedCount: 0 };
  }
}

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { approvalCount, neglectedCount } = await railCounts();

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
