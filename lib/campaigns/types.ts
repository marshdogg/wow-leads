import type { PipelineCategory, PipelineId } from "@/lib/types";

/**
 * Campaigns — user-created outreach programmes that are *not* pipelines.
 *
 * A pipeline has a ladder and per-deal state: a lead moves through stages
 * toward a booking. A campaign has neither. A Google-review ask is one or two
 * sends after a job; a newsletter is recurring to a list. Forcing those onto a
 * board would give you a column every card sits in forever, so they get their
 * own shape: an audience, a series of steps, and a schedule.
 *
 * The two share templates and the approval gate. Nothing sends unreviewed
 * unless the campaign explicitly says so — see `ApprovalMode`.
 */

/* -------------------------------------------------------------------------
   Audiences
   ------------------------------------------------------------------------- */

/**
 * Who enters a campaign.
 *
 * Deliberately a closed set of *parameterised kinds* rather than a query
 * builder. These four cover review requests, cross-sell, newsletters and
 * stage-based nurture — which is every case anyone has actually asked for —
 * and each is a dropdown plus a number rather than a schema a franchise has
 * to learn. A general query builder is the expensive way to serve the same
 * three examples, and it can express audiences we cannot safely send to.
 */
export type AudienceKind =
  /** Fires a fixed interval after a job finished. Review requests. */
  | "job_completed_days_ago"
  /** Customers we haven't worked for lately. Cross-sell, win-back. */
  | "no_job_in_months"
  /** Everyone carrying a tag. Newsletters, service-specific offers. */
  | "tagged"
  /** Everyone sitting in a given pipeline stage. Stage-based nurture. */
  | "pipeline_stage";

export interface AudienceParams {
  /** `job_completed_days_ago` — days since completion, exact-day window. */
  days?: number;
  /** `no_job_in_months` — months of silence before they qualify. */
  months?: number;
  /** `tagged` — the account tag, e.g. "DIRECT HOMEOWNER". */
  tag?: string;
  /**
   * `pipeline_stage`. Open strings rather than the seeded unions: categories
   * are already user-creatable and pipelines are rows, so an audience must be
   * able to name one that didn't exist at compile time. Validated against the
   * database at the boundary, which also catches a stage deleted after the
   * campaign was written — something a literal union cannot do.
   */
  pipelineId?: string;
  stageId?: string;
}

export interface Audience {
  kind: AudienceKind;
  params: AudienceParams;
}

/** The facts an audience predicate is evaluated against, per candidate. */
export interface AudienceFacts {
  /** When their most recent job completed. Null when they've never had one. */
  jobCompletedAt: Date | null;
  tags: string[];
  pipelineId: PipelineId;
  stageId: string;
  /** Guards against re-entering someone the campaign already contacted. */
  lastEnrolledAt: Date | null;
}

/* -------------------------------------------------------------------------
   Campaigns
   ------------------------------------------------------------------------- */

/**
 * Whether each send is reviewed individually, or the run is approved once.
 *
 * A newsletter through a one-by-one approval queue would be absurd, and a
 * review request going out unreviewed would be worse. So it is per campaign,
 * and `per_message` is the default — a franchise opts into bulk deliberately.
 */
export type ApprovalMode = "per_message" | "bulk";

export interface CampaignStep {
  id: string;
  campaignId: string;
  stepNumber: number;
  /** Days after the previous step — or after enrolment, for step one. */
  delayDays: number;
  /** SMS | EMAIL | PHONE. */
  channel: string;
  /**
   * Pinned template, or null to resolve by scope at send time. Null is the
   * better default: the copy then follows whatever the Templates screen says
   * rather than freezing at the moment the campaign was written.
   */
  templateId: string | null;
  label: string;
}

export interface Campaign {
  id: string;
  name: string;
  /** Rail grouping — categories are open strings, so this can be new. */
  category: PipelineCategory;
  description: string;
  audience: Audience;
  approvalMode: ApprovalMode;
  active: boolean;
  /** Stops someone receiving the same campaign twice within the window. */
  reenrolAfterDays: number | null;
  authoredBy: string | null;
  /** Recipients on the last run. Null until it has run. Feeds the volume guard. */
  lastRunCount: number | null;

  /**
   * Bulk approval of a campaign *version*.
   *
   * `approvedHash` covers the audience rule, the steps and the resolved copy,
   * so editing any of them clears all three and the campaign stops sending
   * until somebody approves again. Revocation happens in `saveCampaign` —
   * a gate a caller can forget to close is not a gate. Always null on a
   * per-message campaign, which approves nothing in advance.
   */
  approvedAt: Date | null;
  approvedBy: string | null;
  approvedHash: string | null;

  steps: CampaignStep[];
}

export type EnrolmentState = "active" | "completed" | "exited";

export interface CampaignEnrolment {
  id: string;
  campaignId: string;
  dealId: string;
  enrolledAt: Date;
  currentStep: number;
  state: EnrolmentState;
  /** Why they left early — "job booked", "unsubscribed", "audience no longer matches". */
  exitReason: string | null;
}

/* -------------------------------------------------------------------------
   Jobs — the signal post-job campaigns depend on
   ------------------------------------------------------------------------- */

/**
 * A completed job, as reported by the WOW OS Funnel.
 *
 * This is the piece WOW Leads has never had. Job facts on a card today are
 * display strings (`LAST JOB $8,400`, `COMPLETED Aug 2025`) — enough to render,
 * useless for "fire 4 days after completion". A review campaign needs a real
 * timestamp, so the Funnel has to tell us, and until it does this table is fed
 * only by the seed. See `lib/wow-os/client.ts`.
 */
export interface CompletedJob {
  id: string;
  accountId: string;
  /** The deal the job came from, when we know it. */
  dealId: string | null;
  completedAt: Date;
  /** "interior" | "exterior" | "industrial" */
  workType: string;
  /** "4 rooms, hallway, stairwell" */
  scope: string;
  /** Named areas, for templates that reference them. */
  areas: string[];
  valueCents: number;
  crew: string | null;
}
