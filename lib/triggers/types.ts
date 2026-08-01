import type { ContactChannel, TriggerType } from "@/lib/types";

/**
 * Trigger facts and evaluation contract.
 *
 * A *fact* is something the record actually knows: a completion date, a promo
 * window, a logged loss reason, a sequence position. The predicates read only
 * facts, and every WHY THIS FIRED bullet they emit is a rendering of a fact
 * they read. Nothing in this layer invents prose — a human is about to trust
 * those bullets and approve a real send on the strength of them.
 *
 * Predicates are pure and total: no clock, no database, no throwing. `now` is
 * always passed in.
 */

export interface TriggerEvaluation {
  eligible: boolean;
  /**
   * When eligible: the WHY THIS FIRED bullets, in display order.
   * When not: the conditions that blocked the fire, same shape, so a
   * dry run can explain itself.
   */
  reasons: string[];
}

/** A prior job or scope area named on the record. */
export interface ScopeFacts {
  /** "Interior repaint" — how the completed work is described on the record. */
  summary: string;
  /** "interior" — the work-type tag, for mid-sentence use. */
  workType: string;
  /** Named areas from the original scope: ["hallway", "stairwell"]. */
  areas: string[];
  /** Displayed job value, e.g. "$8,400". Null when the record has none. */
  value: string | null;
}

/** Observed reply behaviour, used only to justify the channel choice. */
export interface ReplyFacts {
  /** How many replies the recent history contains. */
  count: number;
  /** Median minutes to reply across those, or null when there are none. */
  medianMinutes: number | null;
  /**
   * A response habit a rep recorded on the contact, quoted verbatim
   * ("replies within the hour"). Preferred over the computed figure because
   * a human wrote it down about a person they have spoken to.
   */
  note: string | null;
}

export interface ContactFacts {
  name: string;
  /** First name, for the greeting. Derived by the fact source, not guessed. */
  firstName: string;
  prefers: ContactChannel;
  /** Phone or email as recorded — the recipient line on the approval card. */
  address: string;
  /**
   * Only ever read off the record — never guessed from a name, because a
   * wrong guess misgenders a real customer in a message they will read.
   * Null means the copy stays neutral ("they").
   */
  pronoun: "she" | "he" | "they" | null;
}

/* -------------------------------------------------------------------------
   Per-trigger fact shapes
   ------------------------------------------------------------------------- */

export interface ElevenMonthFacts {
  kind: "eleven_month";
  dealId: string;
  dealName: string;
  contact: ContactFacts;
  /** When the job was completed. Null means the record cannot support this trigger. */
  jobCompletedAt: Date | null;
  /** The touchpoint that closed the job out. Contact *after* this disqualifies. */
  completionFollowUpAt: Date | null;
  /** Most recent touchpoint of any kind. */
  lastContactAt: Date | null;
  scope: ScopeFacts;
  replies: ReplyFacts;
  now: Date;
}

export interface SeasonalFacts {
  kind: "seasonal";
  dealId: string;
  dealName: string;
  contact: ContactFacts;
  /** "15% spring interior" — the promo as authored. */
  promoLabel: string;
  /** Short form for the copy: "spring interior". */
  promoShortLabel: string;
  promoSentAt: Date | null;
  promoExpiresAt: Date | null;
  /** Promo window opened — a promo not yet live must not be chased. */
  promoStartsAt: Date | null;
  promoActive: boolean;
  /** Did the recipient reply to the promo send? */
  replied: boolean;
  /** Did the recipient open it? Distinguishes "no open or reply" from "no reply". */
  opened: boolean;
  /** Prior job facts worth naming in the copy: ["interior", "low-VOC preference on file"]. */
  priorJobNotes: string[];
  /** Areas from the prior job the offer covers. */
  scopeAreas: string[];
  /** When the prior job happened, as a person would say it: "last year". */
  priorJobPhrase: string | null;
  /** Follow-ups already sent on this offer. The send itself is not a chase. */
  chasesSent: number;
  /** Where the deal parks if this chase goes unanswered: "spring 2027". */
  parkRetryLabel: string | null;
  now: Date;
}

export interface RevivalFacts {
  kind: "revival";
  dealId: string;
  dealName: string;
  contact: ContactFacts;
  /** When the deal was recorded as lost. */
  lostAt: Date | null;
  /** The recorded objection: "Price", "Timing", … */
  lostReason: string | null;
  /** The quote they walked away from, as displayed: "$5,600". */
  originalValue: string | null;
  /** "exterior repaint" — the scope that is still open. */
  originalScope: string;
  /** Most recent touchpoint of any kind. */
  lastContactAt: Date | null;
  now: Date;
}

export interface SequenceReference {
  /** The adjacent account we can name as proof. */
  name: string;
  /** "GC", "property manager" — how they relate to this prospect. */
  relation: string;
  /** "two Vantage Construction sites in NE this spring" — the provable claim. */
  proof: string;
}

export interface SequenceFacts {
  kind: "sequence";
  dealId: string;
  dealName: string;
  contact: ContactFacts;
  sequenceName: string;
  /** 1-based. */
  stepNumber: number;
  totalSteps: number;
  /** "Intro email", "Day 3 phone call". */
  stepLabel: string;
  stepChannel: ContactChannel;
  /** Days after the previous step this one is due. */
  delayDays: number;
  /**
   * Which day of the sequence this step lands on, 1-based — the cumulative
   * sum of every earlier step's `delayDays`, plus one. Step 1 is day 1.
   */
  dayInSequence: number;
  /** Labels of the steps that follow, for the footnote's "generates next". */
  upcomingStepLabels: string[];
  /** When the previous step ran. Null on step 1 — `sequenceStartedAt` governs. */
  previousStepAt: Date | null;
  sequenceStartedAt: Date | null;
  /** True once the last step has run or the prospect converted. */
  completed: boolean;
  /** Account tags — "GENERAL CONTRACTOR" etc. */
  accountTags: string[];
  /** Tags that mark a best-fit account. */
  bestFitTags: string[];
  /** The account the prospect belongs to: "Northgate Development". */
  accountName: string;
  /** How a person would say it mid-sentence: "Northgate". */
  accountShortName: string;
  /** "exterior" — the work type this prospect is a fit for. */
  workType: string;
  /** A named project of theirs worth referencing, e.g. "the Rhode Island Ave project". */
  projectHint: string | null;
  reference: SequenceReference | null;
  now: Date;
}

/* -------------------------------------------------------------------------
   New Leads
   ------------------------------------------------------------------------- */

/** How badly a fresh lead is past its speed-to-lead SLA. */
export type SpeedToLeadSeverity = "on_track" | "warn" | "breach";

export interface SpeedToLeadFacts {
  kind: "speed_to_lead";
  dealId: string;
  dealName: string;
  contact: ContactFacts;
  /** When the lead came in. Null means the record cannot support this trigger. */
  arrivedAt: Date | null;
  /** First time a person tried to reach them. Null = still unworked. */
  firstContactAt: Date | null;
  /** Must still be sitting in the `new` stage. */
  stageId: string;
  /** "Facebook Ads", "Door Hanger", … */
  source: string;
  /** Paid demand — the cost per lead is already spent, so silence is waste. */
  paid: boolean;
  /** Who is on the hook. */
  ownerName: string;
  ownerUserId: string | null;
  now: Date;
}

export interface NeighbourCampaignFacts {
  kind: "neighbour_campaign";
  /** The completed job this outreach is justified by. */
  dealId: string;
  dealName: string;
  contact: ContactFacts;
  /** "2308 Tunlaw Rd NW" — the job we can point at. */
  jobAddress: string;
  jobCompletedAt: Date | null;
  scope: ScopeFacts;
  /** "Kris Jolin crew". Null when the record does not name one. */
  crewName: string | null;
  /** How long the crew is still in the street. Null when unknown. */
  crewOnSiteUntil: Date | null;
  /** The single address this draft is for — one approval per neighbour. */
  neighbourAddress: string;
  /** The `canvass_targets` row, so the runner can advance its status. */
  canvassTargetId: string;
  /** "two doors down", only if the canvass list records it. */
  proximity: string | null;
  /** True when this address is already a lead or a customer. */
  alreadyKnown: boolean;
  now: Date;
}

/**
 * How an enquiry reached us. The opener depends on it: you cannot say "we met"
 * to someone who filled in a form, and "you asked about" is wrong for someone
 * whose hand you shook at a stand.
 */
export type EnquiryChannel = "web" | "event" | "phone" | "unknown";

export interface NeverQuotedFacts {
  kind: "never_quoted";
  dealId: string;
  dealName: string;
  contact: ContactFacts;
  /**
   * When they got in touch. Frequently null — plenty of records carry the
   * channel but never captured a date ("ENQUIRED: Home show"), and a draft
   * must not invent one.
   */
  enquiredAt: Date | null;
  enquiryChannel: EnquiryChannel;
  /** "Home show", "Landing Page" — the source as recorded, for the reasons. */
  sourceLabel: string;
  /**
   * What they asked about, if it was captured. On a never-quoted record the
   * work-type tag can only have come from the enquiry itself — there is no
   * job it could describe instead.
   */
  enquiredAbout: string | null;
  /** Days the record has sat without anybody working it. */
  unworkedDays: number | null;
  /** Guard: the moment a quote exists this is not a never-quoted lead. */
  everQuoted: boolean;
  now: Date;
}

export type TriggerFacts =
  | ElevenMonthFacts
  | SeasonalFacts
  | RevivalFacts
  | SequenceFacts
  | SpeedToLeadFacts
  | NeighbourCampaignFacts
  | NeverQuotedFacts;

/**
 * What firing a trigger produces.
 *
 * `draft` puts a message in the Approvals queue, where a human decides
 * whether it reaches a customer. `escalate` writes an internal alert — a
 * touchpoint, an audit event and an urgent next action — and never touches
 * the queue.
 *
 * This is a discriminator rather than a comment because the guarantee the
 * Approvals screen makes ("nothing sends until you approve it") is only worth
 * anything if the queue contains *exclusively* things that would send. An
 * internal nudge that was never going to reach a customer dilutes that
 * promise, so the runner branches on this field and cannot route an
 * escalation into the approvals table by accident.
 */
export type TriggerOutcome = "draft" | "escalate";

/**
 * A trigger module: the pure predicate plus the metadata the drafting and
 * approval layers need. Runners live separately so this stays DB-free.
 */
export interface TriggerDefinition<F extends TriggerFacts> {
  type: TriggerType;
  label: string;
  /** Which agent owns drafts from this trigger. */
  agentId: AgentId;
  outcome: TriggerOutcome;
  evaluate: (facts: F) => TriggerEvaluation;
  /** Card title: "11-Month Touchpoint · Delia Marchetti". */
  title: (facts: F) => string;
  /** Card subtitle — the record facts behind the title. */
  subtitle: (facts: F) => string;
  /** Standing note under the reasoning bullets. */
  footnote: (facts: F) => string;
}

export type AgentId = "agent-remarketing" | "agent-prospecting";

export const AGENT_NAMES: Record<AgentId, string> = {
  "agent-remarketing": "Re-marketing agent",
  "agent-prospecting": "Prospecting agent",
};

/** Same-day trigger vs. a scheduled sequence step — drives the card chip. */
export const CHIP_TRIGGER = "TRIGGER FIRED TODAY";
export const CHIP_SEQUENCE = "SEQUENCE STEP";
