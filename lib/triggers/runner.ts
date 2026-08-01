import { db } from "@/db";
import { approvals } from "@/db/schema";
import { channelFor, channelLabel, getDrafter, hasApiKey } from "@/lib/agents/drafter";
import { DEFAULT_SENDER, type DraftSource } from "@/lib/agents/types";
import { appendAudit } from "@/lib/repositories/audit";
import { setAiPending } from "@/lib/repositories/deals";
import type { TriggerType } from "@/lib/types";
import { isSameDay } from "./dates";
import {
  elevenMonthFacts,
  loadFactContext,
  revivalFacts,
  seasonalFacts,
  sequenceFacts,
  type DealRow,
  type FactContext,
} from "./fact-source";
import { chipForTrigger, describeTrigger, evaluateTrigger } from "./index";
import { isSuppressed, loadSuppressions, type SuppressionIndex } from "./suppression";
import type { TriggerFacts } from "./types";

/**
 * The trigger runners.
 *
 * One pass over the deal list, four triggers, and for every (deal, trigger)
 * pair that is both eligible and not already handled, one drafted approval
 * waiting for a human. Nothing here sends anything.
 *
 * Three gates stand between a deal and a draft, in this order — each cheaper
 * than the one after it:
 *
 *   1. **Shape.** Is this deal even a candidate? (`*Facts` returns null.)
 *   2. **Suppression.** Did somebody already say no? (90-day cooling.)
 *   3. **Idempotency.** Did we already draft this today, or is one pending?
 *
 * Only then is the predicate evaluated and the drafter called, which matters
 * because the drafter may be a network call.
 */

type FactBuilder = (ctx: FactContext, deal: DealRow) => TriggerFacts | null;

interface TriggerRunner {
  type: TriggerType;
  build: FactBuilder;
}

const RUNNERS: TriggerRunner[] = [
  { type: "eleven_month", build: elevenMonthFacts },
  { type: "seasonal", build: seasonalFacts },
  { type: "revival", build: revivalFacts },
  { type: "sequence", build: sequenceFacts },
];

/** Why one candidate did or did not fire. Dry runs only. */
export interface CandidateOutcome {
  dealId: string;
  dealName: string;
  outcome: "eligible" | "not-eligible" | "suppressed" | "duplicate";
  reasons: string[];
}

export interface TriggerRunSummary {
  triggerType: TriggerType;
  /** Deals whose shape made them a candidate for this trigger. */
  considered: number;
  /** Candidates the predicate found eligible. */
  eligible: number;
  /** Approvals actually created. */
  created: number;
  /** Held back by a 90-day skip. */
  suppressed: number;
  /** Held back because a draft already exists for today. */
  duplicate: number;
  approvalIds: string[];
  /**
   * Per-candidate explanation, populated on a dry run. The predicates already
   * return their blocking conditions as prose, so a dry run can say exactly
   * why a deal it looked at did nothing — which is what you actually want
   * when a trigger you expected to fire didn't.
   */
  candidates?: CandidateOutcome[];
}

export interface RunSummary {
  ranAt: string;
  /** Which drafter produced the copy — `template` when no API key is set. */
  drafter: DraftSource;
  created: number;
  triggers: TriggerRunSummary[];
}

export interface RunOptions {
  /** Injectable clock. */
  now?: Date;
  /** Evaluate and report without writing anything. */
  dryRun?: boolean;
}

export async function runAllTriggers(options: RunOptions = {}): Promise<RunSummary> {
  const now = options.now ?? new Date();
  const ctx = await loadFactContext(now);
  const suppressions = await loadSuppressions(
    ctx.deals.map((d) => d.id),
    now,
  );

  const drafter = getDrafter();
  const triggers: TriggerRunSummary[] = [];

  for (const runner of RUNNERS) {
    triggers.push(await runOne(runner, ctx, suppressions, drafter, options));
  }

  return {
    ranAt: now.toISOString(),
    drafter: hasApiKey() ? "claude" : "template",
    created: triggers.reduce((total, t) => total + t.created, 0),
    triggers,
  };
}

async function runOne(
  runner: TriggerRunner,
  ctx: FactContext,
  suppressions: SuppressionIndex,
  drafter: ReturnType<typeof getDrafter>,
  options: RunOptions,
): Promise<TriggerRunSummary> {
  const summary: TriggerRunSummary = {
    triggerType: runner.type,
    considered: 0,
    eligible: 0,
    created: 0,
    suppressed: 0,
    duplicate: 0,
    approvalIds: [],
    ...(options.dryRun ? { candidates: [] } : null),
  };

  const note = (outcome: CandidateOutcome) => summary.candidates?.push(outcome);

  for (const deal of ctx.deals) {
    const facts = runner.build(ctx, deal);
    if (!facts) continue;
    summary.considered += 1;

    if (isSuppressed(suppressions, deal.id, runner.type)) {
      summary.suppressed += 1;
      note({
        dealId: deal.id,
        dealName: deal.name,
        outcome: "suppressed",
        reasons: ["A human skipped this within the last 90 days"],
      });
      continue;
    }

    if (alreadyDrafted(ctx, deal.id, runner.type)) {
      summary.duplicate += 1;
      note({
        dealId: deal.id,
        dealName: deal.name,
        outcome: "duplicate",
        reasons: ["A draft is already pending, or one was created today"],
      });
      continue;
    }

    const evaluation = evaluateTrigger(facts);
    if (!evaluation.eligible) {
      note({
        dealId: deal.id,
        dealName: deal.name,
        outcome: "not-eligible",
        reasons: evaluation.reasons,
      });
      continue;
    }
    summary.eligible += 1;
    note({
      dealId: deal.id,
      dealName: deal.name,
      outcome: "eligible",
      reasons: evaluation.reasons,
    });

    if (options.dryRun) continue;

    const approvalId = await createApproval(facts, evaluation.reasons, drafter);
    summary.created += 1;
    summary.approvalIds.push(approvalId);
  }

  return summary;
}

/**
 * Idempotency. Running the cron twice in one day must not double-draft, and a
 * draft nobody has decided on yet must not be replaced with a fresh one —
 * that would silently discard whatever the queue already showed a human.
 */
function alreadyDrafted(
  ctx: FactContext,
  dealId: string,
  triggerType: TriggerType,
): boolean {
  const existing = ctx.approvalsByDeal.get(dealId) ?? [];
  return existing.some(
    (a) =>
      a.triggerType === triggerType &&
      (a.status === "drafted" || isSameDay(a.createdAt, ctx.now)),
  );
}

async function createApproval(
  facts: TriggerFacts,
  reasons: string[],
  drafter: ReturnType<typeof getDrafter>,
): Promise<string> {
  const presentation = describeTrigger(facts);
  const channel = channelFor(facts.contact);

  const { body, source } = await drafter.draft({
    facts,
    reasons,
    channel,
    sender: DEFAULT_SENDER,
  });

  const id = `apr-${crypto.randomUUID()}`;
  await db.insert(approvals).values({
    id,
    dealId: facts.dealId,
    triggerType: presentation.triggerType,
    title: presentation.title,
    subtitle: presentation.subtitle,
    chip: chipForTrigger(presentation.triggerType),
    channel: channelLabel(facts.contact),
    recipient: recipientLine(facts),
    body,
    reasons,
    footnote: presentation.footnote,
    status: "drafted",
    agentId: presentation.agentId,
  });

  // The board's pulsing AI DRAFTED chip is this flag. It is set by the agent,
  // with agent provenance in the audit trail — no human touched this yet.
  await setAiPending({
    dealId: facts.dealId,
    value: true,
    agentId: presentation.agentId,
  });

  await appendAudit({
    entity: "approval",
    entityId: id,
    action: "approval.drafted",
    agentId: presentation.agentId,
    before: null,
    after: {
      dealId: facts.dealId,
      triggerType: presentation.triggerType,
      channel: channelLabel(facts.contact),
      reasons,
      drafter: source,
    },
  });

  return id;
}

function recipientLine(facts: TriggerFacts): string {
  const { name, address } = facts.contact;
  return address ? `${name} · ${address}` : name;
}
