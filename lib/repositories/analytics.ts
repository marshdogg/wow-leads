/**
 * Dashboard read models.
 *
 * Anything derivable from seeded rows is queried here — pending approvals,
 * neglected counts, active bid value, referral and attributed sums, partner
 * counts. Everything else is a labelled constant in `lib/fixtures/analytics.ts`
 * carrying the query that will replace it. Nothing on a dashboard is invented
 * at this layer.
 */

import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { approvals, deals } from "@/db/schema";
import {
  APPROVAL_REPLY_RATE,
  BIZDEV_AVG_TIME_BETWEEN_TOUCHES,
  BIZDEV_CONTACTS_IN_SEQUENCE,
  BIZDEV_MEETINGS_BOOKED,
  COMM_DECISIONS_INSIDE_30_DAYS,
  COMM_WIN_RATE,
  LEADERBOARD,
  PARTNER_ATTRIBUTED_NOTE,
  PARTNER_REFERRALS_YTD_NOTE,
  PIPELINE_HEALTH,
  PROSPECT_AVG_TIME_BETWEEN_TOUCHPOINTS,
  PROSPECT_CONTACTS_IN_PROGRESS,
  RESI_ELIGIBLE_PAST_CUSTOMERS,
  RESI_REPEAT_REVENUE,
  SOURCE_ROI,
  TRIGGERS_FIRED_THIS_WEEK,
  TRIGGERS_LIVE,
} from "@/lib/fixtures/analytics";
import { getNeglectedDeals, getPipelineValueThousands } from "./deals";
import { metricThousands } from "./rules";
import type { DealMetric, PipelineId } from "@/lib/types";

export interface Stat {
  label: string;
  value: string;
  color: string;
  note: string;
}

export interface LeaderboardRow {
  initials: string;
  name: string;
  isAgent: boolean;
  calls: string;
  callsColor: string;
  visits: string;
  proposals: string;
  contacts: string;
}

export interface HealthRow {
  name: string;
  active: string;
  win: string;
  winColor: string;
  size: string;
}

export interface SourceRoiRow {
  label: string;
  pct: string;
  value: string;
  color: string;
}

/** Metric values are already in thousands: 1050 → "$1.05M", 192.4 → "$192K". */
function formatThousands(k: number): string {
  if (k >= 1000) return `$${(k / 1000).toFixed(2)}M`;
  return `$${Math.round(k)}K`;
}

function sumMetric(rows: { metrics: DealMetric[] }[], label: string): number {
  return rows.reduce((acc, r) => {
    const m = r.metrics.find((x) => x.label === label);
    return acc + (m ? metricThousands(m.value) : 0);
  }, 0);
}

async function countDrafted(): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(approvals)
    .where(eq(approvals.status, "drafted"));
  return row?.n ?? 0;
}

/* -------------------------------------------------------------------------
   Board KPI strip
   ------------------------------------------------------------------------- */

export async function getBoardStats(pipe: PipelineId): Promise<Stat[]> {
  if (pipe === "resi") {
    const pending = await countDrafted();
    return [
      RESI_ELIGIBLE_PAST_CUSTOMERS,
      {
        label: "AI touchpoints awaiting you",
        value: String(pending),
        color: pending ? "#e0a52b" : "#b6f07a",
        note: "drafted, nothing sent",
      },
      RESI_REPEAT_REVENUE,
    ];
  }

  if (pipe === "comm") {
    const [valueK, [bids]] = await Promise.all([
      getPipelineValueThousands("comm"),
      db.select({ n: count() }).from(deals).where(eq(deals.pipelineId, "comm")),
    ]);
    return [
      {
        label: "Active bid value",
        value: formatThousands(valueK),
        color: "#e9ede9",
        note: `across ${bids?.n ?? 0} live bids`,
      },
      COMM_WIN_RATE,
      COMM_DECISIONS_INSIDE_30_DAYS,
    ];
  }

  if (pipe === "bizdev") {
    return [
      BIZDEV_CONTACTS_IN_SEQUENCE,
      BIZDEV_AVG_TIME_BETWEEN_TOUCHES,
      BIZDEV_MEETINGS_BOOKED,
    ];
  }

  const partnerRows = await db
    .select({ stageId: deals.stageId, metrics: deals.metrics })
    .from(deals)
    .where(eq(deals.pipelineId, "partner"));
  const active = partnerRows.filter((r) => r.stageId === "active").length;
  const referrals = sumMetric(partnerRows, "REFERRALS SENT");
  const attributed = sumMetric(partnerRows, "ATTRIBUTED");

  return [
    {
      label: "Active referrers",
      value: String(active),
      color: "#e9ede9",
      note: `of ${partnerRows.length} partners`,
    },
    {
      label: "Referrals received YTD",
      value: String(Math.round(referrals)),
      color: "#7ed321",
      note: PARTNER_REFERRALS_YTD_NOTE,
    },
    {
      label: "Revenue attributed",
      value: formatThousands(attributed),
      color: "#7ed321",
      note: PARTNER_ATTRIBUTED_NOTE,
    },
  ];
}

/* -------------------------------------------------------------------------
   Approvals page
   ------------------------------------------------------------------------- */

export async function getTriggerStats(): Promise<Stat[]> {
  return [TRIGGERS_LIVE, TRIGGERS_FIRED_THIS_WEEK, APPROVAL_REPLY_RATE];
}

/* -------------------------------------------------------------------------
   Manager dashboard
   ------------------------------------------------------------------------- */

export async function getLeaderboard(): Promise<LeaderboardRow[]> {
  return LEADERBOARD;
}

export async function getPipelineHealth(): Promise<HealthRow[]> {
  return PIPELINE_HEALTH;
}

export async function getSourceRoi(): Promise<SourceRoiRow[]> {
  return SOURCE_ROI;
}

export async function getProspectMetrics(): Promise<Stat[]> {
  const neglected = await getNeglectedDeals();
  return [
    PROSPECT_CONTACTS_IN_PROGRESS,
    PROSPECT_AVG_TIME_BETWEEN_TOUCHPOINTS,
    {
      // The prototype wrote "14d+". The count now spans pipelines with
      // different windows (45 days on Commercial), so the number is left out
      // of the label rather than allowed to drift out of date.
      label: "Deals with no activity past the window",
      value: String(neglected.length),
      color: "#e07a68",
      note: "shown in the alert above",
    },
  ];
}

/** Total value carried by the neglected list, for the dashboard's alert bar. */
export async function getNeglectedValue(): Promise<string> {
  const rows = await getNeglectedDeals();
  const total = rows.reduce((acc, r) => acc + metricThousands(r.value), 0);
  return formatThousands(total);
}

/** Overdue and pending counts used by the nav badges. */
export async function getQueueCounts(): Promise<{
  pendingApprovals: number;
  overdue: number;
  neglected: number;
}> {
  const [pendingApprovals, [overdueRow], neglected] = await Promise.all([
    countDrafted(),
    db
      .select({ n: count() })
      .from(deals)
      .where(and(eq(deals.nextState, "overdue"))),
    getNeglectedDeals(),
  ]);
  return {
    pendingApprovals,
    overdue: overdueRow?.n ?? 0,
    neglected: neglected.length,
  };
}
