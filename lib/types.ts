/**
 * WOW Leads domain types.
 *
 * These are the contract between the data layer and the UI. Pipelines and
 * stages are *data* (see `lib/pipelines.ts` and the `pipelines` / `stages`
 * tables) — the string unions here name the seeded ids, they do not constrain
 * what the database can hold.
 */

/* -------------------------------------------------------------------------
   Pipelines, stages, tracks
   ------------------------------------------------------------------------- */

export type PipelineId = "resi" | "comm" | "bizdev" | "partner" | "newleads";

export type ResiStageId =
  | "past"
  | "first"
  | "second"
  | "promo"
  | "followed"
  // `result` is the Won stage. The id is stable by design — renaming a stage
  // never changes it, so the two seeded deals and their history follow.
  | "result"
  | "resi-lost";
export type CommStageId =
  | "prospect"
  | "invited"
  | "takeoff"
  | "submitted"
  | "negotiation"
  | "hold"
  | "comm-won"
  | "comm-lost";
export type BizdevStageId =
  | "initial"
  | "followup"
  | "meeting"
  | "bizdev-lost";
export type PartnerStageId =
  | "identified"
  | "introduced"
  | "active"
  | "dormant"
  | "partner-lost";
/** Net-new demand. Speed is the whole game, hence the short ladder. */
export type NewLeadStageId =
  | "new"
  | "contacted"
  | "qualified"
  | "booked"
  | "nurture"
  | "newleads-lost";

export type StageId =
  | ResiStageId
  | CommStageId
  | BizdevStageId
  | PartnerStageId
  | NewLeadStageId;

/**
 * Residential tracks describe *why* we're re-approaching someone; New Leads
 * tracks describe *how the lead arrived*. Both drive a coloured chip and a
 * filter, so they share one type — but the sets are per-pipeline, see
 * `PipelineConfig.trackOptions`.
 */
export type ResiTrackId =
  | "referral"
  | "repeat"
  | "revival"
  /**
   * Contact details on file, never quoted. Distinct from `revival`, which
   * needs a lost deal to revive — these people never got a number, so there
   * is no price objection to wait out and nothing for a draft to reference.
   */
  | "neverquoted";
export type NewLeadTrackId = "inbound" | "canvassed" | "event";
export type TrackId = ResiTrackId | NewLeadTrackId;
export type TrackFilterId = "all" | TrackId;

/**
 * What a stage *means*, as distinct from what it is called.
 *
 * Styling, win-rate maths, roll-up reporting and neglect alerts all key off
 * this and never off a stage id or label — which is what makes stages safe to
 * configure. A franchise can invent "Awaiting Permit", tag it `paused`, and
 * every dashboard keeps working with no code change. It is also what lets
 * corporate compare markets whose boards don't align: "Bid Submitted" here and
 * "Quote Out" there both roll up as `open`. Addendum §3.2, §3.5.
 */
export type SemanticType = "open" | "positive" | "paused" | "won" | "lost";

export interface StageConfig {
  /** Stable and machine-generated. A rename never changes it, so history, triggers and reports follow. */
  id: StageId;
  label: string;
  hint: string;
  semanticType: SemanticType;
  /** Optional colour override. Absent means the semantic type decides. */
  accent?: string;
  /** Show the `$X in stage` roll-up on this column. */
  showValueRoll?: boolean;
  /** Force a structured reason on entry. Defaults true for `lost`. */
  requiresReason?: boolean;
  /**
   * Force a revisit date on entry. Defaults true for `paused`.
   *
   * Addendum §3.2 defines paused as "live but on hold (needs revisit date)",
   * and without this the parenthetical is unenforced: a paused deal is
   * excluded from neglect, so one with no revisit date generates no signal at
   * all and falls out of both alerts. Removing a false positive by creating a
   * false negative is the worse trade — a noisy alert gets ignored, a missing
   * one gets trusted.
   */
  requiresRevisitDate?: boolean;
  /** Overrides the pipeline's threshold. See `resolveNeglectDays`. */
  neglectDays?: number;
  /** The landing column for new deals in this pipeline. */
  isDefault?: boolean;
  /** Corporate spine: renameable and reorderable, never removable. */
  locked?: boolean;
  /** Archived stages stay renderable in historical timelines. */
  active?: boolean;
}

/**
 * Rail grouping. Re-marketing and New Leads are both residential — one works
 * people we've already served, the other people we haven't — so they sit
 * together under one heading rather than as peers of the commercial pipelines.
 *
 * Deliberately an open string, not a union: a franchise adds its own headings
 * (a review-request programme, a cross-sell push) without a deploy, the same
 * way stages are rows rather than enum members. The rail derives the headings
 * and their order from the pipelines it is handed, so nothing has to be
 * registered in code first.
 */
export type PipelineCategory = string;

/** The two we ship. Others come from the database. */
export const SEEDED_CATEGORIES = {
  residential: "RESIDENTIAL LEADS",
  commercial: "COMMERCIAL",
} as const;

export interface PipelineConfig {
  id: PipelineId;
  /** Short label used in the rail and on the selector card. */
  label: string;
  /** Which rail group this pipeline sits under, and the board's eyebrow. */
  category: PipelineCategory;
  /** Meta line under the selector label. */
  meta: string;
  /** Selector dot colour. */
  dot: string;
  /** Page title when this pipeline is selected. */
  title: string;
  /** Page subtitle. */
  sub: string;
  /** Filter dropdown label. */
  filter: string;
  /** Whether this pipeline shows the track segmented control. */
  tracks: boolean;
  /** The track filter options, including "All". Empty when `tracks` is false. */
  trackOptions: { id: TrackFilterId; label: string }[];
  /** Column headers show a `$XXXK in stage` roll-up (Commercial only). */
  showStageValue: boolean;
  /** Days without a touchpoint before a deal counts as neglected. */
  neglectDays: number;
  stages: StageConfig[];
}

export interface TrackStyle {
  bg: string;
  color: string;
  border: string;
  label: string;
}

export interface TagStyle {
  bg: string;
  color: string;
}

/* -------------------------------------------------------------------------
   Deal / lead
   ------------------------------------------------------------------------- */

export interface DealOwner {
  initials: string;
  name: string;
  /** true renders the square AI chip instead of a round avatar. */
  agent: boolean;
}

export interface DealMetric {
  label: string;
  value: string;
}

export type NextActionState = "ok" | "overdue";

export interface NextAction {
  label: string;
  due: string;
  state: NextActionState;
}

/**
 * *Disposition*, not outcome — see DECISIONS.md #2.
 *
 * Outcome is the stage's `semanticType` (did we win or lose?). Disposition is
 * what happens next, and both of these live inside `won`: a re-marketing touch
 * that lands an estimate and one that earns a committed retry date are both
 * successes. Rendered on the card's metric strip.
 */
export type ResultOutcome = "booked" | "parked";

/** Required on entry to any `lost` stage. Addendum §2.3. */
export type LostReason =
  | "not interested"
  | "unqualified"
  | "price"
  | "timing"
  | "competitor"
  | "no response"
  | "other";

export const LOST_REASONS: LostReason[] = [
  "not interested",
  "unqualified",
  "price",
  "timing",
  "competitor",
  "no response",
  "other",
];

export interface Deal {
  id: string;
  pipe: PipelineId;
  /** Residential only. */
  track?: TrackId | null;
  stage: StageId;
  name: string;
  /** Address, company, or contact line — the secondary line on the card. */
  account: string;
  tags: string[];
  source: LeadSource;
  owner: DealOwner;
  /** Provenance: "Self-sourced", "Trigger → Dani", … */
  assignedBy: string;
  /** An unapproved AI draft exists → pulsing AI DRAFTED chip. */
  aiPending: boolean;
  /** Human last-touch string ("19d silent", "11 mo since job"). */
  stale: string;
  staleWarn: boolean;
  /** Up to 2, rendered as a split stat strip. */
  metrics: DealMetric[];
  /** Biz Dev sequence progress — 4-segment bar. */
  seq?: number | null;
  seqName?: string | null;
  seqStep?: string | null;
  next: NextAction | null;
  /** Primary CTA label. */
  act: DealAction;
  /** Show the Call / Text / Visit quick-log row. */
  quick: boolean;
  /** WOW OS estimate id → "Linked in WOW OS · EST-40218" footer. */
  osRef?: string | null;
  /** Biz Dev: "Cold call · Jul 28" — replaces `stale` in the card footer. */
  initialType?: string | null;
  /** Residential Result only. */
  resultOutcome?: ResultOutcome | null;
  /** Residential Result, parked: when to retry. */
  retryAt?: string | null;
  accountId?: string | null;
  /** Set on entry to a `lost` stage. The revival trigger keys off both. */
  lostReason?: LostReason | null;
  lostAt?: Date | null;
  /**
   * When a paused deal becomes actionable again. Replaces the neglect rule for
   * `paused` stages — a deal parked on purpose is not neglected, but it does
   * come due.
   */
  revisitDate?: Date | null;
  /**
   * The job that produced this lead — a neighbour who asked about their trim
   * while we were painting next door. Makes "this $8,400 job generated three
   * leads worth $14K" a query rather than a guess.
   */
  sourcedFromDealId?: string | null;
}

/**
 * Where a lead came from. Grouped by how the demand was created, because the
 * Manager dashboard attributes revenue by source and a franchise owner decides
 * spend per channel — so "Facebook Ads" and "Landing Page" have to be separate
 * even though both arrive as a web enquiry.
 */
export type LeadSource =
  // Existing relationships
  | "Past Customer"
  | "Partner Referral"
  | "GC Referral"
  // Paid digital
  | "Facebook Ads"
  | "Instagram Ads"
  | "Google Ads"
  | "Google LSA"
  | "Landing Page"
  // Marketplaces and listings
  | "Angi"
  | "Thumbtack"
  | "Nextdoor"
  | "Yelp"
  // Owned inbound
  | "Web Form"
  | "Phone Enquiry"
  // Local-area marketing, out in the world
  | "Yard Sign"
  | "Truck Wrap"
  | "Door Hanger"
  | "Canvassing"
  | "Job Site"
  | "Neighbor Letter"
  | "Direct Mail"
  // Events
  | "Trade Show"
  | "Home Show"
  // Outbound
  | "Cold Call";

/** Source groupings, used by the New Leads source filter. */
export type LeadSourceGroup =
  | "Paid digital"
  | "Marketplaces"
  | "Owned inbound"
  | "Local area"
  | "Events"
  | "Relationships"
  | "Outbound";

export type DealAction =
  | "Review draft"
  | "Log Call"
  | "Send Text"
  | "Log Visit"
  | "View in Funnel";

/* -------------------------------------------------------------------------
   Accounts, contacts, touchpoints
   ------------------------------------------------------------------------- */

export type ContactChannel = "SMS" | "EMAIL" | "PHONE";

export interface Contact {
  id: string;
  accountId: string;
  initials: string;
  name: string;
  role: string;
  prefers: ContactChannel;
  contact: string;
  notes: string;
  primary: boolean;
}

export interface AccountDetail {
  label: string;
  value: string;
}

export interface Account {
  id: string;
  name: string;
  tags: string[];
  /** Property/site details as label/value pairs — labels come from config. */
  details: AccountDetail[];
  /** Gate codes, dogs, parking. Rendered in the amber block. */
  accessNotes: string;
}

export type TouchpointChannel =
  | "SMS"
  | "EMAIL"
  | "CALL"
  | "VISIT"
  | "NOTE"
  | "TRIGGER"
  | "JOB"
  | "SOURCE";

export interface Touchpoint {
  id: string;
  dealId: string;
  accountId: string | null;
  channel: TouchpointChannel;
  body: string;
  /** Display string for who did it. */
  who: string;
  /** true when an agent, not a person, performed it. */
  byAgent: boolean;
  initials: string;
  occurredAt: Date;
}

/* -------------------------------------------------------------------------
   Triggers and approvals
   ------------------------------------------------------------------------- */

/**
 * `speed_to_lead` is the odd one out and deliberately so: it is the only
 * trigger that does not draft anything for a customer. See
 * `lib/triggers/speed-to-lead.ts` for why it never reaches the Approvals
 * queue.
 */
export type TriggerType =
  | "eleven_month"
  | "seasonal"
  | "revival"
  | "sequence"
  | "speed_to_lead"
  | "neighbour_campaign"
  | "never_quoted";

export type ApprovalStatus =
  | "drafted"
  | "approved"
  | "edited"
  | "sent"
  | "skipped";

export interface Approval {
  id: string;
  dealId: string;
  /**
   * Null when this is a campaign step rather than a trigger draft. Exactly one
   * of `triggerType` and `campaignId` is set — a queue row is a message
   * somebody is waiting to review, and it came from one source or the other.
   */
  triggerType: TriggerType | null;
  campaignId: string | null;
  campaignStepId: string | null;
  title: string;
  subtitle: string;
  /** "TRIGGER FIRED TODAY" | "SEQUENCE STEP" */
  chip: string;
  /** "SMS · she prefers text" | "EMAIL" */
  channel: string;
  recipient: string;
  body: string;
  /** The WHY THIS FIRED bullets — derived from record facts, never invented. */
  reasons: string[];
  footnote: string;
  status: ApprovalStatus;
  createdAt: Date;
}

/* -------------------------------------------------------------------------
   Audit
   ------------------------------------------------------------------------- */

export interface AuditEvent {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  userId: string | null;
  agentId: string | null;
  before: unknown;
  after: unknown;
  createdAt: Date;
}

/* -------------------------------------------------------------------------
   Users, booking
   ------------------------------------------------------------------------- */

export type UserRole = "manager" | "rep" | "estimator";

export interface User {
  id: string;
  name: string;
  initials: string;
  role: UserRole;
  locationId: string;
}

export interface Estimator {
  initials: string;
  name: string;
  load: string;
}

export interface BookingDay {
  dow: string;
  date: string;
}

/* -------------------------------------------------------------------------
   View models
   ------------------------------------------------------------------------- */

export type BoardView = "board" | "list";

export type ListSortKey =
  | "name"
  | "track"
  | "stage"
  | "next"
  | "owner"
  | "stale";

export interface ListSort {
  key: ListSortKey;
  dir: 1 | -1;
}

/** Per-user persisted board preferences. */
export interface BoardPrefs {
  /** Keyed `pipeline:stage` → collapsed. */
  collapsedCols: Record<string, boolean>;
  listSort: ListSort;
}
