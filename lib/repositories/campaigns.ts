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

  const saved = await getCampaign(id);
  if (!saved) throw new Error(`Campaign "${id}" vanished after save.`);
  return saved;
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
    predicate = sql`${deals.tags} @> ${JSON.stringify([params.tag])}::jsonb`;
  } else {
    if (!params.pipelineId || !params.stageId) return [];
    predicate = sql`${deals.pipelineId} = ${params.pipelineId} and ${deals.stageId} = ${params.stageId}`;
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
  const scope = campaignId
    ? sql`and e.campaign_id = ${campaignId}`
    : sql``;
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
  const [row] = await db
    .select({ id: jobs.id })
    .from(jobs)
    .limit(1);
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

export async function getEnrolments(campaignId: string) {
  return db
    .select()
    .from(campaignEnrolments)
    .where(
      and(
        eq(campaignEnrolments.campaignId, campaignId),
        eq(campaignEnrolments.state, "active"),
      ),
    );
}
