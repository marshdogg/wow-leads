/**
 * Deal reads and writes. Stage-transition validation lives here rather than in
 * the UI, so a drag/drop, an API call and a script all get the same answer.
 */

import { and, asc, count, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  canvassTargets,
  deals,
  pipelines,
  stages,
  touchpoints,
  users,
} from "@/db/schema";
import { appendAudit } from "./audit";
import { toDeal, type DealRow } from "./mappers";
import {
  AGENT_NAMES,
  StageTransitionError,
  assertStageInPipeline,
  compactMoney,
  daysSince,
  formatThousands,
  isNeglected,
  metricThousands,
  rollupStageValue,
} from "./rules";
import {
  resolveNeglectDays,
  stageCountsForNeglect,
} from "@/lib/pipelines";
import type {
  Deal,
  DealMetric,
  LostReason,
  NextActionState,
  PipelineId,
  SemanticType,
} from "@/lib/types";

export { StageTransitionError } from "./rules";

export interface SourcedLead {
  id: string;
  name: string;
  account: string;
  stage: string;
  value: string;
  track: string | null;
}

export interface SourcedLeadSummary {
  leads: number;
  /** Total EST. VALUE of those leads, formatted. */
  value: string;
}

export interface JobSiteAttribution {
  jobs: number;
  leads: number;
  value: string;
  topJob: {
    id: string;
    /**
     * The job's address. A job is identified by where it is — `name` on a
     * residential deal is the homeowner, and "best performing job: Lorna
     * Kirkbride" reads as though a person were the job.
     */
    account: string;
    /** The owner's name, for the secondary line. */
    name: string;
    leads: number;
    value: string;
  } | null;
}

export interface NeglectedDeal {
  id: string;
  name: string;
  account: string;
  pipeline: string;
  stage: string;
  value: string;
  days: number;
}

/* -------------------------------------------------------------------------
   Reads
   ------------------------------------------------------------------------- */

/** Board order: stage order first, then insertion order within the column. */
async function selectDeals(pipe?: PipelineId): Promise<DealRow[]> {
  const rows = await db
    .select({ deal: deals, sortOrder: stages.sortOrder })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .where(pipe ? eq(deals.pipelineId, pipe) : undefined)
    .orderBy(asc(stages.sortOrder), asc(deals.createdAt), asc(deals.id));
  return rows.map((r) => r.deal);
}

export async function getDealsByPipeline(pipe: PipelineId): Promise<Deal[]> {
  return (await selectDeals(pipe)).map(toDeal);
}

export async function getAllDeals(): Promise<Deal[]> {
  return (await selectDeals()).map(toDeal);
}

export async function getDeal(id: string): Promise<Deal | null> {
  const [row] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  return row ? toDeal(row) : null;
}

async function requireDealRow(id: string): Promise<DealRow> {
  const [row] = await db.select().from(deals).where(eq(deals.id, id)).limit(1);
  if (!row) throw new Error(`Deal "${id}" not found.`);
  return row;
}

/* -------------------------------------------------------------------------
   Writes
   ------------------------------------------------------------------------- */

export async function moveDeal(input: {
  dealId: string;
  stageId: string;
  actorUserId: string;
  /** Required by stages flagged `requiresReason`; enforced below. */
  lostReason?: LostReason | null;
  /** Required by stages flagged `requiresRevisitDate` — every paused stage. */
  revisitDate?: Date | null;
}): Promise<Deal> {
  const before = await requireDealRow(input.dealId);

  // Validate against the stage rows, not the TS union, so a stage added or
  // moved in the database behaves correctly.
  const stageRows = await db
    .select({
      id: stages.id,
      pipelineId: stages.pipelineId,
      semanticType: stages.semanticType,
      requiresReason: stages.requiresReason,
      requiresRevisitDate: stages.requiresRevisitDate,
    })
    .from(stages);
  const target = assertStageInPipeline(
    before.id,
    before.pipelineId,
    input.stageId,
    stageRows,
  );

  if (before.stageId === input.stageId) return toDeal(before);

  const stage = stageRows.find((s) => s.id === input.stageId);

  /*
   * A reason-requiring stage cannot be entered without one, enforced here as
   * well as at the action boundary. The action guards the UI path; this guards
   * every path, including the trigger runner and a script. `lostReason` is
   * load-bearing twice — it splits the win rate and it is what the Lost-Lead
   * Revival trigger selects on — so a deal closed without one looks fine on
   * the board and silently never comes back.
   */
  if (stage?.requiresReason && !input.lostReason) {
    throw new StageTransitionError(
      `Stage "${input.stageId}" requires a reason. Moving ${before.id} without one would close it in a way nothing can act on later.`,
    );
  }

  /*
   * A paused deal is excluded from neglect on the promise that its revisit
   * date replaces the rule. Without one it is excluded from neglect *and*
   * generates no revisit signal — invisible, which is a worse trade than the
   * false positive the exclusion was built to remove. A noisy alert gets
   * ignored; a missing one gets trusted.
   */
  if (stage?.requiresRevisitDate && !input.revisitDate) {
    throw new StageTransitionError(
      `Stage "${input.stageId}" requires a revisit date. Pausing ${before.id} without one hides it from the neglect alert and from the revisit list at the same time.`,
    );
  }

  const enteringLost = stage?.semanticType === "lost";
  const leavingLost = before.stageId !== input.stageId && !enteringLost;
  const enteringPaused = stage?.semanticType === "paused";

  const [after] = await db
    .update(deals)
    .set({
      stageId: input.stageId,
      // Set together or cleared together — a reason with no date, or a date
      // with no reason, is a half-recorded loss.
      lostReason: enteringLost ? (input.lostReason ?? null) : null,
      lostAt: enteringLost ? new Date() : leavingLost ? null : before.lostAt,
      // Cleared on the way out for the same reason as the loss pair: a
      // revisit date on an open deal is a date nothing will ever act on.
      revisitDate: enteringPaused
        ? (input.revisitDate ?? null)
        : before.revisitDate && !enteringPaused
          ? null
          : before.revisitDate,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, input.dealId))
    .returning();

  await appendAudit({
    entity: "deal",
    entityId: input.dealId,
    action: enteringLost ? "lose" : "move",
    userId: input.actorUserId,
    before: {
      stageId: before.stageId,
      lostReason: before.lostReason,
      semanticType: stageRows.find((s) => s.id === before.stageId)?.semanticType,
    },
    after: {
      stageId: after.stageId,
      lostReason: after.lostReason,
      semanticType: target.semanticType,
    },
  });

  return toDeal(after);
}

export async function setNextAction(input: {
  dealId: string;
  label: string;
  due: string;
  state: NextActionState;
  dueAt?: Date | null;
  /**
   * Exactly one. An agent escalating a breached SLA has no human behind it,
   * and naming a user would put a false name in the provenance trail.
   */
  actorUserId?: string;
  agentId?: string;
}): Promise<Deal> {
  const before = await requireDealRow(input.dealId);

  const [after] = await db
    .update(deals)
    .set({
      nextLabel: input.label,
      nextDue: input.due,
      nextState: input.state,
      nextDueAt: input.dueAt ?? null,
      updatedAt: new Date(),
    })
    .where(eq(deals.id, input.dealId))
    .returning();

  await appendAudit({
    entity: "deal",
    entityId: input.dealId,
    action: "set_next_action",
    userId: input.actorUserId ?? null,
    agentId: input.agentId ?? null,
    before: {
      label: before.nextLabel,
      due: before.nextDue,
      state: before.nextState,
    },
    after: { label: after.nextLabel, due: after.nextDue, state: after.nextState },
  });

  return toDeal(after);
}

export async function setAiPending(input: {
  dealId: string;
  value: boolean;
  actorUserId?: string;
  agentId?: string;
}): Promise<Deal> {
  const before = await requireDealRow(input.dealId);

  const [after] = await db
    .update(deals)
    .set({ aiPending: input.value, updatedAt: new Date() })
    .where(eq(deals.id, input.dealId))
    .returning();

  await appendAudit({
    entity: "deal",
    entityId: input.dealId,
    action: input.value ? "ai_draft_pending" : "ai_draft_cleared",
    userId: input.actorUserId ?? null,
    agentId: input.agentId ?? null,
    before: { aiPending: before.aiPending },
    after: { aiPending: after.aiPending },
  });

  return toDeal(after);
}

/**
 * The WOW OS hand-off: the deal picks up an estimate reference, moves to its
 * pipeline's Result stage if it has one, and its CTA becomes "View in Funnel".
 */
export async function bookDeal(input: {
  dealId: string;
  osRef: string;
  whenLabel: string;
  estimatorName: string;
  actorUserId: string;
}): Promise<Deal> {
  const before = await requireDealRow(input.dealId);

  const resultStages = await db
    .select({ id: stages.id })
    .from(stages)
    .where(and(eq(stages.pipelineId, before.pipelineId), eq(stages.id, "result")));
  const stageId = resultStages.length ? "result" : before.stageId;

  const now = new Date();
  const [after] = await db
    .update(deals)
    .set({
      stageId,
      osRef: input.osRef,
      act: "View in Funnel",
      quick: false,
      aiPending: false,
      resultOutcome: stageId === "result" ? "booked" : before.resultOutcome,
      nextLabel: "Estimator on site",
      nextDue: `${input.whenLabel} · ${input.estimatorName}`,
      nextState: "ok",
      stale: "booked today",
      staleWarn: false,
      lastTouchAt: now,
      updatedAt: now,
    })
    .where(eq(deals.id, input.dealId))
    .returning();

  await db.insert(touchpoints).values({
    id: `tp-${crypto.randomUUID()}`,
    dealId: input.dealId,
    accountId: before.accountId,
    channel: "JOB",
    body: `Estimate scheduled — ${input.whenLabel} with ${input.estimatorName} · ${input.osRef}`,
    who: "WOW OS Funnel",
    byAgent: false,
    initials: "OS",
    userId: input.actorUserId,
    // A booking and a completion are both "something happened to the job", so
    // they share the JOB channel — but they mean opposite things to anything
    // reading job history. Booking an estimate for a past customer must not
    // read as "we just finished their work". The marker is structural so
    // consumers can discriminate without parsing the sentence.
    structured: [{ label: "EVENT", value: "estimate_booked" }],
    occurredAt: now,
  });

  await appendAudit({
    entity: "deal",
    entityId: input.dealId,
    action: "book",
    userId: input.actorUserId,
    before: { stageId: before.stageId, osRef: before.osRef },
    after: {
      stageId: after.stageId,
      osRef: after.osRef,
      when: input.whenLabel,
      estimator: input.estimatorName,
    },
  });

  return toDeal(after);
}

/* -------------------------------------------------------------------------
   Derived
   ------------------------------------------------------------------------- */

/** `$XXXK in stage` per column. Null for every stage outside Commercial. */
export async function getStageValueTotals(
  pipe: PipelineId,
): Promise<Record<string, string | null>> {
  const [pipeRow] = await db
    .select()
    .from(pipelines)
    .where(eq(pipelines.id, pipe))
    .limit(1);
  if (!pipeRow) throw new Error(`Unknown pipeline "${pipe}".`);

  const stageRows = await db
    .select()
    .from(stages)
    .where(eq(stages.pipelineId, pipe))
    .orderBy(asc(stages.sortOrder));

  const dealRows = await db
    .select({ stageId: deals.stageId, metrics: deals.metrics })
    .from(deals)
    .where(eq(deals.pipelineId, pipe));

  const totals: Record<string, string | null> = {};
  for (const stage of stageRows) {
    const cards = dealRows.filter((d) => d.stageId === stage.id);
    totals[stage.id] = rollupStageValue(cards, pipeRow.showStageValue);
  }
  return totals;
}

export async function getOverdueCount(pipe?: PipelineId): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(deals)
    .where(
      pipe
        ? and(eq(deals.nextState, "overdue"), eq(deals.pipelineId, pipe))
        : eq(deals.nextState, "overdue"),
    );
  return row?.n ?? 0;
}

/** Short pipeline names, as the Manager dashboard writes them. */
const PIPELINE_SHORT_LABEL: Record<string, string> = {
  resi: "Residential",
  newleads: "New Leads",
  comm: "Commercial",
  bizdev: "Biz Dev",
  partner: "Partner",
};

/** Stage names the dashboard abbreviates against the board's full labels. */
const STAGE_SHORT_LABEL: Record<string, string> = {
  takeoff: "Plan Review",
  followup: "Follow-up",
};

/** The money figure the neglected row carries, whatever the pipeline tracks. */
function neglectValue(metrics: DealMetric[]): string {
  const bid = metrics.find(
    (m) => m.label === "EST. VALUE" || m.label === "BID",
  );
  if (bid) return compactMoney(bid.value);
  const attributed = metrics.find((m) => m.label === "ATTRIBUTED");
  if (attributed) return `${attributed.value} attr.`;
  const historic = metrics.find(
    (m) => m.label === "LAST JOB" || m.label === "ORIGINAL",
  );
  if (historic) return `${compactMoney(historic.value)} est.`;
  return "—";
}

/**
 * Deals past their pipeline's neglect threshold, worst first. The threshold is
 * the pipeline's `neglectDays` column — 45 for Commercial, 14 elsewhere.
 */
export async function getNeglectedDeals(): Promise<NeglectedDeal[]> {
  const rows = await db
    .select({
      id: deals.id,
      name: deals.name,
      account: deals.accountLine,
      pipelineId: deals.pipelineId,
      stageId: deals.stageId,
      stageLabel: stages.label,
      metrics: deals.metrics,
      lastTouchAt: deals.lastTouchAt,
      nextState: deals.nextState,
      createdAt: deals.createdAt,
      semanticType: stages.semanticType,
      stageNeglectDays: stages.neglectDays,
      pipelineNeglectDays: pipelines.neglectDays,
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id));

  const now = new Date();
  const neglected: NeglectedDeal[] = [];
  for (const r of rows) {
    // Closed and paused stages are out entirely, whatever the threshold says.
    // A bid on hold with a revisit date six months out was tripping the
    // 45-day rule while sitting exactly where somebody put it — a false
    // positive by design, and the failure mode that teaches people to ignore
    // the alert. Paused deals come due by `revisitDate` instead; see
    // `getRevisitDue`.
    if (
      !stageCountsForNeglect({
        semanticType: r.semanticType as SemanticType,
      })
    ) {
      continue;
    }

    // Most specific wins: stage override → pipeline default → global.
    const threshold = resolveNeglectDays(
      r.stageNeglectDays !== null ? { neglectDays: r.stageNeglectDays } : undefined,
      r.pipelineNeglectDays,
    );

    const nextState = (r.nextState as NextActionState | null) ?? null;
    // Never contacted? Measure the silence from when the record was created.
    const since = r.lastTouchAt ?? r.createdAt;
    if (
      !isNeglected(r.lastTouchAt, threshold, now, nextState, r.createdAt) ||
      !since
    ) {
      continue;
    }
    neglected.push({
      id: r.id,
      name: r.name,
      account: r.account,
      pipeline: PIPELINE_SHORT_LABEL[r.pipelineId] ?? r.pipelineId,
      stage: STAGE_SHORT_LABEL[r.stageId] ?? r.stageLabel,
      value: neglectValue(r.metrics),
      days: daysSince(since, now),
    });
  }
  return neglected.sort((a, b) => b.days - a.days);
}

/** Total EST. VALUE / BID across a pipeline, in thousands. */
export async function getPipelineValueThousands(
  pipe: PipelineId,
): Promise<number> {
  const rows = await db
    .select({ metrics: deals.metrics })
    .from(deals)
    .where(eq(deals.pipelineId, pipe));
  return rows.reduce((acc, r) => {
    const m = r.metrics.find(
      (x) => x.label === "EST. VALUE" || x.label === "BID",
    );
    return acc + (m ? metricThousands(m.value) : 0);
  }, 0);
}


/* -------------------------------------------------------------------------
   Creating leads
   ------------------------------------------------------------------------- */

export interface CreateDealInput {
  /** Optional — generated when omitted, so callers need not invent ids. */
  id?: string;
  pipelineId: PipelineId;
  stageId: string;
  track?: string | null;
  name: string;
  accountLine: string;
  /** Omit and an account is created from `accountLine`. */
  accountId?: string;
  tags?: string[];
  source: string;
  ownerUserId?: string;
  ownerAgentId?: string;
  assignedBy: string;
  metrics?: DealMetric[];
  /** The job whose crew this neighbour walked past. */
  sourcedFromDealId?: string;
  actorUserId?: string;
  agentId?: string;
}

/**
 * Creates a lead. The neighbour campaign is the first thing that needs this —
 * every other pipeline starts from a record that already exists.
 *
 * The new deal gets an account and a SOURCE touchpoint, so it opens on the
 * Record screen looking like every other lead rather than a bare row, and its
 * arrival is on the timeline from the first moment.
 */
export async function createDeal(input: CreateDealInput): Promise<Deal> {
  if (!input.actorUserId && !input.agentId) {
    throw new Error("createDeal: named no actor — every lead has an author.");
  }

  const stageRows = await db
    .select({ id: stages.id, pipelineId: stages.pipelineId })
    .from(stages);
  const id = input.id ?? `nl-${crypto.randomUUID().slice(0, 8)}`;
  assertStageInPipeline(id, input.pipelineId, input.stageId, stageRows);

  const now = new Date();
  const tags = input.tags ?? [];

  let accountId = input.accountId ?? null;
  if (!accountId) {
    accountId = `acct-${id}`;
    await db
      .insert(accounts)
      .values({
        id: accountId,
        name: input.accountLine,
        line: input.accountLine,
        tags,
        details: [],
      })
      .onConflictDoNothing();
  }

  const ownerIsAgent = !input.ownerUserId && !!input.ownerAgentId;
  const [owner] = input.ownerUserId
    ? await db
        .select({ name: users.name, initials: users.initials })
        .from(users)
        .where(eq(users.id, input.ownerUserId))
        .limit(1)
    : [];
  const agentName = input.ownerAgentId
    ? (AGENT_NAMES[input.ownerAgentId] ?? "WOW Leads automation")
    : null;

  const [row] = await db
    .insert(deals)
    .values({
      id,
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      track: input.track ?? null,
      name: input.name,
      accountLine: input.accountLine,
      accountId,
      tags,
      source: input.source,
      ownerUserId: input.ownerUserId ?? null,
      ownerAgentId: input.ownerAgentId ?? null,
      ownerInitials: ownerIsAgent ? "AI" : (owner?.initials ?? "??"),
      ownerName: ownerIsAgent ? (agentName ?? "") : (owner?.name ?? "Unassigned"),
      ownerIsAgent,
      assignedBy: input.assignedBy,
      // Never contacted: neglect measures from createdAt until someone speaks
      // to them, which is exactly right for a lead that has just appeared.
      stale: "not yet contacted",
      lastTouchAt: null,
      metrics: input.metrics ?? [],
      sourcedFromDealId: input.sourcedFromDealId ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await db.insert(touchpoints).values({
    id: `tp-${crypto.randomUUID()}`,
    dealId: id,
    accountId,
    channel: "SOURCE",
    body: `Record created — source ${input.source}`,
    who: input.assignedBy,
    byAgent: false,
    initials: "OS",
    userId: input.actorUserId ?? null,
    agentId: input.agentId ?? null,
    structured: null,
    occurredAt: now,
  });

  await appendAudit({
    entity: "deal",
    entityId: id,
    action: "create",
    userId: input.actorUserId ?? null,
    agentId: input.actorUserId ? null : (input.agentId ?? null),
    before: null,
    after: {
      pipelineId: input.pipelineId,
      stageId: input.stageId,
      name: input.name,
      source: input.source,
      sourcedFromDealId: input.sourcedFromDealId ?? null,
    },
  });

  return toDeal(row);
}

/* -------------------------------------------------------------------------
   Job-site attribution
   ------------------------------------------------------------------------- */

/** Thousands of dollars of EST. VALUE / BID across a set of deals. */
function valueThousands(rows: { metrics: DealMetric[] }[]): number {
  return rows.reduce((acc, r) => {
    const m = r.metrics.find(
      (x) => x.label === "EST. VALUE" || x.label === "BID",
    );
    return acc + (m ? metricThousands(m.value) : 0);
  }, 0);
}

/** The neighbours a job produced — every lead attributed back to one deal. */
export async function getLeadsSourcedFrom(
  dealId: string,
): Promise<SourcedLead[]> {
  const rows = await db
    .select({
      id: deals.id,
      name: deals.name,
      account: deals.accountLine,
      stageLabel: stages.label,
      stageOrder: stages.sortOrder,
      metrics: deals.metrics,
      track: deals.track,
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .where(eq(deals.sourcedFromDealId, dealId))
    .orderBy(asc(stages.sortOrder), asc(deals.id));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    account: r.account,
    stage: r.stageLabel,
    value: neglectValue(r.metrics),
    track: r.track,
  }));
}

/**
 * What one job produced, on its own. Computed from the leads' metrics rather
 * than by re-parsing the formatted strings `getLeadsSourcedFrom` returns for
 * display — a number that has been through a formatter and back is a number
 * waiting to drift.
 */
export async function getSourcedLeadSummary(
  dealId: string,
): Promise<SourcedLeadSummary> {
  const rows = await db
    .select({ metrics: deals.metrics })
    .from(deals)
    .where(eq(deals.sourcedFromDealId, dealId));
  return {
    leads: rows.length,
    value: formatThousands(valueThousands(rows)),
  };
}

/**
 * The canvassing business case: how much net-new demand active job sites
 * produce. "This $8,400 job generated three neighbour leads worth $14K" is the
 * number that decides whether crews keep knocking on the two doors either
 * side, so it has to come from rows rather than a slide.
 */
export async function getJobSiteAttribution(): Promise<JobSiteAttribution> {
  const rows = await db
    .select({
      sourcedFromDealId: deals.sourcedFromDealId,
      metrics: deals.metrics,
    })
    .from(deals)
    .where(isNotNull(deals.sourcedFromDealId));

  if (!rows.length) {
    return { jobs: 0, leads: 0, value: formatThousands(0), topJob: null };
  }

  const byJob = new Map<string, { metrics: DealMetric[] }[]>();
  for (const r of rows) {
    const jobId = r.sourcedFromDealId;
    if (!jobId) continue;
    const bucket = byJob.get(jobId) ?? [];
    bucket.push({ metrics: r.metrics });
    byJob.set(jobId, bucket);
  }

  // Most leads wins; ties break on attributed value, so the "top job" is the
  // one actually worth pointing at.
  let top: { id: string; leads: number; valueK: number } | null = null;
  for (const [jobId, leads] of byJob) {
    const valueK = valueThousands(leads);
    if (
      !top ||
      leads.length > top.leads ||
      (leads.length === top.leads && valueK > top.valueK)
    ) {
      top = { id: jobId, leads: leads.length, valueK };
    }
  }

  let topJob: JobSiteAttribution["topJob"] = null;
  if (top) {
    const [job] = await db
      .select({ name: deals.name, account: deals.accountLine })
      .from(deals)
      .where(eq(deals.id, top.id))
      .limit(1);
    topJob = {
      id: top.id,
      account: job?.account ?? "",
      name: job?.name ?? top.id,
      leads: top.leads,
      value: formatThousands(top.valueK),
    };
  }

  return {
    jobs: byJob.size,
    leads: rows.length,
    value: formatThousands(valueThousands(rows)),
    topJob,
  };
}

/* -------------------------------------------------------------------------
   Canvass targets
   ------------------------------------------------------------------------- */

export interface CanvassTarget {
  id: string;
  sourceDealId: string;
  address: string;
  status: string;
  dealId: string | null;
  notes: string;
}

/**
 * The addresses around a job that nobody has approached yet.
 *
 * The neighbour trigger iterates these rather than deriving street numbers —
 * a drafted message goes to a real front door, so the address list has to come
 * from a canvassing app, parcel data, or a rep typing what they saw, never
 * from arithmetic on a house number.
 */
export async function getCanvassTargets(
  sourceDealId: string,
  status = "pending",
): Promise<CanvassTarget[]> {
  const rows = await db
    .select()
    .from(canvassTargets)
    .where(
      and(
        eq(canvassTargets.sourceDealId, sourceDealId),
        eq(canvassTargets.status, status),
      ),
    )
    .orderBy(asc(canvassTargets.address));
  return rows.map((r) => ({
    id: r.id,
    sourceDealId: r.sourceDealId,
    address: r.address,
    status: r.status,
    dealId: r.dealId,
    notes: r.notes,
  }));
}

/** Every job with at least one unworked neighbour address. */
export async function getJobsWithPendingCanvass(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ sourceDealId: canvassTargets.sourceDealId })
    .from(canvassTargets)
    .where(eq(canvassTargets.status, "pending"));
  return rows.map((r) => r.sourceDealId);
}

/**
 * Records what happened to one address. Statuses are terminal enough that a
 * trigger can re-run all day without drafting the same house twice.
 */
export type MarkCanvassTargetInput = {
  status: "pending" | "drafted" | "created" | "skipped";
  dealId?: string | null;
  actorUserId?: string;
  agentId?: string;
} & (
  | { targetId: string; sourceDealId?: never; address?: never }
  /** Identify by where it is — a caller iterating addresses has no target id. */
  | { targetId?: never; sourceDealId: string; address: string }
);

export async function markCanvassTarget(
  input: MarkCanvassTargetInput,
): Promise<void> {
  const locate =
    input.targetId !== undefined
      ? eq(canvassTargets.id, input.targetId)
      : and(
          eq(canvassTargets.sourceDealId, input.sourceDealId),
          eq(canvassTargets.address, input.address),
        );
  const described =
    input.targetId ?? `${input.sourceDealId} / ${input.address}`;

  const [before] = await db
    .select()
    .from(canvassTargets)
    .where(locate)
    .limit(1);
  if (!before) throw new Error(`Canvass target not found: ${described}.`);

  await db
    .update(canvassTargets)
    .set({
      status: input.status,
      dealId: input.dealId ?? before.dealId,
      updatedAt: new Date(),
    })
    .where(eq(canvassTargets.id, before.id));

  await appendAudit({
    entity: "canvass_target",
    entityId: before.id,
    action: `canvass.${input.status}`,
    userId: input.actorUserId ?? null,
    agentId: input.actorUserId ? null : (input.agentId ?? null),
    before: { status: before.status, dealId: before.dealId },
    after: { status: input.status, dealId: input.dealId ?? before.dealId },
  });
}


/**
 * Deal count per pipeline, for the rail badges. One grouped query rather than
 * pulling every deal into memory to count five numbers.
 */
export async function getPipelineCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ pipelineId: deals.pipelineId, n: count() })
    .from(deals)
    .groupBy(deals.pipelineId);
  return Object.fromEntries(rows.map((r) => [r.pipelineId, r.n]));
}


/* -------------------------------------------------------------------------
   Revisit due
   ------------------------------------------------------------------------- */

export interface RevisitDueDeal {
  id: string;
  name: string;
  account: string;
  pipeline: string;
  stage: string;
  value: string;
  /**
   * Days past the revisit date, zero on the day it falls due — or **null when
   * no revisit date was ever set**, which is the worse case and must not be
   * silently absent. Excluding paused stages from neglect assumes a date
   * replaces the rule; where nobody set one, the deal would otherwise appear
   * on neither dashboard while sitting untouched.
   */
  daysOverdue: number | null;
  revisitDate: Date | null;
  /** How long since anyone touched it, for the undated case. */
  daysSilent: number | null;
}

/**
 * Paused deals whose revisit date has passed.
 *
 * The counterpart to neglect, deliberately a separate signal. A paused deal is
 * not being ignored — somebody parked it on purpose and named a date. What
 * makes it actionable is that date arriving, not silence, so it belongs beside
 * the neglected list rather than inside it.
 */
export async function getRevisitDue(now = new Date()): Promise<RevisitDueDeal[]> {
  const rows = await db
    .select({
      id: deals.id,
      name: deals.name,
      account: deals.accountLine,
      pipelineId: deals.pipelineId,
      stageId: deals.stageId,
      stageLabel: stages.label,
      semanticType: stages.semanticType,
      metrics: deals.metrics,
      revisitDate: deals.revisitDate,
      lastTouchAt: deals.lastTouchAt,
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id));

  const due: RevisitDueDeal[] = [];
  for (const r of rows) {
    if (r.semanticType !== "paused") continue;
    const daysOverdue = r.revisitDate ? daysSince(r.revisitDate, now) : null;
    // Not due yet is fine — that is the pause working.
    if (daysOverdue !== null && daysOverdue < 0) continue;
    due.push({
      id: r.id,
      name: r.name,
      account: r.account,
      pipeline: PIPELINE_SHORT_LABEL[r.pipelineId] ?? r.pipelineId,
      stage: STAGE_SHORT_LABEL[r.stageId] ?? r.stageLabel,
      value: neglectValue(r.metrics),
      daysOverdue,
      revisitDate: r.revisitDate,
      daysSilent: r.lastTouchAt ? daysSince(r.lastTouchAt, now) : null,
    });
  }
  // Undated first: a pause nobody put an end to is the one worth seeing.
  return due.sort((a, b) => {
    if ((a.daysOverdue === null) !== (b.daysOverdue === null)) {
      return a.daysOverdue === null ? -1 : 1;
    }
    return (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0);
  });
}
