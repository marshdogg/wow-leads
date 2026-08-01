import { db } from "@/db";
import { approvals } from "@/db/schema";
import { channelFor, channelLabel, getDrafter, hasApiKey } from "@/lib/agents/drafter";
import { DEFAULT_SENDER, type DraftSource } from "@/lib/agents/types";
import { appendAudit } from "@/lib/repositories/audit";
import {
  markCanvassTarget,
  setAiPending,
  setNextAction,
} from "@/lib/repositories/deals";
import { logTouchpoint } from "@/lib/repositories/touchpoints";
import type { TriggerType } from "@/lib/types";
import { isSameDay, startOfDay } from "./dates";
import {
  elevenMonthFacts,
  loadFactContext,
  neighbourCampaignFacts,
  revivalFacts,
  seasonalFacts,
  sequenceFacts,
  speedToLeadFacts,
  type DealRow,
  type FactContext,
} from "./fact-source";
import {
  chipForTrigger,
  describeTrigger,
  escalationNextAction,
  escalationNote,
  evaluateTrigger,
  outcomeFor,
  severityFor,
} from "./index";
import {
  ESCALATION_ACTION,
  isSuppressed,
  loadEscalations,
  loadSuppressions,
  type EscalationRecord,
  type SuppressionIndex,
} from "./suppression";
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

/**
 * One deal can yield more than one candidate: a completed job produces one
 * neighbour draft per address on its canvass list, each approvable on its
 * own. Builders that produce at most one return a single-element array.
 */
type FactBuilder = (ctx: FactContext, deal: DealRow) => TriggerFacts[];

interface TriggerRunner {
  type: TriggerType;
  build: FactBuilder;
}

/** Lift a one-per-deal builder into the many-per-deal shape. */
function one<F extends TriggerFacts>(
  build: (ctx: FactContext, deal: DealRow) => F | null,
): FactBuilder {
  return (ctx, deal) => {
    const facts = build(ctx, deal);
    return facts ? [facts] : [];
  };
}

const RUNNERS: TriggerRunner[] = [
  { type: "eleven_month", build: one(elevenMonthFacts) },
  { type: "seasonal", build: one(seasonalFacts) },
  { type: "revival", build: one(revivalFacts) },
  { type: "sequence", build: one(sequenceFacts) },
  { type: "speed_to_lead", build: one(speedToLeadFacts) },
  // The only many-per-deal builder: one draft per canvassed address.
  { type: "neighbour_campaign", build: neighbourCampaignFacts },
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

  // Only today's escalations matter for de-duplication, and the cron runs
  // daily — no need to read the whole history.
  const escalations = await loadEscalations(
    ctx.deals.map((d) => d.id),
    startOfDay(now),
  );

  const drafter = getDrafter();
  const triggers: TriggerRunSummary[] = [];

  for (const runner of RUNNERS) {
    triggers.push(
      await runOne(runner, ctx, suppressions, escalations, drafter, options),
    );
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
  escalations: Map<string, EscalationRecord[]>,
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

  for (const deal of ctx.deals) {
    // One deal, potentially several candidates — a completed job canvasses
    // each neighbouring address separately.
    for (const facts of runner.build(ctx, deal)) {
      summary.considered += 1;

      const note = (
        outcome: CandidateOutcome["outcome"],
        reasons: string[],
      ) =>
        summary.candidates?.push({
          dealId: deal.id,
          dealName: candidateLabel(facts, deal.name),
          outcome,
          reasons,
        });

      if (isSuppressed(suppressions, deal.id, runner.type)) {
        summary.suppressed += 1;
        note("suppressed", ["A human skipped this within the last 90 days"]);
        continue;
      }

      if (alreadyHandled(ctx, escalations, facts, runner.type)) {
        summary.duplicate += 1;
        note("duplicate", [
          "Already drafted or escalated — pending, or handled today",
        ]);
        continue;
      }

      const evaluation = evaluateTrigger(facts);
      if (!evaluation.eligible) {
        note("not-eligible", evaluation.reasons);
        continue;
      }

      summary.eligible += 1;
      note("eligible", evaluation.reasons);

      if (options.dryRun) continue;

      // The branch the whole `outcome` discriminator exists for. An
      // escalation must never reach the approvals table: the Approvals
      // screen's promise is that everything in it is something that would
      // send to a customer.
      if (outcomeFor(runner.type) === "escalate") {
        await escalate(facts, evaluation.reasons);
        summary.created += 1;
        continue;
      }

      const approvalId = await createApproval(facts, evaluation.reasons, drafter);
      summary.created += 1;
      summary.approvalIds.push(approvalId);
    }
  }

  return summary;
}

/** What to call this candidate in the dry-run report. */
function candidateLabel(facts: TriggerFacts, dealName: string): string {
  return facts.kind === "neighbour_campaign"
    ? `${dealName} → ${facts.neighbourAddress}`
    : dealName;
}

/**
 * Idempotency.
 *
 * Running the cron twice in one day must not double up, and a draft nobody
 * has decided on yet must not be replaced with a fresh one — that would
 * silently discard whatever the queue already showed a human.
 *
 * The identity is per *candidate*, not per deal. A completed job canvasses
 * several addresses, and each is its own decision, so keying on the deal
 * alone would draft the first neighbour and silently skip the rest.
 */
function alreadyHandled(
  ctx: FactContext,
  escalations: Map<string, EscalationRecord[]>,
  facts: TriggerFacts,
  triggerType: TriggerType,
): boolean {
  if (outcomeFor(triggerType) === "escalate") {
    return (escalations.get(facts.dealId) ?? []).some(
      (e) => e.triggerType === triggerType && isSameDay(e.at, ctx.now),
    );
  }

  const identity = candidateIdentity(facts);
  return (ctx.approvalsByDeal.get(facts.dealId) ?? []).some(
    (a) =>
      a.triggerType === triggerType &&
      (identity === null || a.recipient.includes(identity)) &&
      (a.status === "drafted" || isSameDay(a.createdAt, ctx.now)),
  );
}

/**
 * What distinguishes one candidate from another within the same deal and
 * trigger. Null means the deal itself is the identity, which is true for
 * every trigger except the neighbour campaign.
 */
function candidateIdentity(facts: TriggerFacts): string | null {
  return facts.kind === "neighbour_campaign" ? facts.neighbourAddress : null;
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

  // Advance the canvass target so the Record screen stops showing the address
  // as unworked the moment a draft exists for it.
  if (facts.kind === "neighbour_campaign") {
    await markCanvassTarget({
      targetId: facts.canvassTargetId,
      status: "drafted",
      agentId: presentation.agentId,
    });
  }

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

/**
 * Who the approval card says this is going to.
 *
 * A canvassed address has no contact on file, so the name is empty and the
 * recipient is the address alone — joining unconditionally produced
 * " · 2306 Tunlaw Rd NW", which read badly on the card and, worse, stopped
 * the address matching its `canvass_targets` row when the decision came in.
 */
function recipientLine(facts: TriggerFacts): string {
  const { name, address } = facts.contact;
  return [name, address].filter((part) => part.trim().length > 0).join(" · ");
}

/* -------------------------------------------------------------------------
   Escalation — the path that never reaches the Approvals queue
   ------------------------------------------------------------------------- */

/**
 * Tell us, not the customer.
 *
 * Writes three things and deliberately not a fourth:
 *   - a TRIGGER touchpoint, so the alert appears on the lead's timeline with
 *     agent provenance,
 *   - an audit event, which is also what makes the alert idempotent,
 *   - an urgent next action on the lead, so it surfaces on the rep's board.
 *
 * It does **not** touch `ai_pending`. That flag means "an unapproved AI draft
 * is waiting for you", and lighting it here would put an AI DRAFTED chip on a
 * card that has no draft behind it — a promise of something to approve that
 * does not exist.
 */
async function escalate(facts: TriggerFacts, reasons: string[]): Promise<void> {
  if (facts.kind !== "speed_to_lead") {
    throw new Error(
      `escalate() called for ${facts.kind}, which is not an escalation trigger.`,
    );
  }

  const presentation = describeTrigger(facts);
  const agentId = presentation.agentId;

  await logTouchpoint({
    dealId: facts.dealId,
    channel: "TRIGGER",
    body: escalationNote(facts),
    agentId,
    structured: [
      { label: "SEVERITY", value: severityFor(facts).toUpperCase() },
      { label: "SOURCE", value: facts.source },
      { label: "OWNER", value: facts.ownerName },
    ],
  });

  // Surface it where the rep actually looks. Overdue, not "ok" — a breached
  // SLA is already late by definition, and a green next-action block would
  // say the opposite of what happened.
  await setNextAction({
    dealId: facts.dealId,
    label: escalationNextAction(facts),
    due: severityFor(facts) === "breach" ? "Overdue — call now" : "Due now",
    state: "overdue",
    dueAt: facts.now,
    agentId,
  });

  await appendAudit({
    entity: "deal",
    entityId: facts.dealId,
    action: ESCALATION_ACTION,
    agentId,
    before: null,
    after: {
      triggerType: presentation.triggerType,
      severity: severityFor(facts),
      reasons,
    },
  });
}
