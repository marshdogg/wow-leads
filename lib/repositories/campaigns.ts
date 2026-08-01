/**
 * Campaigns — user-created outreach that isn't a pipeline.
 *
 * Selection lives in **one** place: `getAudienceDealIds` builds the SQL, and
 * both the editor's live count and the runner's enrolment pass go through it.
 * The pure `audienceMatches` in `lib/campaigns/audience.ts` stays the readable
 * specification and the thing tests assert against — but if the runner filtered
 * in JS while the editor counted in SQL, a franchise would arm a campaign
 * showing "47 people" and reach a different 47.
 */

import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  campaignEnrolments,
  campaignSends,
  campaignSteps,
  campaigns,
  deals,
  jobs,
} from "@/db/schema";
import { appendAudit } from "./audit";
import type {
  ApprovalMode,
  Audience,
  AudienceFacts,
  AudienceKind,
  AudienceParams,
  Campaign,
  CampaignEnrolment,
  CampaignStep,
} from "@/lib/campaigns/types";
import type { PipelineCategory, PipelineId } from "@/lib/types";

type CampaignRow = typeof campaigns.$inferSelect;
type StepRow = typeof campaignSteps.$inferSelect;

function toStep(row: StepRow): CampaignStep {
  return {
    id: row.id,
    campaignId: row.campaignId,
    stepNumber: row.stepNumber,
    delayDays: row.delayDays,
    channel: row.channel,
    templateId: row.templateId,
    label: row.label,
  };
}

function toCampaign(row: CampaignRow, steps: StepRow[]): Campaign {
  return {
    id: row.id,
    name: row.name,
    category: row.category as PipelineCategory,
    description: row.description,
    audience: {
      kind: row.audienceKind as AudienceKind,
      params: row.audienceParams as AudienceParams,
    },
    approvalMode: row.approvalMode as ApprovalMode,
    active: row.active,
    reenrolAfterDays: row.reenrolAfterDays,
    authoredBy: row.authoredBy,
    lastRunCount: row.lastRunCount,
    approvedAt: row.approvedAt,
    approvedBy: row.approvedBy,
    approvedHash: row.approvedHash,
    steps: steps
      .filter((s) => s.campaignId === row.id)
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .map(toStep),
  };
}

export async function getCampaigns(): Promise<Campaign[]> {
  const [rows, steps] = await Promise.all([
    db.select().from(campaigns).orderBy(asc(campaigns.name)),
    db.select().from(campaignSteps).orderBy(asc(campaignSteps.stepNumber)),
  ]);
  return rows.map((r) => toCampaign(r, steps));
}

export async function getCampaign(id: string): Promise<Campaign | null> {
  const [row] = await db
    .select()
    .from(campaigns)
    .where(eq(campaigns.id, id))
    .limit(1);
  if (!row) return null;
  const steps = await db
    .select()
    .from(campaignSteps)
    .where(eq(campaignSteps.campaignId, id))
    .orderBy(asc(campaignSteps.stepNumber));
  return toCampaign(row, steps);
}

export interface SaveCampaignInput {
  /** Omit to create. */
  id?: string;
  name: string;
  category?: string;
  description?: string;
  audience: Audience;
  approvalMode?: ApprovalMode;
  active?: boolean;
  reenrolAfterDays?: number | null;
  /** Replaces the step list wholesale when given; omit to leave steps alone. */
  steps?: Omit<CampaignStep, "id" | "campaignId">[];
  actorUserId: string;
}

/**
 * Creates or updates a campaign.
 *
 * **An omitted optional field preserves, it does not reset.** `approvalMode`
 * and `reenrolAfterDays` are the trap here: defaulting them on every save
 * would silently flip a bulk newsletter back to per-message approval, or drop
 * a re-enrolment guard and let a campaign nag the same customer daily. A field
 * the caller did not mention is a field they did not intend to change.
 */
export async function saveCampaign(
  input: SaveCampaignInput,
): Promise<Campaign> {
  const existing = input.id ? await getCampaign(input.id) : null;
  const id = input.id ?? `camp-${crypto.randomUUID().slice(0, 8)}`;
  const now = new Date();

  const values = {
    id,
    name: input.name,
    category: input.category ?? existing?.category ?? "RESIDENTIAL LEADS",
    description: input.description ?? existing?.description ?? "",
    audienceKind: input.audience.kind,
    audienceParams: input.audience.params as Record<string, unknown>,
    approvalMode:
      input.approvalMode ?? existing?.approvalMode ?? ("per_message" as const),
    active: input.active ?? existing?.active ?? false,
    reenrolAfterDays:
      input.reenrolAfterDays !== undefined
        ? input.reenrolAfterDays
        : (existing?.reenrolAfterDays ?? null),
    authoredBy: input.actorUserId,
    updatedAt: now,
  };

  await db
    .insert(campaigns)
    .values(values)
    .onConflictDoUpdate({
      target: campaigns.id,
      set: {
        name: values.name,
        category: values.category,
        description: values.description,
        audienceKind: values.audienceKind,
        audienceParams: values.audienceParams,
        approvalMode: values.approvalMode,
        active: values.active,
        reenrolAfterDays: values.reenrolAfterDays,
        authoredBy: values.authoredBy,
        updatedAt: now,
      },
    });

  if (input.steps) {
    await db.delete(campaignSteps).where(eq(campaignSteps.campaignId, id));
    if (input.steps.length) {
      await db.insert(campaignSteps).values(
        input.steps.map((s, i) => ({
          id: `${id}-s${i + 1}`,
          campaignId: id,
          stepNumber: s.stepNumber || i + 1,
          delayDays: s.delayDays,
          channel: s.channel,
          templateId: s.templateId,
          label: s.label,
        })),
      );
    }
  }

  await appendAudit({
    entity: "campaign",
    entityId: id,
    action: existing ? "update" : "create",
    userId: input.actorUserId,
    before: existing
      ? {
          name: existing.name,
          audience: existing.audience,
          approvalMode: existing.approvalMode,
          active: existing.active,
          reenrolAfterDays: existing.reenrolAfterDays,
        }
      : null,
    after: {
      name: values.name,
      audience: input.audience,
      approvalMode: values.approvalMode,
      active: values.active,
      reenrolAfterDays: values.reenrolAfterDays,
    },
  });

  // Any edit invalidates a bulk approval — the approved thing no longer
  // exists. Skipped when nothing was approved, so an ordinary save on a
  // per-message campaign writes no noise into the audit trail.
  if (existing?.approvedHash) await revokeApproval(id, input.actorUserId);

  const saved = await getCampaign(id);
  if (!saved) throw new Error(`Campaign "${id}" vanished after save.`);
  return saved;
}

/**
 * Clears a bulk approval. Called by `saveCampaign` on every edit rather than
 * left to the caller: an approval that survives an edit to the audience or the
 * copy is not a gate, and "remember to revoke" is not a mechanism.
 */
async function revokeApproval(id: string, actorUserId: string): Promise<void> {
  await db
    .update(campaigns)
    .set({ approvedAt: null, approvedBy: null, approvedHash: null })
    .where(eq(campaigns.id, id));
  await appendAudit({
    entity: "campaign",
    entityId: id,
    action: "approval.revoked",
    userId: actorUserId,
    before: { approved: true },
    after: { approved: false, reason: "campaign edited" },
  });
}

/**
 * Records a bulk approval of the current campaign version.
 *
 * The hash is computed by `lib/campaigns/approval.ts` from the audience, the
 * steps and the *resolved* copy — so re-pointing a step, or editing the
 * template a step points at, both invalidate it. Stored verbatim; deriving it
 * here would put a second implementation of the rule in the repository.
 */
export async function approveCampaign(input: {
  campaignId: string;
  actorUserId: string;
  hash: string;
}): Promise<void> {
  const before = await getCampaign(input.campaignId);
  if (!before) throw new Error(`Campaign "${input.campaignId}" not found.`);
  if (before.approvalMode !== "bulk") {
    throw new Error(
      `Campaign "${input.campaignId}" approves per message — there is nothing to bulk-approve.`,
    );
  }

  const now = new Date();
  await db
    .update(campaigns)
    .set({
      approvedAt: now,
      approvedBy: input.actorUserId,
      approvedHash: input.hash,
    })
    .where(eq(campaigns.id, input.campaignId));

  await appendAudit({
    entity: "campaign",
    entityId: input.campaignId,
    action: "approval.granted",
    userId: input.actorUserId,
    before: { approvedHash: before.approvedHash },
    after: { approvedHash: input.hash },
  });
}

/**
 * Removes a campaign and everything downstream of it. Enrolments and sends
 * cascade — a send record for a campaign nobody can look up is not history,
 * it is litter.
 */
export async function deleteCampaign(
  id: string,
  actorUserId: string,
): Promise<void> {
  const before = await getCampaign(id);
  if (!before) throw new Error(`Campaign "${id}" not found.`);

  await db.delete(campaigns).where(eq(campaigns.id, id));
  await appendAudit({
    entity: "campaign",
    entityId: id,
    action: "delete",
    userId: actorUserId,
    before: {
      name: before.name,
      audience: before.audience,
      active: before.active,
    },
    after: null,
  });
}

export async function setCampaignActive(
  id: string,
  active: boolean,
  actorUserId: string,
): Promise<void> {
  const before = await getCampaign(id);
  if (!before) throw new Error(`Campaign "${id}" not found.`);

  await db
    .update(campaigns)
    .set({ active, updatedAt: new Date() })
    .where(eq(campaigns.id, id));

  await appendAudit({
    entity: "campaign",
    entityId: id,
    action: active ? "arm" : "disarm",
    userId: actorUserId,
    before: { active: before.active },
    after: { active },
  });
}

/* -------------------------------------------------------------------------
   Audience selection
   ------------------------------------------------------------------------- */

/** The most recent completion per account, which is what every job rule means. */
const latestJob = sql`(
  select distinct on (j.account_id) j.account_id, j.completed_at
    from ${jobs} j
   order by j.account_id, j.completed_at desc
)`;

/**
 * Whoever this audience selects right now.
 *
 * Mirrors `audienceMatches` exactly, including the detail that
 * `job_completed_days_ago` is an **exact day** rather than "at least N days" —
 * a review request is a moment, and `>=` would re-select the same customer
 * every day with only the re-enrolment guard between them and a daily nag.
 */
export async function getAudienceDealIds(
  audience: Audience,
  reenrolAfterDays: number | null,
  now = new Date(),
  campaignId?: string,
): Promise<string[]> {
  const { kind, params } = audience;
  let predicate: SQL | undefined;

  if (kind === "job_completed_days_ago") {
    if (typeof params.days !== "number") return [];
    predicate = sql`floor(extract(epoch from (${now}::timestamptz - lj.completed_at)) / 86400) = ${params.days}`;
  } else if (kind === "no_job_in_months") {
    if (typeof params.months !== "number") return [];
    // `age()` counts calendar months with the same day-of-month adjustment the
    // pure predicate makes, so the two cannot drift on month boundaries.
    predicate = sql`(
      extract(year from age(${now}::timestamptz, lj.completed_at)) * 12
      + extract(month from age(${now}::timestamptz, lj.completed_at))
    ) >= ${params.months}`;
  } else if (kind === "tagged") {
    if (!params.tag) return [];
    predicate = sql`d.tags @> ${JSON.stringify([params.tag])}::jsonb`;
  } else {
    if (!params.pipelineId || !params.stageId) return [];
    predicate = sql`d.pipeline_id = ${params.pipelineId} and d.stage_id = ${params.stageId}`;
  }

  // Never having had a job is not the same as not having had one lately, so
  // both job audiences require a completion rather than treating null as old.
  const needsJob =
    kind === "job_completed_days_ago" || kind === "no_job_in_months";

  const guard = enrolmentGuard(reenrolAfterDays, now, campaignId);

  const rows = await db.execute<{ id: string }>(sql`
    select d.id
      from ${deals} d
      ${needsJob ? sql`join` : sql`left join`} ${latestJob} lj
        on lj.account_id = d.account_id
     where ${predicate}
       and ${guard}
  `);
  const list = Array.isArray(rows) ? rows : rows.rows;
  return list.map((r) => r.id);
}

/**
 * The re-enrolment gate, as SQL. A campaign with no window is once-only, which
 * is why the null case excludes anyone previously enrolled rather than
 * admitting them.
 */
function enrolmentGuard(
  reenrolAfterDays: number | null,
  now: Date,
  campaignId?: string,
): SQL {
  const scope = campaignId ? sql`and e.campaign_id = ${campaignId}` : sql``;
  const recent =
    reenrolAfterDays === null
      ? sql`true`
      : sql`floor(extract(epoch from (${now}::timestamptz - e.enrolled_at)) / 86400) < ${reenrolAfterDays}`;

  return sql`not exists (
    select 1 from ${campaignEnrolments} e
     where e.deal_id = d.id ${scope} and ${recent}
  )`;
}

/** The live count behind "this selects N people" in the editor. */
export async function audienceSizeFor(
  audience: Audience,
  reenrolAfterDays: number | null,
  now = new Date(),
): Promise<number> {
  return (await getAudienceDealIds(audience, reenrolAfterDays, now)).length;
}

/**
 * The facts an audience is evaluated against, per deal. Bulk, same reasoning
 * as the template facts: a screen previewing an audience should not make a
 * round trip per candidate.
 */
export async function getAudienceFactsFor(
  dealIds: string[],
): Promise<Record<string, AudienceFacts>> {
  if (!dealIds.length) return {};

  const [dealRows, jobRows, enrolmentRows, accountRows] = await Promise.all([
    db.select().from(deals).where(inArray(deals.id, dealIds)),
    db
      .select({
        accountId: jobs.accountId,
        completedAt: jobs.completedAt,
      })
      .from(jobs),
    db
      .select({
        dealId: campaignEnrolments.dealId,
        enrolledAt: campaignEnrolments.enrolledAt,
      })
      .from(campaignEnrolments)
      .where(inArray(campaignEnrolments.dealId, dealIds)),
    db.select({ id: accounts.id, tags: accounts.tags }).from(accounts),
  ]);

  const latestByAccount = new Map<string, Date>();
  for (const j of jobRows) {
    const current = latestByAccount.get(j.accountId);
    if (!current || j.completedAt > current) {
      latestByAccount.set(j.accountId, j.completedAt);
    }
  }
  const latestEnrolment = new Map<string, Date>();
  for (const e of enrolmentRows) {
    const current = latestEnrolment.get(e.dealId);
    if (!current || e.enrolledAt > current) {
      latestEnrolment.set(e.dealId, e.enrolledAt);
    }
  }
  const tagsByAccount = new Map(accountRows.map((a) => [a.id, a.tags]));

  const out: Record<string, AudienceFacts> = {};
  for (const d of dealRows) {
    out[d.id] = {
      jobCompletedAt: d.accountId
        ? (latestByAccount.get(d.accountId) ?? null)
        : null,
      // The deal's tags and the account's, deduplicated — a franchise tagging
      // "DIRECT HOMEOWNER" does not care which row it landed on.
      tags: Array.from(
        new Set([...d.tags, ...(tagsByAccount.get(d.accountId ?? "") ?? [])]),
      ),
      pipelineId: d.pipelineId as PipelineId,
      stageId: d.stageId,
      lastEnrolledAt: latestEnrolment.get(d.id) ?? null,
    };
  }
  return out;
}

/**
 * Whether any completion data exists at all.
 *
 * The two job-based audiences are unevaluable without it, and the editor says
 * so rather than letting someone arm a review campaign that silently selects
 * nobody. Today only the seed writes jobs — the Funnel does not send them yet.
 */
export async function hasJobCompletions(): Promise<boolean> {
  const [row] = await db.select({ id: jobs.id }).from(jobs).limit(1);
  return Boolean(row);
}

/** Every completed job for an account, newest first. */
export async function getJobsForAccount(accountId: string) {
  return db
    .select()
    .from(jobs)
    .where(eq(jobs.accountId, accountId))
    .orderBy(sql`${jobs.completedAt} desc`);
}

/**
 * Active enrolments, with `state` as the union rather than a bare string.
 * An unrecognised value maps to `exited`, never to active — a state nobody
 * planned for must not read as "still sending to this person".
 */
export async function getEnrolments(
  campaignId: string,
): Promise<CampaignEnrolment[]> {
  const rows = await db
    .select()
    .from(campaignEnrolments)
    .where(
      and(
        eq(campaignEnrolments.campaignId, campaignId),
        eq(campaignEnrolments.state, "active"),
      ),
    );
  return rows.map(toEnrolment);
}

/**
 * Records how many recipients a run selected, for the volume guard. A campaign
 * approved against 50 accounts should not quietly send to 5,000 when the tag
 * grows — this is what the guard compares against.
 */
export async function recordRunCount(
  campaignId: string,
  count: number,
): Promise<void> {
  await db
    .update(campaigns)
    .set({ lastRunCount: count })
    .where(eq(campaigns.id, campaignId));
}

/* -------------------------------------------------------------------------
   The editor's candidate list
   ------------------------------------------------------------------------- */

export interface AudienceCandidate extends AudienceFacts {
  dealId: string;
  name: string;
  account: string;
}

/**
 * Every deal an audience could select, with the facts to judge it by.
 *
 * Shipped whole so the editor can re-size the audience client-side as someone
 * types "4" then "40" — a round trip per digit makes the count read as a
 * report rather than a readout, and it cannot produce the sample names that
 * make the number checkable rather than asserted. `audienceSizeFor` exists
 * alongside for the list, where one number per campaign beats shipping every
 * candidate N times.
 */
export async function getAudienceCandidates(): Promise<AudienceCandidate[]> {
  const [dealRows, jobRows, enrolmentRows, accountRows] = await Promise.all([
    db.select().from(deals).orderBy(asc(deals.id)),
    db
      .select({ accountId: jobs.accountId, completedAt: jobs.completedAt })
      .from(jobs),
    db
      .select({
        dealId: campaignEnrolments.dealId,
        enrolledAt: campaignEnrolments.enrolledAt,
      })
      .from(campaignEnrolments),
    db.select({ id: accounts.id, tags: accounts.tags }).from(accounts),
  ]);

  const latestJob = new Map<string, Date>();
  for (const j of jobRows) {
    const current = latestJob.get(j.accountId);
    if (!current || j.completedAt > current) {
      latestJob.set(j.accountId, j.completedAt);
    }
  }
  const latestEnrolment = new Map<string, Date>();
  for (const e of enrolmentRows) {
    const current = latestEnrolment.get(e.dealId);
    if (!current || e.enrolledAt > current) {
      latestEnrolment.set(e.dealId, e.enrolledAt);
    }
  }
  const tagsByAccount = new Map(accountRows.map((a) => [a.id, a.tags]));

  return dealRows.map((d) => ({
    dealId: d.id,
    name: d.name,
    account: d.accountLine,
    // Null when they have never had a job — which is not the same as an old
    // job, and is why both job audiences exclude rather than admit them.
    jobCompletedAt: d.accountId ? (latestJob.get(d.accountId) ?? null) : null,
    tags: Array.from(
      new Set([...d.tags, ...(tagsByAccount.get(d.accountId ?? "") ?? [])]),
    ),
    pipelineId: d.pipelineId as PipelineId,
    stageId: d.stageId,
    lastEnrolledAt: latestEnrolment.get(d.id) ?? null,
  }));
}

/* -------------------------------------------------------------------------
   Enrolment lifecycle — what the runner drives
   ------------------------------------------------------------------------- */

/**
 * Enrols someone, or re-enrols them.
 *
 * One row per person per campaign: a re-entry resets the existing row rather
 * than adding a second, so `enrolledAt` is always the latest entry and the
 * re-enrolment guard can read it without a subquery over history.
 */
export async function enrol(input: {
  campaignId: string;
  dealId: string;
  actorUserId?: string;
  agentId?: string;
}): Promise<CampaignEnrolment> {
  const now = new Date();
  const [row] = await db
    .insert(campaignEnrolments)
    .values({
      id: `enr-${crypto.randomUUID().slice(0, 8)}`,
      campaignId: input.campaignId,
      dealId: input.dealId,
      enrolledAt: now,
      currentStep: 1,
      state: "active",
      exitReason: null,
    })
    .onConflictDoUpdate({
      target: [campaignEnrolments.campaignId, campaignEnrolments.dealId],
      set: {
        enrolledAt: now,
        currentStep: 1,
        state: "active",
        exitReason: null,
      },
    })
    .returning();

  await appendAudit({
    entity: "campaign_enrolment",
    entityId: row.id,
    action: "enrol",
    userId: input.actorUserId ?? null,
    agentId: input.actorUserId ? null : (input.agentId ?? null),
    before: null,
    after: { campaignId: input.campaignId, dealId: input.dealId },
  });

  return toEnrolment(row);
}

export async function advanceEnrolment(input: {
  enrolmentId: string;
  toStep: number;
  actorUserId?: string;
  agentId?: string;
}): Promise<void> {
  const [before] = await db
    .select()
    .from(campaignEnrolments)
    .where(eq(campaignEnrolments.id, input.enrolmentId))
    .limit(1);
  if (!before) throw new Error(`Enrolment "${input.enrolmentId}" not found.`);

  await db
    .update(campaignEnrolments)
    .set({ currentStep: input.toStep })
    .where(eq(campaignEnrolments.id, input.enrolmentId));

  await appendAudit({
    entity: "campaign_enrolment",
    entityId: input.enrolmentId,
    action: "advance",
    userId: input.actorUserId ?? null,
    agentId: input.actorUserId ? null : (input.agentId ?? null),
    before: { currentStep: before.currentStep },
    after: { currentStep: input.toStep },
  });
}

/** Leaving early — booked, unsubscribed, or no longer in the audience. */
export async function exitEnrolment(input: {
  enrolmentId: string;
  reason: string;
  state?: "completed" | "exited";
  actorUserId?: string;
  agentId?: string;
}): Promise<void> {
  const [before] = await db
    .select()
    .from(campaignEnrolments)
    .where(eq(campaignEnrolments.id, input.enrolmentId))
    .limit(1);
  if (!before) throw new Error(`Enrolment "${input.enrolmentId}" not found.`);

  const state = input.state ?? "exited";
  await db
    .update(campaignEnrolments)
    .set({ state, exitReason: input.reason })
    .where(eq(campaignEnrolments.id, input.enrolmentId));

  await appendAudit({
    entity: "campaign_enrolment",
    entityId: input.enrolmentId,
    action: state === "completed" ? "complete" : "exit",
    userId: input.actorUserId ?? null,
    agentId: input.actorUserId ? null : (input.agentId ?? null),
    before: { state: before.state },
    after: { state, reason: input.reason },
  });
}

/**
 * Marks a step sent. The unique constraint on (enrolment, step) is the
 * idempotency guarantee — a second run the same morning conflicts rather than
 * sending twice, so this is deliberately not an upsert.
 */
export async function recordSend(input: {
  enrolmentId: string;
  stepNumber: number;
  sentOn: Date;
}): Promise<void> {
  await db
    .insert(campaignSends)
    .values({
      id: `snd-${crypto.randomUUID().slice(0, 8)}`,
      enrolmentId: input.enrolmentId,
      stepNumber: input.stepNumber,
      sentOn: isoDate(input.sentOn),
    })
    .onConflictDoNothing();
}

/** What has already gone out on a given day, for the replay guard. */
export async function getSendsOn(
  date: Date,
): Promise<{ enrolmentId: string; stepNumber: number }[]> {
  const rows = await db
    .select({
      enrolmentId: campaignSends.enrolmentId,
      stepNumber: campaignSends.stepNumber,
    })
    .from(campaignSends)
    .where(eq(campaignSends.sentOn, isoDate(date)));
  return rows;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function toEnrolment(
  row: typeof campaignEnrolments.$inferSelect,
): CampaignEnrolment {
  return {
    id: row.id,
    campaignId: row.campaignId,
    dealId: row.dealId,
    enrolledAt: row.enrolledAt,
    currentStep: row.currentStep,
    state: row.state as CampaignEnrolment["state"],
    exitReason: row.exitReason,
  };
}

/* -------------------------------------------------------------------------
   Job ingest
   ------------------------------------------------------------------------- */

export interface UpsertCompletedJobInput {
  /** The Funnel's own id. The idempotency key — a retry must not add a row. */
  wowOsJobId: string;
  accountId: string;
  dealId?: string | null;
  completedAt: Date;
  workType: string;
  scope?: string;
  areas?: string[];
  valueCents: number;
  crew?: string | null;
  actorUserId?: string;
  agentId?: string;
}

/**
 * Records a completed job from the Funnel.
 *
 * Conflicts on `wowOsJobId`, not on our own key: a retried webhook must update
 * the row it already wrote. A duplicate here is not a duplicate row, it is a
 * second review request to a customer who already got one.
 */
export async function upsertCompletedJob(
  input: UpsertCompletedJobInput,
): Promise<{ id: string; created: boolean }> {
  const [existing] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .where(eq(jobs.wowOsJobId, input.wowOsJobId))
    .limit(1);

  const id = existing?.id ?? `job-${crypto.randomUUID().slice(0, 8)}`;
  const values = {
    id,
    wowOsJobId: input.wowOsJobId,
    accountId: input.accountId,
    dealId: input.dealId ?? null,
    completedAt: input.completedAt,
    workType: input.workType,
    scope: input.scope ?? "",
    areas: input.areas ?? [],
    valueCents: input.valueCents,
    crew: input.crew ?? null,
  };

  await db
    .insert(jobs)
    .values(values)
    .onConflictDoUpdate({ target: jobs.wowOsJobId, set: values });

  await appendAudit({
    entity: "job",
    entityId: id,
    action: existing ? "ingest.update" : "ingest.create",
    userId: input.actorUserId ?? null,
    agentId: input.actorUserId ? null : (input.agentId ?? "wow-os-funnel"),
    before: existing ? { id: existing.id } : null,
    after: { wowOsJobId: input.wowOsJobId, completedAt: input.completedAt },
  });

  return { id, created: !existing };
}

/**
 * How many completions we hold, and how many actually came from the Funnel.
 *
 * `hasJobCompletions` answers "can this audience be evaluated". This answers
 * the different question the UI should be honest about: the Funnel does not
 * send completions yet, so every row today is seeded. A screen that says
 * "5 completed jobs" without saying where they came from implies an
 * integration that does not exist.
 */
export async function getJobCompletionStats(): Promise<{
  total: number;
  fromFunnel: number;
}> {
  const rows = await db.select({ wowOsJobId: jobs.wowOsJobId }).from(jobs);
  return {
    total: rows.length,
    fromFunnel: rows.filter(
      (r) => r.wowOsJobId && !r.wowOsJobId.startsWith("seed:"),
    ).length,
  };
}
