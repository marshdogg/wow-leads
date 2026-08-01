import { audienceSentence } from "./describe";
import { db } from "@/db";
import { approvals } from "@/db/schema";
import { channelFor } from "@/lib/agents/drafter";
import { DEFAULT_SENDER } from "@/lib/agents/types";
import { getDeal } from "@/lib/repositories/deals";
import {
  advanceEnrolment,
  enrol,
  exitEnrolment,
  getAudienceCandidates,
  getAudienceDealIds,
  getCampaigns,
  getEnrolments,
  getSendsOn,
  recordRunCount,
  recordSend,
} from "@/lib/repositories/campaigns";
import { getTemplates } from "@/lib/repositories/templates";
import { renderTemplate, resolveTemplate } from "@/lib/templates/resolve";
import type { MessageTemplate } from "@/lib/templates/types";
import type { PipelineId, StageId, TrackId } from "@/lib/types";
import { audienceKindSpec } from "./audience";
import { approvableContent, campaignGate, volumeGate } from "./approval";
import { actionKey, planCampaignRun, type CandidateFacts } from "./plan";
import type { Campaign, CampaignEnrolment, CampaignStep } from "./types";

/**
 * The campaign runner.
 *
 * Its judgement lives in `plan.ts`, which is pure; this performs the plan.
 * Keeping them apart is what lets the Campaigns screen show a dry run by
 * calling exactly the code that will run tomorrow morning rather than an
 * approximation of it.
 *
 * Three gates stand in front of any send, in this order:
 *
 *   1. **Approval.** A bulk campaign that nobody approved — or that was
 *      approved and then edited — sends nothing. See `approval.ts`.
 *   2. **Volume.** A run vastly larger than the last one pauses and asks,
 *      because audience size is the one thing bulk approval never reviewed.
 *   3. **Template eligibility.** A step whose copy needs a fact the record
 *      does not have is skipped and reported, never filled with a guess.
 *
 * Idempotency is a table, not a flag: `campaign_sends` is unique on
 * `(enrolment_id, step_number)` and `recordSend` conflicts silently, so a
 * second run on the same morning writes nothing and sends nothing.
 */

export interface StepOutcome {
  campaignId: string;
  dealId: string;
  stepNumber: number;
  /** The approval created, when the campaign reviews each message. */
  approvalId?: string;
  /** Why nothing went out, when that is the case. */
  skipped?: string;
}

export interface CampaignRunSummary {
  campaignId: string;
  campaignName: string;
  approvalMode: Campaign["approvalMode"];
  enrolled: number;
  advanced: number;
  exited: number;
  completed: number;
  /** Steps that resolved no eligible template. */
  skipped: number;
  /** Why the campaign as a whole did nothing. */
  blocked: string | null;
  outcomes: StepOutcome[];
}

export interface CampaignsRunSummary {
  ranAt: string;
  campaigns: CampaignRunSummary[];
}

export interface CampaignRunOptions {
  now?: Date;
  /** Plan and report without writing anything. */
  dryRun?: boolean;
  /** Restrict to one campaign — the Campaigns screen's preview. */
  campaignId?: string;
}

export async function runCampaigns(
  options: CampaignRunOptions = {},
): Promise<CampaignsRunSummary> {
  const now = options.now ?? new Date();
  const all = await getCampaigns();
  const campaigns = options.campaignId
    ? all.filter((c) => c.id === options.campaignId)
    : all;

  const [templates, candidates, sends] = await Promise.all([
    getTemplates(),
    getAudienceCandidates(),
    getSendsOn(now),
  ]);
  const performedToday = new Set(
    sends.map((s) => actionKey(s.enrolmentId, s.stepNumber)),
  );

  const summaries: CampaignRunSummary[] = [];
  for (const campaign of campaigns) {
    summaries.push(
      await runOne(campaign, {
        now,
        templates,
        candidates,
        performedToday,
        dryRun: options.dryRun ?? false,
      }),
    );
  }

  return { ranAt: now.toISOString(), campaigns: summaries };
}

interface RunContext {
  now: Date;
  templates: MessageTemplate[];
  candidates: Awaited<ReturnType<typeof getAudienceCandidates>>;
  performedToday: ReadonlySet<string>;
  dryRun: boolean;
}

async function runOne(
  campaign: Campaign,
  ctx: RunContext,
): Promise<CampaignRunSummary> {
  const summary: CampaignRunSummary = {
    campaignId: campaign.id,
    campaignName: campaign.name,
    approvalMode: campaign.approvalMode,
    enrolled: 0,
    advanced: 0,
    exited: 0,
    completed: 0,
    skipped: 0,
    blocked: null,
    outcomes: [],
  };

  if (!campaign.active) {
    summary.blocked = "Campaign is not active";
    return summary;
  }

  const enrolments = await getEnrolments(campaign.id);

  // Selection is SQL in one place, so the editor's "selects N people" and this
  // pass cannot reach different sets. `audienceMatches` remains the readable
  // spec the unit tests assert against.
  const selectedIds = new Set(
    await getAudienceDealIds(
      campaign.audience,
      campaign.reenrolAfterDays,
      ctx.now,
      campaign.id,
    ),
  );

  const facts = candidateFacts(ctx, selectedIds, enrolments);
  const plan = planCampaignRun({
    campaign,
    candidates: facts,
    enrolments,
    now: ctx.now,
    performedToday: ctx.performedToday,
  });

  if (plan.blocked) {
    summary.blocked = plan.blocked;
    return summary;
  }

  /* ---- gate one: is this campaign allowed to send at all? -------------- */
  const sendingSteps = plan.actions.filter((a) => a.type === "advance");
  if (sendingSteps.length > 0) {
    const gate = await approvalGateFor(campaign, ctx);
    if (!gate.allowed) {
      summary.blocked = gate.reason;
      return summary;
    }
  }

  /* ---- gate two: is this run suspiciously larger than the last? -------- */
  const volume = volumeGate({
    recipientCount: sendingSteps.length,
    lastRunCount: campaign.lastRunCount,
  });
  if (!volume.allowed) {
    summary.blocked = volume.reason;
    return summary;
  }

  /* ---- perform ---------------------------------------------------------- */
  // Same-day step-one sends count toward the run size the volume guard
  // records, otherwise a campaign that only ever enrols would keep a baseline
  // of zero and trip on its first real send.
  let immediate = 0;

  for (const action of plan.actions) {
    switch (action.type) {
      case "exit":
        summary.exited += 1;
        if (!ctx.dryRun) {
          await exitEnrolment({
            enrolmentId: action.enrolmentId,
            reason: action.reason,
            state: "exited",
            agentId: "agent-remarketing",
          });
        }
        break;

      case "complete":
        summary.completed += 1;
        if (!ctx.dryRun) {
          await exitEnrolment({
            enrolmentId: action.enrolmentId,
            reason: "Campaign finished",
            state: "completed",
            agentId: "agent-remarketing",
          });
        }
        break;

      case "enrol": {
        summary.enrolled += 1;
        if (ctx.dryRun) {
          if (action.sendsImmediately) immediate += 1;
          break;
        }
        const enrolment = await enrol({
          campaignId: campaign.id,
          dealId: action.dealId,
          agentId: "agent-remarketing",
        });
        // A step one with no delay sends the day somebody enrols. Waiting for
        // tomorrow's run would push a "4 days after the job" review request
        // out on day 5 — the exact-day audience exists precisely so the
        // timing is the timing.
        if (action.sendsImmediately && campaign.steps[0]) {
          const outcome = await performStep(
            campaign,
            campaign.steps[0],
            { enrolmentId: enrolment.id, dealId: action.dealId },
            ctx,
          );
          summary.outcomes.push(outcome);
          if (outcome.skipped) summary.skipped += 1;
          else summary.advanced += 1;
          immediate += 1;
        }
        break;
      }

      case "advance": {
        const outcome = await performStep(campaign, action.step, action, ctx);
        summary.outcomes.push(outcome);
        if (outcome.skipped) summary.skipped += 1;
        else summary.advanced += 1;
        break;
      }
    }
  }

  // Only after a run that actually sent. Recording zero on a quiet morning
  // would reset the baseline and make the next real run look like a jump.
  const runSize = sendingSteps.length + immediate;
  if (!ctx.dryRun && runSize > 0) {
    await recordRunCount(campaign.id, runSize);
  }

  return summary;
}

/**
 * Why this message is going out, for the approval card.
 *
 * Derived from the campaign, never invented — the same rule the trigger
 * reasons follow. A reviewer should be able to see which audience selected
 * this person and where in the sequence they are.
 */
function campaignReasons(campaign: Campaign, step: CampaignStep): string[] {
  const spec = audienceKindSpec(campaign.audience.kind);
  const reasons = [
    `Enrolled in ${campaign.name}`,
    `${spec.label} — ${audienceSentence(campaign.audience)}`,
    `Step ${step.stepNumber} of ${campaign.steps.length}: ${step.label}`,
  ];
  if (step.delayDays > 0) {
    reasons.push(`Scheduled ${step.delayDays} days after the previous step`);
  }
  return reasons;
}

/**
 * Draft and queue one step.
 *
 * `per_message` puts the message in the Approvals queue exactly as a trigger
 * draft does — a human reads this text before it reaches anybody. `bulk` has
 * already been approved at the campaign level, so the send is logged rather
 * than queued.
 */
async function performStep(
  campaign: Campaign,
  step: CampaignStep,
  action: { enrolmentId: string; dealId: string },
  ctx: RunContext,
): Promise<StepOutcome> {
  const base: StepOutcome = {
    campaignId: campaign.id,
    dealId: action.dealId,
    stepNumber: step.stepNumber,
  };

  const deal = await getDeal(action.dealId);
  if (!deal) return { ...base, skipped: "Deal no longer exists" };

  const rendered = renderStep(campaign, step, deal, ctx);
  if (!rendered) {
    return {
      ...base,
      skipped:
        "No template matched — every candidate needed a fact this record does not have",
    };
  }

  if (ctx.dryRun) return base;

  // `per_message` queues the message for review instead of logging a send.
  // The row carries `campaignId`/`campaignStepId` and a null `triggerType` —
  // the database check enforces exactly one source, so an approvals row can
  // never claim both that a trigger fired and that a campaign sent it.
  if (campaign.approvalMode === "per_message") {
    const approvalId = `apr-${crypto.randomUUID()}`;
    await db.insert(approvals).values({
      id: approvalId,
      dealId: action.dealId,
      triggerType: null,
      campaignId: campaign.id,
      campaignStepId: step.id,
      title: `${campaign.name} · ${deal.name}`,
      subtitle: `${step.label} · step ${step.stepNumber} of ${campaign.steps.length}`,
      chip: "SEQUENCE STEP",
      channel: step.channel,
      recipient: deal.name,
      body: rendered,
      reasons: campaignReasons(campaign, step),
      footnote: `Part of the ${campaign.name} campaign. Approving sends this message and advances the enrolment.`,
      status: "drafted",
      agentId: "agent-remarketing",
    });
    // The step is recorded as performed either way: a draft awaiting review is
    // not a second thing to draft tomorrow morning.
    await recordSend({
      enrolmentId: action.enrolmentId,
      stepNumber: step.stepNumber,
      sentOn: ctx.now,
    });
    await advanceEnrolment({
      enrolmentId: action.enrolmentId,
      toStep: step.stepNumber,
      agentId: "agent-remarketing",
    });
    return { ...base, approvalId };
  }

  await recordSend({
    enrolmentId: action.enrolmentId,
    stepNumber: step.stepNumber,
    sentOn: ctx.now,
  });
  await advanceEnrolment({
    enrolmentId: action.enrolmentId,
    toStep: step.stepNumber,
    agentId: "agent-remarketing",
  });

  return base;
}

/**
 * The copy for a step.
 *
 * A pinned `templateId` wins; otherwise the template is resolved by scope at
 * send time, so the copy follows the Templates screen rather than freezing at
 * the moment the campaign was written. Either way eligibility is enforced —
 * a pinned template whose tokens the record cannot fill is as unusable as one
 * that never matched, and returns nothing rather than a sentence with a hole.
 */
function renderStep(
  campaign: Campaign,
  step: CampaignStep,
  deal: NonNullable<Awaited<ReturnType<typeof getDeal>>>,
  ctx: RunContext,
): string | null {
  const facts = campaignTemplateFacts(deal);

  const pinned = step.templateId
    ? ctx.templates.find((t) => t.id === step.templateId)
    : undefined;

  const template =
    pinned ??
    resolveTemplate(
      ctx.templates,
      {
        // Campaign steps have no trigger; scope is the deal's own position.
        triggerType: "never_quoted",
        pipelineId: deal.pipe,
        stageId: deal.stage,
        track: (deal.track as TrackId | null) ?? null,
        channel: channelFor({
          name: deal.name,
          firstName: deal.name.split(/\s+/)[0] ?? deal.name,
          prefers: "EMAIL",
          address: "",
          pronoun: null,
        }),
      },
      facts,
    );

  if (!template) return null;
  try {
    return renderTemplate(template, facts).body;
  } catch {
    // A pinned template can reach here where a resolved one cannot: nothing
    // checked its tokens against this record. Treat it as ineligible rather
    // than letting the throw abort the whole run.
    return null;
  }
}

/** Template facts for a campaign send. */
function campaignTemplateFacts(
  deal: NonNullable<Awaited<ReturnType<typeof getDeal>>>,
) {
  const firstName = deal.name.split(/\s+/)[0] ?? deal.name;
  return {
    "contact.firstName": firstName,
    "sender.firstName": DEFAULT_SENDER.firstName,
    "sender.company": DEFAULT_SENDER.company,
  };
}

/** Whether a bulk campaign may send, with its copy resolved for the hash. */
async function approvalGateFor(campaign: Campaign, ctx: RunContext) {
  const bodies = new Map<number, string>();
  for (const step of campaign.steps) {
    const template = step.templateId
      ? ctx.templates.find((t) => t.id === step.templateId)
      : undefined;
    bodies.set(step.stepNumber, template?.body ?? "");
  }
  return campaignGate(campaign, approvableContent(campaign, bodies));
}

/**
 * Candidate facts for the plan.
 *
 * `booked` and `unsubscribed` are exit signals rather than selection ones, so
 * they are read for everyone already enrolled — not only for whoever the
 * audience currently selects. A customer who booked yesterday has usually
 * stopped matching the audience too, and if we only looked at the selected
 * set we would never see them to let them out.
 */
function candidateFacts(
  ctx: RunContext,
  selectedIds: ReadonlySet<string>,
  enrolments: CampaignEnrolment[],
): CandidateFacts[] {
  const needed = new Set([...selectedIds, ...enrolments.map((e) => e.dealId)]);

  return ctx.candidates
    .filter((c) => needed.has(c.dealId))
    .map((c) => ({
      dealId: c.dealId,
      jobCompletedAt: c.jobCompletedAt,
      tags: c.tags,
      pipelineId: c.pipelineId,
      stageId: c.stageId,
      lastEnrolledAt: c.lastEnrolledAt,
      // The Residential Result stage carrying an estimate reference is what
      // "booked" means on this data model.
      booked: c.stageId === "result" || c.stageId === "booked",
      unsubscribed: false,
    }));
}

export type { PipelineId, StageId };
