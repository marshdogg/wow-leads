import { relations, sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

/**
 * Schema notes
 * ------------
 * - Pipelines and stages are **rows, not enums**. `stages.sortOrder` is an
 *   integer so stages can be reordered or added without a deploy.
 * - Every write goes through a repository function that also appends an
 *   `auditEvents` row. The Record screen's provenance timeline reads straight
 *   off that table.
 * - Ids are human-readable strings (`r1`, `c3`, `p5`) so the prototype
 *   fixtures survive intact and the seed stays idempotent.
 */

/* -------------------------------------------------------------------------
   Org
   ------------------------------------------------------------------------- */

export const locations = pgTable("locations", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull().default(""),
});

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  initials: text("initials").notNull(),
  /** manager | rep | estimator */
  role: text("role").notNull().default("rep"),
  locationId: text("location_id").references(() => locations.id),
  /** Per-user board preferences: collapsed columns and list sort. */
  boardPrefs: jsonb("board_prefs")
    .$type<{
      collapsedCols: Record<string, boolean>;
      listSort: { key: string; dir: 1 | -1 };
    }>()
    .notNull()
    .default({ collapsedCols: {}, listSort: { key: "next", dir: 1 } }),
});

/* -------------------------------------------------------------------------
   Pipeline configuration — data, not enums
   ------------------------------------------------------------------------- */

export const pipelines = pgTable("pipelines", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  /** Rail grouping and the board eyebrow: RESIDENTIAL LEADS | COMMERCIAL. */
  category: text("category").notNull().default("COMMERCIAL"),
  meta: text("meta").notNull(),
  dot: text("dot").notNull(),
  title: text("title").notNull(),
  sub: text("sub").notNull(),
  filterLabel: text("filter_label").notNull(),
  hasTracks: boolean("has_tracks").notNull().default(false),
  /**
   * The track segmented-control options for this pipeline. Stored rather than
   * read from the TS config so track sets stay reconfigurable without a
   * deploy, the same property stages have.
   */
  trackOptions: jsonb("track_options")
    .$type<{ id: string; label: string }[]>()
    .notNull()
    .default([]),
  showStageValue: boolean("show_stage_value").notNull().default(false),
  /** Days without a touchpoint before a deal is neglected. */
  neglectDays: integer("neglect_days").notNull().default(14),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const stages = pgTable(
  "stages",
  {
    id: text("id").primaryKey(),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    hint: text("hint").notNull().default(""),
    /** Integer order so stages are reconfigurable without a deploy. */
    sortOrder: integer("sort_order").notNull(),
    /**
     * What this stage *means*: open | positive | paused | won | lost.
     *
     * Everything derives from this rather than from an id or a label —
     * styling, win rate, roll-ups and neglect — so a franchise inventing
     * "Awaiting Permit" tags it `paused` and every dashboard keeps working
     * without knowing the name.
     */
    semanticType: text("semantic_type").notNull().default("open"),
    /** Colour override. Null means the semantic type decides. */
    accent: text("accent"),
    /** Show the `$X in stage` roll-up on this column. */
    showValueRoll: boolean("show_value_roll").notNull().default(false),
    /** Force a structured reason on entry. True by default for `lost`. */
    requiresReason: boolean("requires_reason").notNull().default(false),
    /**
     * Force a revisit date on entry. True by default for `paused`, because
     * addendum §3.2 defines paused as "live but on hold (needs revisit date)"
     * and nothing enforced the parenthetical. Excluding paused from neglect
     * without it trades a false positive for a false negative — and a missing
     * alert gets trusted where a noisy one merely gets ignored.
     */
    requiresRevisitDate: boolean("requires_revisit_date")
      .notNull()
      .default(false),
    /** Overrides the pipeline threshold. Most specific wins. */
    neglectDays: integer("neglect_days"),
    /** The landing column for new deals in this pipeline. */
    isDefault: boolean("is_default").notNull().default(false),
    /** Corporate spine: renameable and reorderable, never removable. */
    locked: boolean("locked").notNull().default(false),
    /** Archived stages stay renderable in historical timelines. */
    active: boolean("active").notNull().default(true),

    /** @deprecated Superseded by `semanticType`. Kept until consumers migrate. */
    positive: boolean("positive").notNull().default(false),
    /** @deprecated Superseded by `accent`. */
    titleColor: text("title_color"),
  },
  (t) => [
    index("stages_pipeline_idx").on(t.pipelineId),
    uniqueIndex("stages_pipeline_order_idx").on(t.pipelineId, t.sortOrder),
  ],
);

/* -------------------------------------------------------------------------
   Accounts and contacts
   ------------------------------------------------------------------------- */

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Address, company, or contact line — the card's secondary line. */
  line: text("line").notNull().default(""),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  /** Property/site details as ordered label/value pairs. */
  details: jsonb("details")
    .$type<{ label: string; value: string }[]>()
    .notNull()
    .default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const contacts = pgTable(
  "contacts",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    initials: text("initials").notNull(),
    name: text("name").notNull(),
    role: text("role").notNull().default(""),
    /** SMS | EMAIL | PHONE — drives the channel a trigger drafts for. */
    prefers: text("prefers").notNull().default("EMAIL"),
    contact: text("contact").notNull().default(""),
    notes: text("notes").notNull().default(""),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => [index("contacts_account_idx").on(t.accountId)],
);

/** Gate codes, dogs, parking — the operational detail crews need. */
export const accessNotes = pgTable(
  "access_notes",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    updatedBy: text("updated_by").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("access_notes_account_idx").on(t.accountId)],
);

/* -------------------------------------------------------------------------
   Sequences (Biz Dev multi-touch)
   ------------------------------------------------------------------------- */

export const sequences = pgTable("sequences", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  stepCount: integer("step_count").notNull().default(4),
});

export const sequenceSteps = pgTable(
  "sequence_steps",
  {
    id: text("id").primaryKey(),
    sequenceId: text("sequence_id")
      .notNull()
      .references(() => sequences.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    label: text("label").notNull(),
    /** SMS | EMAIL | CALL | VISIT */
    channel: text("channel").notNull().default("EMAIL"),
    /** Days after the previous step. */
    delayDays: integer("delay_days").notNull().default(3),
  },
  (t) => [
    uniqueIndex("sequence_steps_order_idx").on(t.sequenceId, t.stepNumber),
  ],
);

/* -------------------------------------------------------------------------
   Promos
   ------------------------------------------------------------------------- */

export const promos = pgTable("promos", {
  id: text("id").primaryKey(),
  code: text("code").notNull(),
  /** trade | referral | direct | retention */
  type: text("type").notNull(),
  label: text("label").notNull(),
  /** Percentage or dollar string as displayed ("15%"). */
  discount: text("discount").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }),
  windowEnd: timestamp("window_end", { withTimezone: true }),
  authoredBy: text("authored_by").references(() => users.id),
  active: boolean("active").notNull().default(true),
});

/* -------------------------------------------------------------------------
   Deals
   ------------------------------------------------------------------------- */

export const deals = pgTable(
  "deals",
  {
    id: text("id").primaryKey(),
    pipelineId: text("pipeline_id")
      .notNull()
      .references(() => pipelines.id),
    stageId: text("stage_id")
      .notNull()
      .references(() => stages.id),
    /** Residential only: referral | repeat | revival. */
    track: text("track"),
    name: text("name").notNull(),
    /** Secondary line on the card. Denormalised from the account for speed. */
    accountLine: text("account_line").notNull().default(""),
    accountId: text("account_id").references(() => accounts.id),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    source: text("source").notNull(),

    ownerUserId: text("owner_user_id").references(() => users.id),
    /** Set instead of ownerUserId when an agent owns the card. */
    ownerAgentId: text("owner_agent_id"),
    ownerInitials: text("owner_initials").notNull(),
    ownerName: text("owner_name").notNull(),
    ownerIsAgent: boolean("owner_is_agent").notNull().default(false),

    /** Provenance: "Self-sourced", "Trigger → Dani", … */
    assignedBy: text("assigned_by").notNull().default("Self-sourced"),
    /** An unapproved AI draft exists. */
    aiPending: boolean("ai_pending").notNull().default(false),

    stale: text("stale").notNull().default(""),
    staleWarn: boolean("stale_warn").notNull().default(false),
    /** Real timestamp behind the human `stale` string — drives neglect queries. */
    lastTouchAt: timestamp("last_touch_at", { withTimezone: true }),

    metrics: jsonb("metrics")
      .$type<{ label: string; value: string }[]>()
      .notNull()
      .default([]),

    /** Biz Dev sequence progress. */
    sequenceId: text("sequence_id").references(() => sequences.id),
    seq: integer("seq"),
    seqName: text("seq_name"),
    seqStep: text("seq_step"),

    nextLabel: text("next_label"),
    nextDue: text("next_due"),
    /** ok | overdue. Null `nextLabel` renders the dashed "Not set" state. */
    nextState: text("next_state"),
    nextDueAt: timestamp("next_due_at", { withTimezone: true }),

    /** Primary CTA label. */
    act: text("act").notNull().default("Log Call"),
    quick: boolean("quick").notNull().default(true),

    /** WOW OS estimate id. */
    osRef: text("os_ref"),
    /** Biz Dev: "Cold call · Jul 28". */
    initialType: text("initial_type"),

    /** Residential Won sub-outcome: booked | parked. A disposition, not an outcome. */
    resultOutcome: text("result_outcome"),
    /**
     * Why a deal was lost, and when. Required on entering a `lost` stage —
     * without a structured reason the revival trigger has nothing to select
     * on, and "lost" degrades into a column things disappear into.
     */
    lostReason: text("lost_reason"),
    lostAt: timestamp("lost_at", { withTimezone: true }),
    /**
     * When a paused deal becomes actionable again. Replaces the neglect rule
     * for `paused` stages — parked on purpose is not neglected, but it does
     * come due.
     */
    revisitDate: timestamp("revisit_date", { withTimezone: true }),
    retryAt: text("retry_at"),

    promoId: text("promo_id").references(() => promos.id),

    /**
     * The job that produced this lead — a neighbour who saw the crew working.
     * Self-referencing, so "this $8,400 job generated three leads worth $14K"
     * is a query rather than a guess.
     */
    sourcedFromDealId: text("sourced_from_deal_id").references(
      (): AnyPgColumn => deals.id,
    ),

    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("deals_pipeline_idx").on(t.pipelineId),
    index("deals_stage_idx").on(t.stageId),
    index("deals_account_idx").on(t.accountId),
    index("deals_last_touch_idx").on(t.lastTouchAt),
    index("deals_sourced_from_idx").on(t.sourcedFromDealId),
    /*
     * A loss the code cannot classify must never be treated as a price
     * objection — the consequence of guessing is a discount offer to a real
     * customer. The boundary already rejects an unknown value; this makes it
     * unreachable rather than defended against, the same way the approvals
     * one-source check guards what that column means.
     */
    check(
      "deals_lost_reason_chk",
      sql`lost_reason is null or lost_reason in ('not interested','unqualified','price','timing','competitor','no response','other')`,
    ),
    /*
     * Set together or absent together. A reason with no date, or a date with
     * no reason, is a half-recorded loss: the revival trigger needs both to
     * decide whether the cooling period has passed.
     */
    check(
      "deals_lost_pair_chk",
      sql`(lost_reason is null) = (lost_at is null)`,
    ),
  ],
);

/* -------------------------------------------------------------------------
   Completed jobs
   ------------------------------------------------------------------------- */

/**
 * A completed job, as the WOW OS Funnel reports it.
 *
 * The piece WOW Leads has never had. Job facts on a card are display strings —
 * `LAST JOB $8,400`, `COMPLETED Aug 2025` — which render fine and cannot
 * answer "whose job finished four days ago". A review campaign is a moment
 * timed off the work, so the moment has to be a timestamp.
 *
 * Nothing writes here yet but the seed: the Funnel does not send completions.
 * That is why `hasJobCompletions()` exists and why the Campaigns editor says
 * so rather than offering an audience that would silently select nobody.
 */
export const jobs = pgTable(
  "jobs",
  {
    id: text("id").primaryKey(),
    /**
     * The Funnel's own id for this job, and the key the ingest endpoint
     * conflicts on. Separate from `id` deliberately: our primary keys should
     * not inherit an external system's format, and a retried webhook must
     * update a row rather than produce a second one — a second row here is a
     * second review request to the same customer.
     *
     * Null for anything not delivered by the Funnel.
     */
    wowOsJobId: text("wow_os_job_id"),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    /** The deal it came from, when we know it. */
    dealId: text("deal_id").references((): AnyPgColumn => deals.id),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    /** interior | exterior | industrial */
    workType: text("work_type").notNull(),
    /** "4 rooms, hallway, stairwell" */
    scope: text("scope").notNull().default(""),
    /** Named areas, for templates that reference them. */
    areas: jsonb("areas").$type<string[]>().notNull().default([]),
    /** Cents, so money is never a float. */
    valueCents: integer("value_cents").notNull().default(0),
    crew: text("crew"),
  },
  (t) => [
    index("jobs_account_idx").on(t.accountId),
    index("jobs_completed_idx").on(t.completedAt),
    index("jobs_deal_idx").on(t.dealId),
    uniqueIndex("jobs_wow_os_idx").on(t.wowOsJobId),
  ],
);

/* -------------------------------------------------------------------------
   Campaigns
   ------------------------------------------------------------------------- */

/**
 * Outreach that is not a pipeline: an audience, some steps, a schedule. See
 * `lib/campaigns/types.ts` for why these are not boards.
 */
export const campaigns = pgTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** Open string — a franchise invents "Reviews". */
  category: text("category").notNull().default("RESIDENTIAL LEADS"),
  description: text("description").notNull().default(""),
  /** One of the four parameterised kinds in `AudienceKind`. */
  audienceKind: text("audience_kind").notNull(),
  audienceParams: jsonb("audience_params")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  /** per_message | bulk. Per-message is the default; bulk is opted into. */
  approvalMode: text("approval_mode").notNull().default("per_message"),
  active: boolean("active").notNull().default(false),
  /** Null means once-only. */
  reenrolAfterDays: integer("reenrol_after_days"),
  authoredBy: text("authored_by").references(() => users.id),

  /**
   * Bulk approval, which approves a campaign *version* rather than a run.
   *
   * `approvedHash` covers the audience rule, the steps and the resolved copy.
   * Editing any of them clears all three columns, so the campaign stops
   * sending until somebody approves again — without that, "approve once" is a
   * hole an edit passes through afterwards. Revocation happens in
   * `saveCampaign`, not in the caller, because a gate a caller can forget is
   * not a gate. See DECISIONS.md.
   */
  /**
   * Recipients on the last run, for the volume guard. A campaign approved
   * when a tag matched 50 accounts should not silently send to 5,000 — the
   * guard compares against this and re-asks. Null until a first run.
   */
  lastRunCount: integer("last_run_count"),

  approvedAt: timestamp("approved_at", { withTimezone: true }),
  approvedBy: text("approved_by").references(() => users.id),
  approvedHash: text("approved_hash"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campaignSteps = pgTable(
  "campaign_steps",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    /** Days after the previous step, or after enrolment for step one. */
    delayDays: integer("delay_days").notNull().default(0),
    channel: text("channel").notNull().default("EMAIL"),
    /**
     * Pinned template, or null to resolve by scope at send time. Null is the
     * better default — the copy then follows the Templates screen rather than
     * freezing at the moment the campaign was written.
     */
    templateId: text("template_id").references(() => templates.id, {
      onDelete: "set null",
    }),
    label: text("label").notNull().default(""),
  },
  (t) => [
    index("campaign_steps_campaign_idx").on(t.campaignId),
    uniqueIndex("campaign_steps_order_idx").on(t.campaignId, t.stepNumber),
  ],
);

export const campaignEnrolments = pgTable(
  "campaign_enrolments",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    currentStep: integer("current_step").notNull().default(1),
    /** active | completed | exited */
    state: text("state").notNull().default("active"),
    exitReason: text("exit_reason"),
  },
  (t) => [
    index("campaign_enrolments_campaign_idx").on(t.campaignId),
    index("campaign_enrolments_deal_idx").on(t.dealId),
    index("campaign_enrolments_state_idx").on(t.state),
    // Re-enrolment reuses the row rather than adding one, so `enrolledAt` is
    // always the most recent entry and the re-enrolment guard reads it
    // directly.
    uniqueIndex("campaign_enrolments_once_idx").on(t.campaignId, t.dealId),
  ],
);

/**
 * What has already gone out, and the only thing that makes a run replayable.
 *
 * `enrolments.current_step` cannot express "already done today" — two runs on
 * the same morning would both see step 2 pending and both send it. The unique
 * constraint is the guarantee; the date is what a human reads when asking why
 * somebody got two texts.
 */
export const campaignSends = pgTable(
  "campaign_sends",
  {
    id: text("id").primaryKey(),
    enrolmentId: text("enrolment_id")
      .notNull()
      .references(() => campaignEnrolments.id, { onDelete: "cascade" }),
    stepNumber: integer("step_number").notNull(),
    sentOn: date("sent_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("campaign_sends_date_idx").on(t.sentOn),
    uniqueIndex("campaign_sends_once_idx").on(t.enrolmentId, t.stepNumber),
  ],
);

/* -------------------------------------------------------------------------
   Message templates
   ------------------------------------------------------------------------- */

/**
 * The copy a draft is built from, owned by the franchise rather than the
 * codebase. Mirrors `MessageTemplate` in `lib/templates/types.ts`.
 *
 * Every scope column is nullable and a null means "any", which *widens* the
 * template — so the narrowest matching row wins. The rows we ship carry
 * `is_default`; a franchise editing one forks it into a row of their own
 * rather than mutating ours, so a later release can still improve the shipped
 * copy without silently overwriting somebody's rewrite.
 */
export const templates = pgTable(
  "templates",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    /** SMS | EMAIL | PHONE | ANY */
    channel: text("channel").notNull().default("ANY"),

    triggerType: text("trigger_type"),
    pipelineId: text("pipeline_id").references(() => pipelines.id),
    stageId: text("stage_id").references(() => stages.id),
    track: text("track"),

    /** Email only; ignored for SMS. */
    subject: text("subject"),
    /** The copy, with `{{variable}}` placeholders. */
    body: text("body").notNull(),

    active: boolean("active").notNull().default(true),
    /**
     * Whether the AI drafter may adapt this copy or must send it as written.
     * Off by default: a franchise authors a template because they want *those*
     * words, and the rep approving a draft is not the person who wrote it.
     */
    allowAiAdaptation: boolean("allow_ai_adaptation").notNull().default(false),
    isDefault: boolean("is_default").notNull().default(false),
    authoredBy: text("authored_by").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("templates_scope_idx").on(
      t.triggerType,
      t.pipelineId,
      t.stageId,
      t.track,
    ),
    index("templates_active_idx").on(t.active),
  ],
);

/* -------------------------------------------------------------------------
   Canvass targets
   ------------------------------------------------------------------------- */

/**
 * The houses either side of a job we are working.
 *
 * A neighbour campaign drafts a real message to a real front door, so the
 * addresses have to come from somewhere accountable — a canvassing app, parcel
 * data, or a rep typing what they saw on the street. Deriving them by
 * incrementing street numbers would invent addresses, and the drafts go to
 * people who live at them.
 *
 * Rows carry their own status so a trigger can run repeatedly without
 * re-drafting the same house: `pending` is unworked, `created` points at the
 * lead it became, `skipped` is a decision someone made.
 */
export const canvassTargets = pgTable(
  "canvass_targets",
  {
    id: text("id").primaryKey(),
    /** The job whose crew the neighbours can see. */
    sourceDealId: text("source_deal_id")
      .notNull()
      .references((): AnyPgColumn => deals.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    /** pending | drafted | created | skipped */
    status: text("status").notNull().default("pending"),
    /** Set once this address has become a lead. */
    dealId: text("deal_id").references((): AnyPgColumn => deals.id),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("canvass_targets_source_idx").on(t.sourceDealId),
    index("canvass_targets_status_idx").on(t.status),
    uniqueIndex("canvass_targets_address_idx").on(t.sourceDealId, t.address),
  ],
);

/* -------------------------------------------------------------------------
   Touchpoints and approvals
   ------------------------------------------------------------------------- */

export const touchpoints = pgTable(
  "touchpoints",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    accountId: text("account_id").references(() => accounts.id),
    /** SMS | EMAIL | CALL | VISIT | NOTE | TRIGGER | JOB | SOURCE */
    channel: text("channel").notNull(),
    body: text("body").notNull(),
    /** Display string for who did it. */
    who: text("who").notNull(),
    byAgent: boolean("by_agent").notNull().default(false),
    initials: text("initials").notNull().default(""),
    userId: text("user_id").references(() => users.id),
    agentId: text("agent_id"),
    /** Structured fields captured by voice, if any. */
    structured: jsonb("structured").$type<
      { label: string; value: string }[] | null
    >(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("touchpoints_deal_idx").on(t.dealId),
    index("touchpoints_account_idx").on(t.accountId),
    index("touchpoints_occurred_idx").on(t.occurredAt),
  ],
);

export const approvals = pgTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    dealId: text("deal_id")
      .notNull()
      .references(() => deals.id, { onDelete: "cascade" }),
    /**
     * eleven_month | seasonal | revival | sequence | …
     *
     * Nullable because a campaign send is also a message awaiting review, and
     * it was not produced by a trigger. Writing a plausible-looking trigger
     * type to satisfy a constraint would put a false claim on the approvals
     * card and in the audit trail — the row would say a trigger fired when
     * none did. The check constraint below requires exactly one source.
     */
    triggerType: text("trigger_type"),
    /** Set instead of `triggerType` when this is a campaign step awaiting review. */
    campaignId: text("campaign_id").references((): AnyPgColumn => campaigns.id, {
      onDelete: "cascade",
    }),
    campaignStepId: text("campaign_step_id").references(
      (): AnyPgColumn => campaignSteps.id,
      { onDelete: "cascade" },
    ),
    title: text("title").notNull(),
    subtitle: text("subtitle").notNull().default(""),
    /** "TRIGGER FIRED TODAY" | "SEQUENCE STEP" */
    chip: text("chip").notNull().default("SEQUENCE STEP"),
    /** "SMS · she prefers text" | "EMAIL" */
    channel: text("channel").notNull(),
    recipient: text("recipient").notNull().default(""),
    body: text("body").notNull(),
    /** WHY THIS FIRED — derived from record facts, never invented prose. */
    reasons: jsonb("reasons").$type<string[]>().notNull().default([]),
    footnote: text("footnote").notNull().default(""),
    /** drafted | approved | edited | sent | skipped */
    status: text("status").notNull().default("drafted"),
    agentId: text("agent_id"),
    decidedBy: text("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("approvals_deal_idx").on(t.dealId),
    index("approvals_status_idx").on(t.status),
    index("approvals_campaign_idx").on(t.campaignId),
    /*
     * Exactly one source. Same shape as the actor pair `appendAudit`
     * enforces, but in the database rather than in a function, because this
     * one guards what the Approvals queue *means*: every row is a message
     * somebody is waiting to review, and it came from either a trigger or a
     * campaign step. `deal_id` stays NOT NULL — a campaign send is still to
     * somebody.
     */
    check(
      "approvals_one_source_chk",
      sql`(trigger_type is not null) <> (campaign_id is not null)`,
    ),
  ],
);

/* -------------------------------------------------------------------------
   Audit
   ------------------------------------------------------------------------- */

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey(),
    /** deal | approval | touchpoint | account | … */
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    action: text("action").notNull(),
    /** Exactly one of userId / agentId is set. */
    userId: text("user_id").references(() => users.id),
    agentId: text("agent_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_entity_idx").on(t.entity, t.entityId),
    index("audit_created_idx").on(t.createdAt),
  ],
);

/* -------------------------------------------------------------------------
   Relations
   ------------------------------------------------------------------------- */

export const pipelinesRelations = relations(pipelines, ({ many }) => ({
  stages: many(stages),
  deals: many(deals),
}));

export const stagesRelations = relations(stages, ({ one, many }) => ({
  pipeline: one(pipelines, {
    fields: [stages.pipelineId],
    references: [pipelines.id],
  }),
  deals: many(deals),
}));

export const accountsRelations = relations(accounts, ({ many, one }) => ({
  contacts: many(contacts),
  deals: many(deals),
  access: one(accessNotes),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  account: one(accounts, {
    fields: [contacts.accountId],
    references: [accounts.id],
  }),
}));

export const dealsRelations = relations(deals, ({ one, many }) => ({
  pipeline: one(pipelines, {
    fields: [deals.pipelineId],
    references: [pipelines.id],
  }),
  stage: one(stages, { fields: [deals.stageId], references: [stages.id] }),
  account: one(accounts, {
    fields: [deals.accountId],
    references: [accounts.id],
  }),
  touchpoints: many(touchpoints),
  approvals: many(approvals),
}));

export const canvassTargetsRelations = relations(canvassTargets, ({ one }) => ({
  sourceDeal: one(deals, {
    fields: [canvassTargets.sourceDealId],
    references: [deals.id],
    relationName: "canvassSource",
  }),
  deal: one(deals, {
    fields: [canvassTargets.dealId],
    references: [deals.id],
    relationName: "canvassLead",
  }),
}));

export const touchpointsRelations = relations(touchpoints, ({ one }) => ({
  deal: one(deals, { fields: [touchpoints.dealId], references: [deals.id] }),
  account: one(accounts, {
    fields: [touchpoints.accountId],
    references: [accounts.id],
  }),
}));

export const approvalsRelations = relations(approvals, ({ one }) => ({
  deal: one(deals, { fields: [approvals.dealId], references: [deals.id] }),
}));

export const sequencesRelations = relations(sequences, ({ many }) => ({
  steps: many(sequenceSteps),
}));

export const sequenceStepsRelations = relations(sequenceSteps, ({ one }) => ({
  sequence: one(sequences, {
    fields: [sequenceSteps.sequenceId],
    references: [sequences.id],
  }),
}));
