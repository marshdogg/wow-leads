/**
 * Deal reads and writes. Stage-transition validation lives here rather than in
 * the UI, so a drag/drop, an API call and a script all get the same answer.
 */

import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/db";
import { deals, pipelines, stages, touchpoints } from "@/db/schema";
import { appendAudit } from "./audit";
import { toDeal, type DealRow } from "./mappers";
import {
  assertStageInPipeline,
  compactMoney,
  daysSince,
  isNeglected,
  metricThousands,
  rollupStageValue,
} from "./rules";
import type { Deal, DealMetric, NextActionState, PipelineId } from "@/lib/types";

export { StageTransitionError } from "./rules";

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
}): Promise<Deal> {
  const before = await requireDealRow(input.dealId);

  // Validate against the stage rows, not the TS union, so a stage added or
  // moved in the database behaves correctly.
  const stageRows = await db
    .select({ id: stages.id, pipelineId: stages.pipelineId })
    .from(stages);
  assertStageInPipeline(
    before.id,
    before.pipelineId,
    input.stageId,
    stageRows,
  );

  if (before.stageId === input.stageId) return toDeal(before);

  const [after] = await db
    .update(deals)
    .set({ stageId: input.stageId, updatedAt: new Date() })
    .where(eq(deals.id, input.dealId))
    .returning();

  await appendAudit({
    entity: "deal",
    entityId: input.dealId,
    action: "move",
    userId: input.actorUserId,
    before: { stageId: before.stageId },
    after: { stageId: after.stageId },
  });

  return toDeal(after);
}

export async function setNextAction(input: {
  dealId: string;
  label: string;
  due: string;
  state: NextActionState;
  dueAt?: Date | null;
  actorUserId: string;
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
    userId: input.actorUserId,
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
    structured: null,
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
  if (bid) return bid.value;
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
      neglectDays: pipelines.neglectDays,
    })
    .from(deals)
    .innerJoin(stages, eq(deals.stageId, stages.id))
    .innerJoin(pipelines, eq(deals.pipelineId, pipelines.id));

  const now = new Date();
  const neglected: NeglectedDeal[] = [];
  for (const r of rows) {
    const nextState = (r.nextState as NextActionState | null) ?? null;
    // Never contacted? Measure the silence from when the record was created.
    const since = r.lastTouchAt ?? r.createdAt;
    if (
      !isNeglected(r.lastTouchAt, r.neglectDays, now, nextState, r.createdAt) ||
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
