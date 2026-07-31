import { sql } from "drizzle-orm";
import { db } from "@/db";
import { LeftRail } from "@/components/shell/LeftRail";
import { TopBar } from "@/components/shell/TopBar";
import { Toast } from "@/components/shell/Toast";

export const dynamic = "force-dynamic";

/**
 * Counts for the rail badges and the top-bar approval chip. Kept inline
 * rather than in a repository because they are read-only and the layout is
 * the only consumer.
 */
async function railCounts() {
  try {
    const pending = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from approvals where status = 'drafted'`,
    );
    const neglected = await db.execute<{ n: number }>(
      sql`select count(*)::int as n
          from deals d
          join pipelines p on p.id = d.pipeline_id
          where d.last_touch_at is null
             or d.last_touch_at < now() - (p.neglect_days || ' days')::interval`,
    );
    return {
      approvalCount: Number(pending.rows[0]?.n ?? 0),
      neglectedCount: Number(neglected.rows[0]?.n ?? 0),
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
