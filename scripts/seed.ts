/**
 * Seeds the WOW Leads demo dataset.
 *
 * Idempotent: every table is upserted on its primary key, so re-running
 * restores the fixture state without deleting rows other services (the cron
 * trigger service, the UI) have created alongside it.
 *
 *   pnpm seed
 */

import { config } from "dotenv";
import { getTableColumns, inArray, sql, type SQL } from "drizzle-orm";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";

import * as schema from "@/db/schema";
import { LOCATIONS, SWITCHABLE_USERS } from "@/lib/current-user";
import { APPROVAL_FIXTURES } from "@/lib/fixtures/approvals";
import {
  AGENT_ID_BY_OWNER_NAME,
  DEAL_FIXTURES,
  OWNER_USER_BY_INITIALS,
  type DealFixture,
} from "@/lib/fixtures/deals";
import { anchorDays, nextDueFrom } from "@/lib/fixtures/time";
import { ESTIMATORS, PIPELINE_IDS, PIPES } from "@/lib/pipelines";

config({ path: ".env.local" });

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set.");
const db = drizzle(neon(url), { schema });

const NOW = new Date();
const MS_DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * MS_DAY);

/** `set` clause that copies every non-key column from the rejected row. */
function overwrite<T extends PgTable>(
  table: T,
  keep: string[] = ["id"],
): PgUpdateSetSource<T> {
  const set: Record<string, SQL> = {};
  for (const [prop, column] of Object.entries(getTableColumns(table))) {
    if (keep.includes(prop)) continue;
    set[prop] = sql.raw(`excluded."${column.name}"`);
  }
  return set as PgUpdateSetSource<T>;
}

/* -------------------------------------------------------------------------
   Derivations from the prototype's record screen (lines 1371–1406)
   ------------------------------------------------------------------------- */

const HERO_ID = "r1";

const HERO_DETAILS = [
  { label: "PROPERTY TYPE", value: "Interior · rowhouse, 3 floors" },
  { label: "SQUARE FOOTAGE", value: "2,240 sq ft" },
  {
    label: "PAINT USED",
    value: "Benjamin Moore Regal Select · Simply White OC-117",
  },
  { label: "TRIM / CEILINGS", value: "Advance semi-gloss, Chantilly Lace" },
  { label: "LAST JOB", value: "Aug 21, 2025 · $8,400" },
  { label: "CREW", value: "Kris Jolin crew · 1-day interior" },
];

const HERO_ACCESS_NOTE =
  "Side gate code 4417. Park in the alley behind — front street is permit-only 8am–6pm. Two cats, keep the back door shut.";
const GENERIC_ACCESS_NOTE =
  "No access notes yet — capture on the first site visit.";

function genericDetails(tags: string[]) {
  const propertyType = tags.includes("INDUSTRIAL")
    ? "Industrial"
    : tags.includes("EXTERIOR")
      ? "Exterior"
      : "Interior";
  return [
    { label: "PROPERTY TYPE", value: propertyType },
    { label: "SQUARE FOOTAGE", value: "Not captured yet" },
    { label: "PAINT USED", value: "No history on file" },
    { label: "LAST JOB", value: "None — new account" },
  ];
}

function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

const accountIdFor = (dealId: string) => `acct-${dealId}`;

/* -------------------------------------------------------------------------
   Rows
   ------------------------------------------------------------------------- */

const locationRows = LOCATIONS.map((l) => ({
  id: l.id,
  name: l.name,
  region: l.region,
}));

const estimatorUsers = ESTIMATORS.map((e) => ({
  id: `u-est-${e.initials.toLowerCase()}`,
  name: e.name,
  initials: e.initials,
  role: "estimator" as const,
  locationId: "loc-dc",
}));

const userRows = [
  ...SWITCHABLE_USERS.map((u) => ({
    id: u.id,
    name: u.name,
    initials: u.initials,
    role: u.role,
    locationId: u.locationId,
  })),
  ...estimatorUsers,
];

const pipelineRows = PIPELINE_IDS.map((id, i) => {
  const p = PIPES[id];
  return {
    id: p.id,
    label: p.label,
    meta: p.meta,
    dot: p.dot,
    title: p.title,
    sub: p.sub,
    filterLabel: p.filter,
    hasTracks: p.tracks,
    showStageValue: p.showStageValue,
    neglectDays: p.neglectDays,
    sortOrder: i,
  };
});

const stageRows = PIPELINE_IDS.flatMap((id) =>
  PIPES[id].stages.map((s, i) => ({
    id: s.id,
    pipelineId: id,
    label: s.label,
    hint: s.hint,
    sortOrder: i,
    positive: s.positive ?? false,
    titleColor: s.titleColor ?? null,
  })),
);

const accountRows = DEAL_FIXTURES.map((d) => ({
  id: accountIdFor(d.id),
  name: d.id === HERO_ID ? "Marchetti residence" : d.account,
  line: d.account,
  tags: d.tags,
  details: d.id === HERO_ID ? HERO_DETAILS : genericDetails(d.tags),
}));

interface ContactRow {
  id: string;
  accountId: string;
  initials: string;
  name: string;
  role: string;
  prefers: string;
  contact: string;
  notes: string;
  isPrimary: boolean;
}

const contactRows: ContactRow[] = DEAL_FIXTURES.flatMap((d) => {
  const accountId = accountIdFor(d.id);
  if (d.id === HERO_ID) {
    return [
      {
        id: "c-r1-1",
        accountId,
        initials: "DM",
        name: "Delia Marchetti",
        role: "Homeowner · decision maker",
        prefers: "SMS",
        contact: "(202) 555-0188",
        notes:
          "Warm, direct, replies within the hour. Daughter’s wedding in October is the real deadline — lead with timing, not price.",
        isPrimary: true,
      },
      {
        id: "c-r1-2",
        accountId,
        initials: "TM",
        name: "Tomas Marchetti",
        role: "Spouse · secondary",
        prefers: "EMAIL",
        contact: "t.marchetti@example.com",
        notes: "",
        isPrimary: false,
      },
    ];
  }
  return [
    {
      id: `c-${d.id}-1`,
      accountId,
      initials: initialsOf(d.name),
      name: d.name,
      role: "Primary contact",
      prefers: "EMAIL",
      contact: "(202) 555-0140",
      notes: "",
      isPrimary: true,
    },
  ];
});

const primaryContactByDeal = new Map(
  DEAL_FIXTURES.map((d) => [
    d.id,
    contactRows.find((c) => c.accountId === accountIdFor(d.id) && c.isPrimary)!,
  ]),
);

const accessNoteRows = DEAL_FIXTURES.map((d) => ({
  id: `an-${d.id}`,
  accountId: accountIdFor(d.id),
  body: d.id === HERO_ID ? HERO_ACCESS_NOTE : GENERIC_ACCESS_NOTE,
  updatedBy: "u-marshall",
  updatedAt: NOW,
}));

/* Sequences — cadence 3 / 4 / 7 days after the preceding step. */
const SEQUENCE_CADENCE = [0, 3, 4, 7];

const sequenceRows = [
  {
    id: "seq-commercial-4touch",
    name: "Commercial 4-touch",
    description:
      "Cold-to-meeting sequence for GC, PM and facility contacts. Email, call, packet drop, final email.",
    stepCount: 4,
  },
  {
    id: "seq-partner-intro",
    name: "Partner intro",
    description:
      "Warm-introduction sequence for prospective referral partners, ending in agreed referral terms.",
    stepCount: 4,
  },
];

const sequenceStepRows = [
  {
    sequenceId: "seq-commercial-4touch",
    steps: [
      {
        label: "Intro email",
        channel: "EMAIL",
        template:
          "Short intro naming an adjacent job we finished, and the one-day turnaround. Ask for ten minutes.",
      },
      {
        label: "Day 3 phone call",
        channel: "CALL",
        template:
          "Reference the intro email. Ask what repaint scope is coming in the next two quarters.",
      },
      {
        label: "Info packet drop",
        channel: "VISIT",
        template:
          "Drop the reference list and trade-sequencing one-pager at the site office.",
      },
      {
        label: "Final follow-up email",
        channel: "EMAIL",
        template:
          "Last touch. Offer a walk-through slot, then close the sequence if there is no reply.",
      },
    ],
  },
  {
    sequenceId: "seq-partner-intro",
    steps: [
      {
        label: "Warm intro email",
        channel: "EMAIL",
        template:
          "Name the mutual contact, explain what kind of work we send back, propose coffee.",
      },
      {
        label: "Follow-up call",
        channel: "CALL",
        template: "Confirm fit and who on their side handles referrals.",
      },
      {
        label: "Drop off the info packet",
        channel: "VISIT",
        template: "Leave the co-marketing flyer and referral card stack.",
      },
      {
        label: "Terms + co-marketing proposal",
        channel: "EMAIL",
        template:
          "Send referral terms and the co-marketing proposal for signature.",
      },
    ],
  },
].flatMap((s) =>
  s.steps.map((step, i) => ({
    id: `${s.sequenceId}-s${i + 1}`,
    sequenceId: s.sequenceId,
    stepNumber: i + 1,
    label: step.label,
    channel: step.channel,
    delayDays: SEQUENCE_CADENCE[i],
    template: step.template,
  })),
);

const SEQUENCE_ID_BY_NAME: Record<string, string> = {
  "Commercial 4-touch": "seq-commercial-4touch",
  "Partner intro": "seq-partner-intro",
};

/* Promos — one per type so the type column is exercised (open question #1). */
const promoRows = [
  {
    id: "promo-spring15",
    code: "SPRING15",
    type: "direct",
    label: "15% spring interior",
    discount: "15%",
    windowStart: new Date(Date.UTC(2026, 2, 1)),
    windowEnd: new Date(Date.UTC(2026, 7, 15)),
    authoredBy: "u-marshall",
    active: true,
  },
  {
    id: "promo-trade10",
    code: "TRADE10",
    type: "trade",
    label: "Trade partner rate",
    discount: "10%",
    windowStart: new Date(Date.UTC(2026, 0, 1)),
    windowEnd: new Date(Date.UTC(2026, 11, 31)),
    authoredBy: "u-marshall",
    active: true,
  },
  {
    id: "promo-refer50",
    code: "REFER50",
    type: "referral",
    label: "Referral thank-you credit",
    discount: "$50",
    windowStart: new Date(Date.UTC(2026, 0, 1)),
    windowEnd: new Date(Date.UTC(2026, 11, 31)),
    authoredBy: "u-marshall",
    active: true,
  },
  {
    id: "promo-winback12",
    code: "WINBACK12",
    type: "retention",
    label: "Win-back offer",
    discount: "12%",
    windowStart: new Date(Date.UTC(2026, 5, 1)),
    windowEnd: new Date(Date.UTC(2026, 11, 31)),
    authoredBy: "u-marshall",
    active: true,
  },
];

const PROMO_BY_DEAL: Record<string, string> = { r5: "promo-spring15" };

function dealRow(d: DealFixture, latestTouchAt: Date | null) {
  const isAgent = d.owner.agent;
  const inResult = d.pipe === "resi" && d.stage === "result";
  return {
    id: d.id,
    pipelineId: d.pipe,
    stageId: d.stage,
    track: d.track ?? null,
    name: d.name,
    accountLine: d.account,
    accountId: accountIdFor(d.id),
    tags: d.tags,
    source: d.source,
    ownerUserId: isAgent ? null : (OWNER_USER_BY_INITIALS[d.owner.initials] ?? null),
    ownerAgentId: isAgent ? (AGENT_ID_BY_OWNER_NAME[d.owner.name] ?? null) : null,
    ownerInitials: d.owner.initials,
    ownerName: d.owner.name,
    ownerIsAgent: isAgent,
    assignedBy: d.assignedBy,
    aiPending: d.aiPending ?? false,
    stale: d.stale,
    staleWarn: d.staleWarn ?? false,
    lastTouchAt: latestTouchAt,
    metrics: d.metrics ?? [],
    sequenceId: d.seqName ? (SEQUENCE_ID_BY_NAME[d.seqName] ?? null) : null,
    seq: d.seq ?? null,
    seqName: d.seqName ?? null,
    seqStep: d.seqStep ?? null,
    nextLabel: d.next?.label ?? null,
    nextDue: d.next?.due ?? null,
    nextState: d.next?.state ?? null,
    nextDueAt: d.next ? nextDueFrom(d.next.due, NOW) : null,
    act: d.act,
    quick: d.quick,
    osRef: d.osRef ?? null,
    initialType: d.initialType ?? null,
    resultOutcome: inResult ? (d.osRef ? "booked" : "parked") : null,
    retryAt: inResult
      ? (d.metrics?.find((m) => m.label === "RETRY")?.value ?? null)
      : null,
    promoId: PROMO_BY_DEAL[d.id] ?? null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

interface TouchpointRow {
  id: string;
  dealId: string;
  accountId: string;
  channel: string;
  body: string;
  who: string;
  byAgent: boolean;
  initials: string;
  userId: string | null;
  agentId: string | null;
  structured: { label: string; value: string }[] | null;
  occurredAt: Date;
}

/** Hero timeline for r1 — prototype lines 1244–1250, with real dates. */
function heroTouchpoints(): TouchpointRow[] {
  const accountId = accountIdFor(HERO_ID);
  const at = (h: number, m: number) => {
    const d = new Date(NOW);
    d.setHours(h, m, 0, 0);
    return d;
  };
  return [
    {
      id: "tp-r1-1",
      dealId: HERO_ID,
      accountId,
      channel: "SMS",
      body: 'Warranty check-in sent — "your one-year inspection is coming up"',
      who: "Re-marketing agent · approved by Marshall Behrns",
      byAgent: true,
      initials: "AI",
      userId: null,
      agentId: "agent-remarketing",
      structured: null,
      occurredAt: at(9, 14),
    },
    {
      id: "tp-r1-2",
      dealId: HERO_ID,
      accountId,
      channel: "TRIGGER",
      body: "11-Month Touchpoint fired — job completed Aug 2025, no contact since Sept",
      who: "WOW Leads automation",
      byAgent: true,
      initials: "AI",
      userId: null,
      agentId: "agent-remarketing",
      structured: null,
      occurredAt: at(6, 0),
    },
    {
      id: "tp-r1-3",
      dealId: HERO_ID,
      accountId,
      channel: "NOTE",
      body: "Completion follow-up — very happy, mentioned the stairwell gets scuffed",
      who: "Dani Koval",
      byAgent: false,
      initials: "DK",
      userId: "u-dani",
      agentId: null,
      structured: null,
      occurredAt: new Date(2025, 8, 3, 14, 0, 0),
    },
    {
      id: "tp-r1-4",
      dealId: HERO_ID,
      accountId,
      channel: "JOB",
      body: "Interior repaint completed — 4 rooms, hallway, stairwell · $8,400",
      who: "WOW OS Funnel",
      byAgent: false,
      initials: "OS",
      userId: null,
      agentId: null,
      structured: null,
      occurredAt: new Date(2025, 7, 21, 17, 0, 0),
    },
    {
      id: "tp-r1-5",
      dealId: HERO_ID,
      accountId,
      channel: "SOURCE",
      body: "Original lead captured — Google Ads, interior enquiry",
      who: "Website",
      byAgent: false,
      initials: "W",
      userId: null,
      agentId: null,
      structured: null,
      occurredAt: new Date(2025, 6, 2, 11, 0, 0),
    },
  ];
}

/**
 * Generic timeline — prototype lines 1251–1255, but anchored to the deal's own
 * last-touch rather than a flat 3/9/21 days.
 *
 * The prototype hard-codes "3 days ago" on every card, which puts a friendly
 * "Spoke with the contact" three days back on Grant Whitfield while his card
 * reads "19d silent" and the Manager dashboard calls him neglected. Anchoring
 * the newest entry to the silence date makes the three views agree, and it is
 * what keeps `deals.last_touch_at` equal to the newest touchpoint for every
 * seeded deal.
 */
function genericTouchpoints(d: DealFixture): TouchpointRow[] {
  const accountId = accountIdFor(d.id);
  const isAgent = d.owner.agent;
  const userId = isAgent
    ? null
    : (OWNER_USER_BY_INITIALS[d.owner.initials] ?? null);
  const agentId = isAgent ? (AGENT_ID_BY_OWNER_NAME[d.owner.name] ?? null) : null;

  const source: TouchpointRow = {
    id: `tp-${d.id}-3`,
    dealId: d.id,
    accountId,
    channel: "SOURCE",
    body: `Record created — source ${d.source}`,
    who: d.assignedBy,
    byAgent: false,
    initials: "OS",
    userId: null,
    agentId: null,
    structured: null,
    occurredAt: daysAgo((anchorDays(d.stale) ?? 0) + 18),
  };

  // "not yet contacted" means exactly that: the record exists, nobody has
  // spoken to them, and `lastTouchAt` stays null.
  const anchor = anchorDays(d.stale);
  if (anchor === null) return [source];

  return [
    {
      id: `tp-${d.id}-1`,
      dealId: d.id,
      accountId,
      channel: "CALL",
      body: "Spoke with the contact — scope and timing confirmed",
      who: d.owner.name,
      byAgent: isAgent,
      initials: d.owner.initials,
      userId,
      agentId,
      structured: null,
      occurredAt: daysAgo(anchor),
    },
    {
      id: `tp-${d.id}-2`,
      dealId: d.id,
      accountId,
      channel: "EMAIL",
      body: "Sent the reference list and one-day turnaround explainer",
      who: d.owner.name,
      byAgent: isAgent,
      initials: d.owner.initials,
      userId,
      agentId,
      structured: null,
      occurredAt: daysAgo(anchor + 6),
    },
    source,
  ];
}

/**
 * Event touchpoints behind the display-only metrics on r5, r6 and b2, so the
 * trigger service can read a real `occurredAt` instead of parsing
 * "promo sent 3d ago" / "lost 6 mo ago" out of a card string. The r1
 * equivalents (the Aug-2025 job and the Sept-2025 follow-up) are already in
 * the hero timeline.
 */
const eventTouchpoints: TouchpointRow[] = [
  {
    id: "tp-r5-promo",
    dealId: "r5",
    accountId: accountIdFor("r5"),
    channel: "EMAIL",
    body: "15% spring interior offer sent (SPRING15) — expires Aug 15",
    who: "Re-marketing agent",
    byAgent: true,
    initials: "AI",
    userId: null,
    agentId: "agent-remarketing",
    structured: [
      { label: "PROMO", value: "SPRING15" },
      { label: "DISCOUNT", value: "15%" },
      { label: "EXPIRES", value: "Aug 15" },
    ],
    occurredAt: daysAgo(3),
  },
  {
    id: "tp-r6-loss",
    dealId: "r6",
    accountId: accountIdFor("r6"),
    channel: "NOTE",
    body: "Lost on price — original quote $5,600. Six-month cooling period before revival.",
    who: "Reese Alvarado",
    byAgent: false,
    initials: "RA",
    userId: "u-reese",
    agentId: null,
    structured: [
      { label: "LOST FOR", value: "Price" },
      { label: "ORIGINAL", value: "$5,600" },
    ],
    occurredAt: daysAgo(182),
  },
  {
    id: "tp-b2-seqstart",
    dealId: "b2",
    accountId: accountIdFor("b2"),
    channel: "TRIGGER",
    body: "Commercial 4-touch sequence started — step 1 of 4 drafted",
    who: "Prospecting agent",
    byAgent: true,
    initials: "AI",
    userId: null,
    agentId: "agent-prospecting",
    structured: [
      { label: "SEQUENCE", value: "Commercial 4-touch" },
      { label: "STEP", value: "1 of 4" },
    ],
    occurredAt: daysAgo(1),
  },
];

const touchpointRows: TouchpointRow[] = [
  ...DEAL_FIXTURES.flatMap((d) =>
    d.id === HERO_ID ? heroTouchpoints() : genericTouchpoints(d),
  ),
  ...eventTouchpoints,
];

/**
 * A conversation, as opposed to a system event. TRIGGER, JOB and SOURCE rows
 * record something happening *to* the account, not someone talking to it, so
 * they never count as a touch — otherwise "Record created" would make a lead
 * nobody has ever phoned look freshly contacted.
 */
const CONTACT_CHANNELS = new Set(["SMS", "EMAIL", "CALL", "VISIT", "NOTE"]);

/** Most recent conversation per deal — the source of truth for lastTouchAt. */
const latestTouchByDeal = new Map<string, Date>();
for (const tp of touchpointRows) {
  if (!CONTACT_CHANNELS.has(tp.channel)) continue;
  const current = latestTouchByDeal.get(tp.dealId);
  if (!current || tp.occurredAt > current) {
    latestTouchByDeal.set(tp.dealId, tp.occurredAt);
  }
}

const dealRows = DEAL_FIXTURES.map((d) =>
  dealRow(d, latestTouchByDeal.get(d.id) ?? null),
);

const approvalRows = APPROVAL_FIXTURES.map((a) => {
  const contact = primaryContactByDeal.get(a.dealId);
  return {
    id: a.id,
    dealId: a.dealId,
    triggerType: a.triggerType,
    title: a.title,
    subtitle: a.subtitle,
    chip: a.chip,
    channel: a.channel,
    recipient: contact ? `${contact.name} · ${contact.contact}` : "",
    body: a.body,
    reasons: a.reasons,
    footnote: a.footnote,
    status: "drafted",
    agentId: a.agentId,
    decidedBy: null,
    decidedAt: null,
    createdAt: NOW,
  };
});

const auditRows = DEAL_FIXTURES.map((d) => ({
  id: `aud-seed-${d.id}`,
  entity: "deal",
  entityId: d.id,
  action: "seed",
  userId: "u-marshall",
  agentId: null,
  before: null,
  after: { pipe: d.pipe, stage: d.stage, name: d.name, source: d.source },
  createdAt: NOW,
}));

/* -------------------------------------------------------------------------
   Run
   ------------------------------------------------------------------------- */

async function main() {
  await db
    .insert(schema.locations)
    .values(locationRows)
    .onConflictDoUpdate({
      target: schema.locations.id,
      set: overwrite(schema.locations),
    });

  // boardPrefs is user-owned state — never clobbered by a re-seed.
  await db
    .insert(schema.users)
    .values(userRows)
    .onConflictDoUpdate({
      target: schema.users.id,
      set: overwrite(schema.users, ["id", "boardPrefs"]),
    });

  await db
    .insert(schema.pipelines)
    .values(pipelineRows)
    .onConflictDoUpdate({
      target: schema.pipelines.id,
      set: overwrite(schema.pipelines),
    });

  await db
    .insert(schema.stages)
    .values(stageRows)
    .onConflictDoUpdate({
      target: schema.stages.id,
      set: overwrite(schema.stages),
    });

  await db
    .insert(schema.accounts)
    .values(accountRows)
    .onConflictDoUpdate({
      target: schema.accounts.id,
      set: overwrite(schema.accounts, ["id", "createdAt"]),
    });

  await db
    .insert(schema.contacts)
    .values(contactRows)
    .onConflictDoUpdate({
      target: schema.contacts.id,
      set: overwrite(schema.contacts),
    });

  await db
    .insert(schema.accessNotes)
    .values(accessNoteRows)
    .onConflictDoUpdate({
      target: schema.accessNotes.accountId,
      set: overwrite(schema.accessNotes),
    });

  await db
    .insert(schema.sequences)
    .values(sequenceRows)
    .onConflictDoUpdate({
      target: schema.sequences.id,
      set: overwrite(schema.sequences),
    });

  await db
    .insert(schema.sequenceSteps)
    .values(sequenceStepRows)
    .onConflictDoUpdate({
      target: schema.sequenceSteps.id,
      set: overwrite(schema.sequenceSteps),
    });

  await db
    .insert(schema.promos)
    .values(promoRows)
    .onConflictDoUpdate({
      target: schema.promos.id,
      set: overwrite(schema.promos),
    });

  await db
    .insert(schema.deals)
    .values(dealRows)
    .onConflictDoUpdate({
      target: schema.deals.id,
      set: overwrite(schema.deals, ["id", "createdAt"]),
    });

  await db
    .insert(schema.touchpoints)
    .values(touchpointRows)
    .onConflictDoUpdate({
      target: schema.touchpoints.id,
      set: overwrite(schema.touchpoints),
    });

  // Upserting alone leaves orphans: when a deal stops generating a timeline
  // entry — "not yet contacted" leads no longer get a CALL — the row from the
  // previous seed survives and the record contradicts the card. Sweep the ids
  // the seed owns and no longer writes. Runtime touchpoints are `tp-<uuid>`
  // and never match, so nothing a rep or an agent logged is touched.
  const seedOwnedIds = [
    ...DEAL_FIXTURES.flatMap((d) =>
      [1, 2, 3, 4, 5].map((n) => `tp-${d.id}-${n}`),
    ),
    ...eventTouchpoints.map((t) => t.id),
  ];
  const liveIds = new Set(touchpointRows.map((t) => t.id));
  const orphanIds = seedOwnedIds.filter((id) => !liveIds.has(id));
  if (orphanIds.length) {
    const removed = await db
      .delete(schema.touchpoints)
      .where(inArray(schema.touchpoints.id, orphanIds))
      .returning({ id: schema.touchpoints.id });
    if (removed.length) {
      console.log(
        `Removed ${removed.length} touchpoint(s) the seed no longer writes: ${removed.map((r) => r.id).join(", ")}`,
      );
    }
  }

  await db
    .insert(schema.approvals)
    .values(approvalRows)
    .onConflictDoUpdate({
      // Re-seeding must not un-decide an approval a human already handled.
      target: schema.approvals.id,
      set: overwrite(schema.approvals, [
        "id",
        "status",
        "decidedBy",
        "decidedAt",
        "createdAt",
      ]),
    });

  await db
    .insert(schema.auditEvents)
    .values(auditRows)
    .onConflictDoUpdate({
      target: schema.auditEvents.id,
      set: overwrite(schema.auditEvents, ["id", "createdAt"]),
    });

  // Pull `last_touch_at` forward to the newest touchpoint wherever real
  // activity has outrun the fixture value — a rep's field log, an approved
  // agent send, anything logged since the last seed. Without this a re-seed
  // would reset the column while leaving the touchpoint in place, and the
  // Manager dashboard would call a deal neglected whose timeline shows a
  // conversation today. The seeded rows already satisfy this; the statement
  // exists for everything logged on top of them.
  const reconciled = await db.execute<{ id: string; days: number }>(sql`
    with newest as (
      select deal_id, max(occurred_at) as at
        from touchpoints
       where channel in ('SMS','EMAIL','CALL','VISIT','NOTE')
       group by deal_id
    )
    update deals d
       set last_touch_at = newest.at,
           stale = case
             when date_part('day', now() - newest.at) < 1 then 'touched today'
             else 'touched ' || floor(date_part('day', now() - newest.at))::int || 'd ago'
           end,
           stale_warn = false,
           updated_at = now()
      from newest
     where newest.deal_id = d.id
       and (d.last_touch_at is null or newest.at > d.last_touch_at)
    returning d.id, floor(date_part('day', now() - newest.at))::int as days
  `);
  const reconciledRows = Array.isArray(reconciled) ? reconciled : reconciled.rows;
  if (reconciledRows.length) {
    console.log(
      `Pulled last_touch_at forward on ${reconciledRows.length} deal(s) with activity newer than the fixtures: ` +
        reconciledRows.map((r) => `${r.id} (${r.days}d)`).join(", "),
    );
  }

  const counts = await db.execute<{ table: string; n: number }>(sql`
    select 'locations' as table, count(*)::int as n from locations
    union all select 'users', count(*)::int from users
    union all select 'pipelines', count(*)::int from pipelines
    union all select 'stages', count(*)::int from stages
    union all select 'accounts', count(*)::int from accounts
    union all select 'contacts', count(*)::int from contacts
    union all select 'access_notes', count(*)::int from access_notes
    union all select 'sequences', count(*)::int from sequences
    union all select 'sequence_steps', count(*)::int from sequence_steps
    union all select 'promos', count(*)::int from promos
    union all select 'deals', count(*)::int from deals
    union all select 'touchpoints', count(*)::int from touchpoints
    union all select 'approvals', count(*)::int from approvals
    union all select 'audit_events', count(*)::int from audit_events
  `);

  const rows = Array.isArray(counts) ? counts : counts.rows;
  console.log("Seed complete.");
  for (const r of rows) console.log(`  ${r.table.padEnd(16)} ${r.n}`);

  // The invariant the Manager dashboard depends on: no deal may claim a
  // last-touch older than something sitting in its own timeline.
  const drift = await db.execute<{ id: string; last_touch_at: string; newest: string }>(sql`
    select d.id, d.last_touch_at, n.at as newest
      from deals d
      join (select deal_id, max(occurred_at) as at
              from touchpoints
             where channel in ('SMS','EMAIL','CALL','VISIT','NOTE')
             group by deal_id) n
        on n.deal_id = d.id
     where d.last_touch_at is null or n.at > d.last_touch_at
  `);
  const driftRows = Array.isArray(drift) ? drift : drift.rows;
  if (driftRows.length) {
    console.error(
      `\nFAILED invariant: ${driftRows.length} deal(s) have a touchpoint newer than last_touch_at:`,
      driftRows,
    );
    process.exit(1);
  }
  console.log("\n  last_touch_at agrees with the newest touchpoint on every deal.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
