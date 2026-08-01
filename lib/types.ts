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
  | "result";
export type CommStageId =
  | "prospect"
  | "invited"
  | "takeoff"
  | "submitted"
  | "negotiation"
  | "hold";
export type BizdevStageId = "initial" | "followup" | "meeting";
export type PartnerStageId = "identified" | "introduced" | "active" | "dormant";
/** Net-new demand. Speed is the whole game, hence the short ladder. */
export type NewLeadStageId =
  | "new"
  | "contacted"
  | "qualified"
  | "booked"
  | "nurture";

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

export interface StageConfig {
  id: StageId;
  label: string;
  hint: string;
  /** Positive/active stages get a green column border. */
  positive?: boolean;
  /** Overrides the default column-title colour (On-Hold amber, Dormant dusty). */
  titleColor?: string;
}

/**
 * Rail grouping. Re-marketing and New Leads are both residential — one works
 * people we've already served, the other people we haven't — so they sit
 * together under one heading rather than as peers of the commercial pipelines.
 */
export type PipelineCategory = "RESIDENTIAL LEADS" | "COMMERCIAL";

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

/** Residential Result stage resolves to one of these. See DECISIONS.md #2. */
export type ResultOutcome = "booked" | "parked";

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
  triggerType: TriggerType;
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
