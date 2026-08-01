import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import { ApprovalsQueue } from "@/components/approvals/ApprovalsQueue";
import { TriggerStats } from "@/components/approvals/TriggerStats";
import { getTriggerStats } from "@/lib/repositories/analytics";
import { toApproval } from "@/lib/repositories/mappers";
import type { Approval } from "@/lib/types";

/**
 * Approvals.
 *
 * The gate. Every AI-drafted touchpoint in the system passes through this
 * screen and none of them send until somebody here says so.
 *
 * A server component: the queue and the trigger stats are server state, and
 * only the decision buttons need to be interactive.
 */

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Approvals · WOW Leads",
};

/**
 * Oldest first — a draft that has been waiting since yesterday should be
 * answered before one that fired this morning.
 *
 * Reads the table directly rather than through a repository: this is the only
 * consumer, and it is a plain read with no invariants to protect.
 */
async function getPendingApprovals(): Promise<Approval[]> {
  const rows = await db
    .select()
    .from(approvals)
    .where(eq(approvals.status, "drafted"))
    .orderBy(asc(approvals.createdAt));
  return rows.map(toApproval);
}

export default async function ApprovalsPage() {
  const [pending, stats] = await Promise.all([
    getPendingApprovals(),
    getTriggerStats(),
  ]);

  return (
    <div
      style={{
        flex: 1,
        minHeight: 560,
        overflowY: "auto",
        padding: "18px 28px 30px",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
        <h1
          style={{
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: "-0.5px",
            margin: 0,
          }}
        >
          Approvals
        </h1>
        <div style={{ fontSize: 13, color: "#7d877d" }}>
          AI drafted these from triggers. Nothing sends without a human.
        </div>
      </div>

      <TriggerStats stats={stats} />
      <ApprovalsQueue approvals={pending} />
    </div>
  );
}
