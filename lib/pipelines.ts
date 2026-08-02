/**
 * Pipeline, stage, track and tag configuration — **data, not code**.
 *
 * These objects are the seed source for the `pipelines` and `stages` tables.
 * At runtime the UI reads stages from the database (order is an integer
 * column, so stages are reconfigurable without a deploy); this file is the
 * canonical starting state and the fallback used by pure functions and tests.
 */

import type {
  Estimator,
  SemanticType,
  LeadSource,
  LeadSourceGroup,
  PipelineConfig,
  PipelineId,
  TagStyle,
  TrackFilterId,
  TrackId,
  TrackStyle,
  BookingDay,
} from "./types";

export const PIPELINE_IDS: PipelineId[] = [
  "resi",
  "comm",
  "bizdev",
  "partner",
  "newleads",
];

const RESI_TRACKS: { id: TrackFilterId; label: string }[] = [
  { id: "all", label: "All tracks" },
  { id: "referral", label: "Referral" },
  { id: "repeat", label: "Repeat work" },
  { id: "revival", label: "Revival" },
  { id: "neverquoted", label: "Never quoted" },
];

// New Leads deliberately has no track control — the source is a card metric
// and the dropdown filters it. The `inbound | canvassed | event` chip styles
// stay in TRACK_STYLE for the AUTOMATED fallback and any future use.

export const PIPES: Record<PipelineId, PipelineConfig> = {
  resi: {
    id: "resi",
    label: "Re-marketing",
    category: "RESIDENTIAL LEADS",
    meta: "Fast · past customers & revival",
    dot: "#7ed321",
    title: "Residential Re-marketing",
    sub: "Referral, repeat-work and revival tracks — the highest-margin pipeline we already own.",
    filter: "All tracks · All sources",
    tracks: true,
    trackOptions: RESI_TRACKS,
    showStageValue: false,
    neglectDays: 14,
    stages: [
      // Renamed from "Past Customer": the never-quoted track puts people here
      // who have contact details and no job, so the old label was false for
      // half the column. The hint already said the truer thing.
      {
        id: "past",
        label: "Eligible",
        hint: "Contact on file, not yet approached",
        semanticType: "open",
        isDefault: true,
        locked: true,
      },
      {
        id: "first",
        label: "Followed Up",
        hint: "First ask made",
        semanticType: "open",
      },
      {
        id: "second",
        label: "2nd Follow-up",
        hint: "Second touch, no answer yet",
        semanticType: "open",
      },
      {
        id: "promo",
        label: "Promo Offered",
        hint: "Offer on the table",
        semanticType: "open",
      },
      {
        id: "followed",
        label: "Promo Followed Up",
        hint: "Chasing the offer",
        semanticType: "positive",
      },
      {
        // Renamed from "Result", id deliberately unchanged: a rename must not
        // move history, and both seeded deals live here. Booked and parked are
        // dispositions *within* this win, not outcomes of their own.
        id: "result",
        label: "Won",
        hint: "Estimate booked, or a committed retry date",
        semanticType: "won",
        locked: true,
      },
      {
        id: "resi-lost",
        label: "Lost",
        hint: "Closed out — reason required",
        semanticType: "lost",
        locked: true,
      },
    ],
  },
  comm: {
    id: "comm",
    label: "Commercial Bid",
    category: "COMMERCIAL",
    meta: "Slow · GC, PM, HOA",
    dot: "#7fb2e0",
    title: "Commercial Bid",
    sub: "Long-cycle bids. On-Hold is a real state, not a failure.",
    filter: "All accounts · All tags",
    tracks: false,
    trackOptions: [],
    showStageValue: true,
    // Commercial cycles run months, not weeks. See DECISIONS.md #3.
    neglectDays: 45,
    stages: [
      {
        id: "prospect",
        label: "Prospecting",
        hint: "Outreach to the account",
        semanticType: "open",
        isDefault: true,
        locked: true,
        showValueRoll: true,
      },
      {
        id: "invited",
        label: "Bid Invited",
        hint: "They asked us to bid",
        semanticType: "open",
        showValueRoll: true,
      },
      {
        id: "takeoff",
        label: "Plan Review / Takeoff",
        hint: "Measuring and pricing",
        semanticType: "open",
        showValueRoll: true,
      },
      {
        id: "submitted",
        label: "Bid Submitted",
        hint: "Awaiting decision",
        semanticType: "open",
        showValueRoll: true,
      },
      {
        id: "negotiation",
        label: "Negotiation",
        hint: "Scope and price moving",
        semanticType: "positive",
        showValueRoll: true,
      },
      {
        // No longer the terminal column. A paused bid is alive and parked on
        // purpose, which is why it is excluded from neglect and carries a
        // revisit date instead. Addendum §2.2.
        id: "hold",
        label: "On-Hold",
        hint: "Alive, paused — revisit date set",
        semanticType: "paused",
        showValueRoll: true,
      },
      {
        id: "comm-won",
        label: "Won",
        hint: "Bid accepted",
        semanticType: "won",
        locked: true,
        showValueRoll: true,
      },
      {
        id: "comm-lost",
        label: "Lost",
        hint: "Closed out — reason required",
        semanticType: "lost",
        locked: true,
      },
    ],
  },
  bizdev: {
    id: "bizdev",
    label: "Biz Dev / Prospecting",
    category: "COMMERCIAL",
    meta: "Pre-sales · sequences",
    dot: "#b19ad6",
    title: "Biz Dev / Prospecting",
    sub: "Multi-touch sequences generate the tasks. Hands off to Commercial or Residential at first meeting.",
    filter: "All industries · All reps",
    tracks: false,
    trackOptions: [],
    showStageValue: false,
    neglectDays: 14,
    stages: [
      {
        id: "initial",
        label: "Initial Contact Made",
        hint: "Type and date on every card",
        semanticType: "open",
        isDefault: true,
        locked: true,
      },
      {
        id: "followup",
        label: "Follow-up In Progress",
        hint: "Sequence running",
        semanticType: "open",
      },
      {
        // The hand-off *is* the win for prospecting: the deal continues its
        // life in Commercial or Residential, and this pipeline's job is done.
        id: "meeting",
        label: "First Meeting",
        hint: "Hands to Commercial or Residential",
        semanticType: "won",
        locked: true,
      },
      {
        id: "bizdev-lost",
        label: "Lost",
        hint: "Sequence exhausted — reason required",
        semanticType: "lost",
        locked: true,
      },
    ],
  },
  partner: {
    id: "partner",
    label: "Industry Partner",
    category: "COMMERCIAL",
    meta: "Relationship · referrers",
    dot: "#e0a52b",
    title: "Industry Partner network",
    sub: "Not a deal pipeline — a relationship one. The scoreboard is referrals sent and revenue attributed.",
    filter: "All partner types",
    tracks: false,
    trackOptions: [],
    showStageValue: false,
    neglectDays: 14,
    stages: [
      {
        id: "identified",
        label: "Identified",
        hint: "Worth a relationship",
        semanticType: "open",
        isDefault: true,
        locked: true,
      },
      {
        id: "introduced",
        label: "Introduced",
        hint: "Terms being agreed",
        semanticType: "open",
      },
      {
        // A partner who sends work is the success state for a relationship
        // pipeline. It stays live rather than closing, but for roll-up
        // purposes it is the win.
        id: "active",
        label: "Active Referrer",
        hint: "Sending us work",
        semanticType: "won",
        locked: true,
      },
      {
        // Paused, not lost: a quiet partner is revivable, which is the whole
        // point of tracking them. The revisit date drives the nudge.
        id: "dormant",
        label: "Dormant",
        hint: "No referral in 90+ days — revisit date set",
        semanticType: "paused",
      },
      {
        id: "partner-lost",
        label: "Declined",
        hint: "Won't refer — reason required",
        semanticType: "lost",
        locked: true,
      },
    ],
  },
  newleads: {
    id: "newleads",
    label: "New Leads",
    category: "RESIDENTIAL LEADS",
    meta: "Net-new · ads, canvassing, job sites",
    dot: "#e0673f",
    title: "New Leads",
    sub: "Net-new residential enquiries — ads, canvassing and job-site walk-ups. Speed to first contact is the whole game.",
    filter: "All sources · All reps",
    // No track chips here: the source is surfaced as a card metric instead,
    // and the dropdown filters it. NEW_LEAD_TRACKS stays defined for the chip
    // styles the seed still uses.
    tracks: false,
    trackOptions: [],
    showStageValue: false,
    // A fresh paid lead going cold overnight is a catastrophe, not a warning.
    // Every other pipeline measures neglect in weeks; this one measures it in
    // a day. See DECISIONS.md.
    neglectDays: 1,
    stages: [
      {
        id: "new",
        label: "New / Untouched",
        hint: "Clock is running",
        semanticType: "open",
        isDefault: true,
        locked: true,
      },
      {
        id: "contacted",
        label: "Contacted",
        hint: "First attempt made",
        semanticType: "open",
      },
      {
        id: "qualified",
        label: "Qualified",
        hint: "Real job, real budget",
        semanticType: "positive",
      },
      {
        // Booking the estimate is the win for a lead pipeline — the deal
        // continues in the Funnel.
        id: "booked",
        label: "Estimate Booked",
        hint: "Handed to the Funnel",
        semanticType: "won",
        locked: true,
      },
      {
        id: "nurture",
        label: "Nurture",
        hint: "Not now — parked with a retry date",
        semanticType: "paused",
      },
      {
        id: "newleads-lost",
        label: "Lost",
        hint: "Closed out — reason required",
        semanticType: "lost",
        locked: true,
      },
    ],
  },
};

/**
 * @deprecated Read `PIPES[pipe].trackOptions` instead — track sets are
 * per-pipeline now that New Leads has its own. Kept as the Residential set so
 * existing callers keep working.
 */
export const TRACKS = RESI_TRACKS;

/**
 * Track chips reuse the existing accent vocabulary rather than inventing one:
 * green is active work we own, amber is paused-not-dead, blue is demand that
 * arrived from outside, and the muted violet matches the Biz Dev dot for the
 * one track that comes out of an event rather than a place.
 */
export const TRACK_STYLE: Record<TrackId, TrackStyle> = {
  referral: {
    bg: "#101a0b",
    color: "#a8ea6b",
    border: "#2f6b1f",
    label: "REFERRAL",
  },
  repeat: {
    bg: "#101a0b",
    color: "#a8ea6b",
    border: "#2f6b1f",
    label: "REPEAT WORK",
  },
  revival: {
    bg: "#2b2413",
    color: "#d8b45e",
    border: "#4a3a17",
    label: "REVIVAL",
  },
  // Deliberately the quietest chip on the board. Green is active work we own,
  // amber is paused-not-dead; this is the least-proven population in the
  // pipeline and the colour should not overstate it.
  neverquoted: {
    bg: "#23271f",
    color: "#98a298",
    border: "#3b423a",
    label: "NEVER QUOTED",
  },
  inbound: {
    bg: "#16283a",
    color: "#7fb2e0",
    border: "#24455f",
    label: "INBOUND",
  },
  canvassed: {
    bg: "#101a0b",
    color: "#a8ea6b",
    border: "#2f6b1f",
    label: "CANVASSED",
  },
  event: {
    bg: "#1e1a2b",
    color: "#b19ad6",
    border: "#3a3154",
    label: "EVENT",
  },
};

/** Cards with no track but a pending AI draft show this chip instead. */
export const AUTOMATED_TRACK_STYLE: TrackStyle = {
  bg: "#101a0b",
  color: "#a8ea6b",
  border: "#2f6b1f",
  label: "AUTOMATED",
};

export const TAG_STYLE: Record<string, TagStyle> = {
  "GENERAL CONTRACTOR": { bg: "#16283a", color: "#7fb2e0" },
  "PROPERTY MANAGER": { bg: "#16283a", color: "#7fb2e0" },
  "HOA BOARD": { bg: "#16283a", color: "#7fb2e0" },
  "FACILITY MANAGER": { bg: "#16283a", color: "#7fb2e0" },
  "DIRECT HOMEOWNER": { bg: "#23271f", color: "#98a298" },
  "INDUSTRY PARTNER": { bg: "#2b2413", color: "#d8b45e" },
  INTERIOR: { bg: "#1e2519", color: "#9dbd80" },
  EXTERIOR: { bg: "#1e2519", color: "#9dbd80" },
  INDUSTRIAL: { bg: "#1e2519", color: "#9dbd80" },
};

export const DEFAULT_TAG_STYLE: TagStyle = { bg: "#23271f", color: "#98a298" };

export function tagStyle(tag: string): TagStyle {
  return TAG_STYLE[tag] ?? DEFAULT_TAG_STYLE;
}

/* -------------------------------------------------------------------------
   Booking fixtures
   ------------------------------------------------------------------------- */

export const ESTIMATORS: Estimator[] = [
  { initials: "KJ", name: "Kris Jolin", load: "3 estimates that day" },
  { initials: "GS", name: "Granville Smith", load: "1 estimate that day" },
  { initials: "CM", name: "Craig Merrills", load: "5 estimates that day" },
];

export const DAYS: BookingDay[] = [
  { dow: "Wed", date: "Aug 5" },
  { dow: "Thu", date: "Aug 6" },
  { dow: "Fri", date: "Aug 7" },
  { dow: "Mon", date: "Aug 10" },
];

export const TIMES = ["8:30 AM", "10:00 AM", "1:00 PM", "3:30 PM"];

/* -------------------------------------------------------------------------
   Derived helpers — pure, unit-tested
   ------------------------------------------------------------------------- */

export function stagesFor(pipe: PipelineId): PipelineConfig["stages"] {
  return PIPES[pipe].stages;
}

export function stageIds(pipe: PipelineId): string[] {
  return PIPES[pipe].stages.map((s) => s.id);
}

/** Index of a stage within its pipeline, or 99 when unknown. */
export function stageIndex(pipe: PipelineId, stage: string): number {
  const i = PIPES[pipe].stages.findIndex((s) => s.id === stage);
  return i === -1 ? 99 : i;
}

export function stageLabel(pipe: PipelineId, stage: string): string {
  return PIPES[pipe].stages.find((s) => s.id === stage)?.label ?? "—";
}

/** A deal may only move to a stage of its own pipeline. */
export function isValidStageForPipeline(
  pipe: PipelineId,
  stage: string,
): boolean {
  return PIPES[pipe].stages.some((s) => s.id === stage);
}

/** Which pipeline owns a stage id. Stage ids are unique across pipelines. */
export function pipelineForStage(stage: string): PipelineId | null {
  for (const id of PIPELINE_IDS) {
    if (isValidStageForPipeline(id, stage)) return id;
  }
  return null;
}

/* -------------------------------------------------------------------------
   Semantics → presentation and reporting

   Nothing below keys off a stage id or label. That is the whole point: a
   franchise inventing "Awaiting Permit" tags it `paused` and every dashboard,
   alert and border keeps working. Addendum §3.2.
   ------------------------------------------------------------------------- */

/** No new ramps — amber is the existing paused tone, dusty the existing lost. */
export const SEMANTIC_STYLE: Record<
  SemanticType,
  { border: string; title: string; label: string }
> = {
  open: { border: "#1f231e", title: "#e9ede9", label: "Open" },
  positive: { border: "#2f6b1f", title: "#e9ede9", label: "Late stage" },
  paused: { border: "#4a3a17", title: "#d8b45e", label: "Paused" },
  won: { border: "#4b9c2d", title: "#b6f07a", label: "Won" },
  lost: { border: "#5c2620", title: "#c9a29a", label: "Lost" },
};

export function columnBorder(
  stage: { semanticType: SemanticType; accent?: string },
  isOver: boolean,
): string {
  if (isOver) return "#4b9c2d";
  return stage.accent ?? SEMANTIC_STYLE[stage.semanticType].border;
}

export function columnTitleColor(stage: {
  semanticType: SemanticType;
}): string {
  return SEMANTIC_STYLE[stage.semanticType].title;
}

/* -------------------------------------------------------------------------
   Neglect
   ------------------------------------------------------------------------- */

/** Used when neither the stage nor the pipeline sets one. */
export const DEFAULT_NEGLECT_DAYS = 14;

/**
 * Whether a stage participates in neglect at all.
 *
 * `paused` is excluded because a deal parked on purpose is not neglected —
 * a Commercial bid on hold with a revisit date six months out was tripping the
 * 45-day rule while sitting exactly where somebody deliberately put it. That
 * is a false positive by design, and it is the failure mode that trains people
 * to ignore the alert. `won` and `lost` are excluded as closed.
 *
 * A paused deal still comes due — `revisitDate` replaces the rule, surfaced as
 * its own "revisit due" signal rather than as neglect.
 */
export function stageCountsForNeglect(stage: {
  semanticType: SemanticType;
}): boolean {
  return stage.semanticType === "open" || stage.semanticType === "positive";
}

/** Most specific wins: stage override → pipeline default → global. */
export function resolveNeglectDays(
  stage: { neglectDays?: number } | undefined,
  pipelineNeglectDays: number | undefined,
): number {
  return stage?.neglectDays ?? pipelineNeglectDays ?? DEFAULT_NEGLECT_DAYS;
}

/* -------------------------------------------------------------------------
   Revisit — what replaces neglect on a paused stage
   ------------------------------------------------------------------------- */

/**
 * Where a paused deal stands against its revisit date.
 *
 * Deliberately **not** folded into neglect, and deliberately a four-state
 * answer rather than a boolean. The two signals mean different things to the
 * person reading the dashboard: neglected is "nobody is looking after this",
 * revisit due is "this was parked on purpose and the date you chose has
 * passed". Collapsing them would re-create the false positive the paused
 * exclusion exists to remove, just with a friendlier label.
 *
 * `no-date` is the state worth knowing about. A paused stage is exempt from
 * neglect, so a deal parked without a revisit date has **no staleness signal
 * at all** — it is the one shape that can sit on a board indefinitely with
 * nothing ever surfacing it. That is not something to silently treat as
 * "fine", so it gets its own value rather than folding into `scheduled`.
 */
export type RevisitState = "not-paused" | "no-date" | "scheduled" | "due";

export function revisitState(
  stage: { semanticType: SemanticType },
  deal: { revisitDate?: Date | null },
  now: Date,
): RevisitState {
  if (stage.semanticType !== "paused") return "not-paused";
  if (!deal.revisitDate) return "no-date";
  return deal.revisitDate.getTime() <= now.getTime() ? "due" : "scheduled";
}

/** The dashboard's "revisit due" list. */
export function isRevisitDue(
  stage: { semanticType: SemanticType },
  deal: { revisitDate?: Date | null },
  now: Date,
): boolean {
  return revisitState(stage, deal, now) === "due";
}

/* -------------------------------------------------------------------------
   Win rate
   ------------------------------------------------------------------------- */

/**
 * Won over decided, by semantic type — never by label, so two markets calling
 * the same stage different things stay comparable. Returns null when nothing
 * has closed, because 0% and "no data yet" are different claims.
 */
export function winRate(
  stages: { id: string; semanticType: SemanticType }[],
  deals: { stage: string }[],
): { won: number; lost: number; rate: number | null } {
  const typeOf = new Map(stages.map((s) => [s.id, s.semanticType]));
  let won = 0;
  let lost = 0;
  for (const d of deals) {
    const t = typeOf.get(d.stage);
    if (t === "won") won += 1;
    else if (t === "lost") lost += 1;
  }
  const decided = won + lost;
  return { won, lost, rate: decided ? won / decided : null };
}

/* -------------------------------------------------------------------------
   Validation — addendum §3.4
   ------------------------------------------------------------------------- */

/**
 * A pipeline must be able to say how things ended. Without one `won` and one
 * `lost` stage the win rate is uncomputable and deals have nowhere to close —
 * which is exactly the gap that let Commercial ship terminating in On-Hold.
 */
export function validatePipelineStages(
  stages: { semanticType: SemanticType; active?: boolean }[],
): string[] {
  const live = stages.filter((s) => s.active !== false);
  const problems: string[] = [];
  if (!live.some((s) => s.semanticType === "won")) {
    problems.push("A pipeline needs at least one Won stage.");
  }
  if (!live.some((s) => s.semanticType === "lost")) {
    problems.push("A pipeline needs at least one Lost stage.");
  }
  return problems;
}

/** Entering a `lost` stage requires a structured reason. Addendum §2.3. */
export function stageRequiresReason(stage: {
  semanticType: SemanticType;
  requiresReason?: boolean;
}): boolean {
  return stage.requiresReason ?? stage.semanticType === "lost";
}

/**
 * Entering a `paused` stage requires a revisit date. Addendum §3.2 — "live on
 * hold (needs revisit date)".
 *
 * The counterpart to `stageRequiresReason`, and it closes the gap the neglect
 * exclusions would otherwise open: paused deals are excluded from neglect, so
 * one without a revisit date produces no signal anywhere and is silently
 * unmonitored.
 */
export function stageRequiresRevisitDate(stage: {
  semanticType: SemanticType;
  requiresRevisitDate?: boolean;
}): boolean {
  return stage.requiresRevisitDate ?? stage.semanticType === "paused";
}

/**
 * `$XXXK in stage` roll-up for Commercial columns: sum of each card's
 * EST. VALUE or BID metric. Returns null when the pipeline doesn't show a
 * total or the column sums to zero.
 */
export function stageValueTotal(
  pipe: PipelineId,
  cards: { metrics: { label: string; value: string }[] }[],
): string | null {
  if (!PIPES[pipe].showStageValue) return null;
  const sum = cards.reduce((acc, d) => {
    const m = d.metrics.find(
      (x) => x.label === "EST. VALUE" || x.label === "BID",
    );
    if (!m) return acc;
    const n = parseFloat(m.value.replace(/[^0-9.]/g, ""));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
  return sum ? `$${Math.round(sum)}K in stage` : null;
}

/* -------------------------------------------------------------------------
   Lead sources
   ------------------------------------------------------------------------- */

/**
 * The source catalogue, grouped the way a franchise owner thinks about spend.
 * The New Leads filter renders these groups; the Manager dashboard attributes
 * revenue against the same values, so a source added here shows up in both
 * without a second edit.
 */
export const LEAD_SOURCE_GROUPS: {
  group: LeadSourceGroup;
  sources: LeadSource[];
}[] = [
  {
    group: "Paid digital",
    sources: [
      "Facebook Ads",
      "Instagram Ads",
      "Google Ads",
      "Google LSA",
      "Landing Page",
    ],
  },
  { group: "Marketplaces", sources: ["Angi", "Thumbtack", "Nextdoor", "Yelp"] },
  { group: "Owned inbound", sources: ["Web Form", "Phone Enquiry"] },
  {
    group: "Local area",
    sources: [
      "Yard Sign",
      "Truck Wrap",
      "Door Hanger",
      "Canvassing",
      "Job Site",
      "Neighbor Letter",
      "Direct Mail",
    ],
  },
  { group: "Events", sources: ["Trade Show", "Home Show"] },
  {
    group: "Relationships",
    sources: ["Past Customer", "Partner Referral", "GC Referral"],
  },
  { group: "Outbound", sources: ["Cold Call"] },
];

export const LEAD_SOURCES: LeadSource[] = LEAD_SOURCE_GROUPS.flatMap(
  (g) => g.sources,
);

/** Which group a source belongs to, for the filter's section headings. */
export function sourceGroup(source: string): LeadSourceGroup | null {
  return (
    LEAD_SOURCE_GROUPS.find((g) => g.sources.includes(source as LeadSource))
      ?.group ?? null
  );
}
