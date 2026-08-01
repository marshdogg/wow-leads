import { relations } from "drizzle-orm";
import {
  boolean,
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
    /** Active/positive stages get a green column border. */
    positive: boolean("positive").notNull().default(false),
    /** Overrides the column title colour (On-Hold amber, Dormant dusty). */
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
    template: text("template").notNull().default(""),
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

    /** Residential Result sub-outcome: booked | parked. */
    resultOutcome: text("result_outcome"),
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
    /** eleven_month | seasonal | revival | sequence */
    triggerType: text("trigger_type").notNull(),
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
