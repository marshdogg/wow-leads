/**
 * Completed jobs and the campaigns that read them.
 *
 * Extracted from the seed so the relationship between the two is testable:
 * a review campaign timed at "4 days after the job" is only a demo if some
 * job actually finished four days ago, and that coupling is invisible when
 * both halves live inside a script.
 */

/** A job dated relative to seed time, or on a fixed calendar date. */
export interface JobFixture {
  id: string;
  /**
   * A synthetic Funnel id, `seed:` prefixed.
   *
   * Two reasons it is not null. It exercises the ingest endpoint's
   * idempotency path with demo data rather than only in tests — a re-seed
   * conflicts on it exactly as a retried webhook would. And the prefix keeps
   * the rows honestly labelled: `getJobCompletionStats()` counts anything
   * `seed:` as *not* from the Funnel, so a screen can say "5 completions,
   * none live yet" instead of implying an integration that does not exist.
   */
  wowOsJobId: string;
  accountId: string;
  dealId: string;
  /** Exactly one of these. */
  completedDaysAgo?: number;
  completedAt?: Date;
  workType: string;
  scope: string;
  areas: string[];
  valueCents: number;
  crew: string | null;
}

export interface CampaignFixture {
  id: string;
  name: string;
  category: string;
  description: string;
  audienceKind: string;
  audienceParams: Record<string, unknown>;
  approvalMode: string;
  active: boolean;
  reenrolAfterDays: number | null;
  authoredBy: string;
}

export interface CampaignStepFixture {
  id: string;
  campaignId: string;
  stepNumber: number;
  delayDays: number;
  channel: string;
  templateId: string | null;
  label: string;
}

/**
 * Completed jobs, reconstructed from the job history the cards already show
 * as strings — `LAST JOB $8,400`, `COMPLETED Aug 2025`. Same facts, but as
 * timestamps a campaign can be timed against.
 *
 * Priya's job is **exactly four days back** on purpose: a "4 days after the
 * job" review campaign has to select somebody or the feature demos as an empty
 * list. It also happens to be the most coherent record in the set — we
 * finished her interior, she is now being asked for a referral, and she named
 * a neighbour.
 */
export const JOB_FIXTURES: JobFixture[] = [
  {
    id: "job-r1",
    wowOsJobId: "seed:job-r1",
    accountId: "acct-r1",
    dealId: "r1",
    completedAt: new Date(2025, 7, 21, 17, 0, 0),
    workType: "interior",
    scope: "4 rooms, hallway, stairwell",
    areas: ["hallway", "stairwell"],
    valueCents: 840_000,
    crew: "Kris Jolin crew",
  },
  {
    id: "job-r2",
    wowOsJobId: "seed:job-r2",
    accountId: "acct-r2",
    dealId: "r2",
    completedDaysAgo: 122,
    workType: "exterior",
    scope: "Siding and trim",
    areas: ["siding", "trim"],
    valueCents: 1_210_000,
    crew: "Granville Smith crew",
  },
  {
    id: "job-r3",
    wowOsJobId: "seed:job-r3",
    accountId: "acct-r3",
    dealId: "r3",
    completedDaysAgo: 4,
    workType: "interior",
    scope: "2 bedrooms and the landing",
    areas: ["bedrooms", "landing"],
    valueCents: 625_000,
    crew: "Kris Jolin crew",
  },
  {
    id: "job-r4",
    wowOsJobId: "seed:job-r4",
    accountId: "acct-r4",
    dealId: "r4",
    completedAt: new Date(2025, 1, 14, 17, 0, 0),
    workType: "interior",
    scope: "Basement and stairwell",
    areas: ["basement", "stairwell"],
    valueCents: 490_000,
    crew: "Craig Merrills crew",
  },
  {
    id: "job-r8",
    wowOsJobId: "seed:job-r8",
    accountId: "acct-r8",
    dealId: "r8",
    completedDaysAgo: 2,
    workType: "exterior",
    scope: "Siding, trim and front door",
    areas: ["siding", "trim", "front door"],
    valueCents: 925_000,
    crew: "Kris Jolin crew",
  },
];

/**
 * Two campaigns, so the screen has something real on it. Both start inactive —
 * a campaign that begins sending the moment it is seeded is not a demo, it is
 * an accident.
 */
export const CAMPAIGN_FIXTURES: CampaignFixture[] = [
  {
    id: "camp-review",
    name: "Google review request",
    category: "RESIDENTIAL LEADS",
    description:
      "Asks for a review four days after the job finishes — long enough for the paint to look settled, soon enough that they still remember the crew's names.",
    audienceKind: "job_completed_days_ago",
    audienceParams: { days: 4 },
    approvalMode: "per_message",
    active: false,
    reenrolAfterDays: 365,
    authoredBy: "u-marshall",
  },
  {
    id: "camp-winback",
    name: "Two-year win-back",
    category: "RESIDENTIAL LEADS",
    description:
      "Customers we have not worked for in two years. The cheapest lead is one who already knows the crew.",
    audienceKind: "no_job_in_months",
    audienceParams: { months: 24 },
    approvalMode: "per_message",
    active: false,
    reenrolAfterDays: 365,
    authoredBy: "u-marshall",
  },
];

export const CAMPAIGN_STEP_FIXTURES: CampaignStepFixture[] = [
  {
    id: "camp-review-s1",
    campaignId: "camp-review",
    stepNumber: 1,
    delayDays: 0,
    channel: "SMS",
    templateId: null,
    label: "Ask for the review",
  },
  {
    id: "camp-review-s2",
    campaignId: "camp-review",
    stepNumber: 2,
    delayDays: 5,
    channel: "EMAIL",
    templateId: null,
    label: "One reminder, then stop",
  },
  {
    id: "camp-winback-s1",
    campaignId: "camp-winback",
    stepNumber: 1,
    delayDays: 0,
    channel: "EMAIL",
    templateId: null,
    label: "Open the conversation",
  },
];
