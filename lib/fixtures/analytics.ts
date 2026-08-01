/**
 * Dashboard figures the prototype states as business facts with no underlying
 * data in the fixture set.
 *
 * Every constant here is the prototype's exact value, and every one carries a
 * note naming the real query that replaces it once the source system is wired
 * up. `lib/repositories/analytics.ts` computes everything that *is* derivable
 * from seeded rows and reaches in here only for the rest — nothing on the
 * dashboards is invented.
 */

import type {
  HealthRow,
  LeaderboardRow,
  SourceRoiRow,
  Stat,
} from "@/lib/repositories/analytics";

/* -------------------------------------------------------------------------
   Board KPI strip
   ------------------------------------------------------------------------- */

/** REPLACE: `count(jobs) where completed_at between now()-18mo and now()-6mo`. */
export const RESI_ELIGIBLE_PAST_CUSTOMERS: Stat = {
  label: "Eligible past customers",
  value: "186",
  color: "#e9ede9",
  note: "jobs 6–18 months old",
};

/** REPLACE: `sum(jobs.value) where source='re-marketing' and booked this quarter`. */
export const RESI_REPEAT_REVENUE: Stat = {
  label: "Repeat revenue booked",
  value: "$41.2K",
  color: "#7ed321",
  note: "this quarter, from re-marketing",
};

/** REPLACE: `won / (won+lost)` over commercial deals closed in the last 12 months. */
export const COMM_WIN_RATE: Stat = {
  label: "Win rate",
  value: "31%",
  color: "#7ed321",
  note: "trailing 12 months",
};

/**
 * REPLACE: `count(deals) where decision_date < now()+30d`. The fixture metric
 * is a display string ("Sep 9", "Aug 22"), not a date column, so this stays a
 * constant until decision dates are stored as timestamps.
 */
export const COMM_DECISIONS_INSIDE_30_DAYS: Stat = {
  label: "Decisions inside 30 days",
  value: "2",
  color: "#e0a52b",
  note: "Hillcrest, Marlowe",
};

/** REPLACE: `count(contacts) with an active sequence enrolment`. */
export const BIZDEV_CONTACTS_IN_SEQUENCE: Stat = {
  label: "Contacts in sequence",
  value: "38",
  color: "#e9ede9",
  note: "62% mid-sequence",
};

/** REPLACE: `avg(lead(occurred_at) - occurred_at)` over sequence touchpoints. */
export const BIZDEV_AVG_TIME_BETWEEN_TOUCHES: Stat = {
  label: "Avg time between touches",
  value: "3.4d",
  color: "#7ed321",
  note: "sequence target 3d",
};

/** REPLACE: `count(deals) entering stage 'meeting' this calendar month`. */
export const BIZDEV_MEETINGS_BOOKED: Stat = {
  label: "Meetings booked this month",
  value: "5",
  color: "#7ed321",
  note: "2 handed to Commercial",
};

/** Notes only — the values beside them are computed from partner deal metrics. */
export const PARTNER_REFERRALS_YTD_NOTE = "+11 vs. last year";
export const PARTNER_ATTRIBUTED_NOTE = "18% of booked work";

/* -------------------------------------------------------------------------
   Approvals page trigger stats
   ------------------------------------------------------------------------- */

/** REPLACE: `count(distinct trigger_type)` over enabled trigger definitions. */
export const TRIGGERS_LIVE: Stat = {
  label: "Triggers live",
  value: "4",
  color: "#e9ede9",
  note: "11-month · seasonal · revival · sequence",
};

/** REPLACE: `count(approvals) where created_at > now()-7d`, split by status. */
export const TRIGGERS_FIRED_THIS_WEEK: Stat = {
  label: "Fired this week",
  value: "23",
  color: "#7ed321",
  note: "19 approved, 4 skipped",
};

/** REPLACE: replies within 72h ÷ approvals sent. Needs inbound reply capture. */
export const APPROVAL_REPLY_RATE: Stat = {
  label: "Approval → reply rate",
  value: "38%",
  color: "#7ed321",
  note: "vs. 12% on cold outreach",
};

/* -------------------------------------------------------------------------
   Manager dashboard
   ------------------------------------------------------------------------- */

/**
 * REPLACE: per-rep counts of `touchpoints` grouped by channel over the period,
 * plus drafted-approval counts for the agents. The seeded timeline holds 5
 * hero + 3 generic touchpoints per deal, which is fixture filler rather than
 * real activity, so counting it would produce numbers that mean nothing.
 */
export const LEADERBOARD: LeaderboardRow[] = [
  {
    initials: "DK",
    name: "Dani Koval",
    isAgent: false,
    calls: "41",
    callsColor: "#b6f07a",
    visits: "6",
    proposals: "4",
    contacts: "12",
  },
  {
    initials: "JB",
    name: "Jorden Bhatt",
    isAgent: false,
    calls: "28",
    callsColor: "#c6cdc6",
    visits: "9",
    proposals: "6",
    contacts: "7",
  },
  {
    initials: "RA",
    name: "Reese Alvarado",
    isAgent: false,
    calls: "19",
    callsColor: "#e0a52b",
    visits: "3",
    proposals: "2",
    contacts: "5",
  },
  {
    initials: "AI",
    name: "Re-marketing agent",
    isAgent: true,
    calls: "—",
    callsColor: "#6f7a6f",
    visits: "—",
    proposals: "—",
    contacts: "31 drafted",
  },
  {
    initials: "AI",
    name: "Prospecting agent",
    isAgent: true,
    calls: "—",
    callsColor: "#6f7a6f",
    visits: "—",
    proposals: "—",
    contacts: "18 drafted",
  },
];

/**
 * REPLACE: `active` is `sum(EST. VALUE|BID)` grouped by owner — that already
 * reproduces Jorden ($806K) and Dani ($244K) exactly from the seeded metrics,
 * but Reese's $61K has no backing rows (Reese owns no commercial deals), and
 * `win` / `size` need closed-deal history. Kept whole so the table stays
 * internally consistent with the prototype rather than half-computed.
 */
export const PIPELINE_HEALTH: HealthRow[] = [
  {
    name: "Jorden Bhatt",
    active: "$806K",
    win: "34%",
    winColor: "#b6f07a",
    size: "$134K",
  },
  {
    name: "Dani Koval",
    active: "$244K",
    win: "41%",
    winColor: "#b6f07a",
    size: "$18K",
  },
  {
    name: "Reese Alvarado",
    active: "$61K",
    win: "22%",
    winColor: "#e0a52b",
    size: "$9K",
  },
  {
    name: "Team",
    active: "$1.11M",
    win: "31%",
    winColor: "#c6cdc6",
    size: "$54K",
  },
];

/**
 * REPLACE: `sum(jobs.value) group by lead_source` over the trailing 12 months,
 * with `pct` as won ÷ qualified per source. Requires closed-won job revenue
 * joined back to the originating lead — none of that is in the fixture set.
 */
export const SOURCE_ROI: SourceRoiRow[] = [
  { label: "Past Customer", pct: "92%", value: "$284K", color: "#7ed321" },
  { label: "GC Referral", pct: "74%", value: "$228K", color: "#7ed321" },
  { label: "Partner Referral", pct: "62%", value: "$192K", color: "#6fab48" },
  { label: "Google Ads", pct: "38%", value: "$117K", color: "#59853f" },
  { label: "Yard Sign", pct: "21%", value: "$64K", color: "#3f5c31" },
  { label: "Cold Call", pct: "14%", value: "$43K", color: "#3f5c31" },
  { label: "Door Hanger", pct: "9%", value: "$27K", color: "#3f5c31" },
];

/** REPLACE: enrolled-and-not-finished ÷ enrolled, over sequence enrolments. */
export const PROSPECT_CONTACTS_IN_PROGRESS: Stat = {
  label: "Contacts in progress",
  value: "62%",
  color: "#7ed321",
  note: "38 of 61 in an active sequence",
};

/** REPLACE: same query as `BIZDEV_AVG_TIME_BETWEEN_TOUCHES`. */
export const PROSPECT_AVG_TIME_BETWEEN_TOUCHPOINTS: Stat = {
  label: "Avg time between touchpoints",
  value: "3.4d",
  color: "#7ed321",
  note: "sequence target is 3 days",
};
