import type { TriggerType } from "@/lib/types";
import { elevenMonthTrigger } from "./eleven-month";
import { neighbourCampaignTrigger } from "./neighbour-campaign";
import { neverQuotedTrigger } from "./never-quoted";
import { revivalTrigger } from "./revival";
import { seasonalTrigger } from "./seasonal";
import { sequenceTrigger } from "./sequence";
import { speedToLeadTrigger } from "./speed-to-lead";
import {
  AGENT_NAMES,
  CHIP_SEQUENCE,
  CHIP_TRIGGER,
  type AgentId,
  type TriggerEvaluation,
  type TriggerFacts,
  type TriggerOutcome,
} from "./types";

export * from "./types";
export { elevenMonthTrigger, evaluateElevenMonth } from "./eleven-month";
export { revivalTrigger, evaluateRevival } from "./revival";
export { seasonalTrigger, evaluateSeasonal } from "./seasonal";
export { sequenceTrigger, evaluateSequence, stepDueAt } from "./sequence";
export {
  speedToLeadTrigger,
  evaluateSpeedToLead,
  escalationNextAction,
  escalationNote,
  isPaidSource,
  severityFor,
  ESCALATE_MINUTES,
  WARN_MINUTES,
} from "./speed-to-lead";
export {
  neighbourCampaignTrigger,
  evaluateNeighbourCampaign,
  CREW_WINDOW_DAYS,
} from "./neighbour-campaign";
export {
  neverQuotedTrigger,
  evaluateNeverQuoted,
  enquiryChannelFor,
  MIN_UNWORKED_DAYS,
} from "./never-quoted";

/**
 * Trigger dispatch.
 *
 * The six trigger modules are pure and independent; this is the only place
 * that knows all six exist. Everything downstream — drafting, the cron
 * runner, the approvals UI — goes through these functions and never switches
 * on trigger type itself.
 *
 * The switches below are deliberately exhaustive rather than a lookup table.
 * A `Record<TriggerType, TriggerDefinition<…>>` cannot express "this
 * definition takes exactly the facts variant whose `kind` selected it"
 * without a cast, and a cast here would silently accept a mismatched pair.
 * The verbosity buys a compiler error at every call site the day a seventh
 * trigger lands — which is exactly how the two New Leads triggers got wired.
 */

/** The full set, in the order the Triggers-live stat card lists them. */
export const TRIGGER_TYPES: TriggerType[] = [
  "eleven_month",
  "seasonal",
  "revival",
  "sequence",
  "speed_to_lead",
  "neighbour_campaign",
  "never_quoted",
];

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  eleven_month: elevenMonthTrigger.label,
  seasonal: seasonalTrigger.label,
  revival: revivalTrigger.label,
  sequence: sequenceTrigger.label,
  speed_to_lead: speedToLeadTrigger.label,
  neighbour_campaign: neighbourCampaignTrigger.label,
  never_quoted: neverQuotedTrigger.label,
};

/**
 * Whether firing this trigger reaches a customer or only reaches us. The
 * runner branches on it; see `TriggerOutcome` for why it is a value rather
 * than a comment.
 */
export const TRIGGER_OUTCOMES: Record<TriggerType, TriggerOutcome> = {
  eleven_month: elevenMonthTrigger.outcome,
  seasonal: seasonalTrigger.outcome,
  revival: revivalTrigger.outcome,
  sequence: sequenceTrigger.outcome,
  speed_to_lead: speedToLeadTrigger.outcome,
  neighbour_campaign: neighbourCampaignTrigger.outcome,
  never_quoted: neverQuotedTrigger.outcome,
};

export function outcomeFor(type: TriggerType): TriggerOutcome {
  return TRIGGER_OUTCOMES[type];
}

export function evaluateTrigger(facts: TriggerFacts): TriggerEvaluation {
  switch (facts.kind) {
    case "eleven_month":
      return elevenMonthTrigger.evaluate(facts);
    case "seasonal":
      return seasonalTrigger.evaluate(facts);
    case "revival":
      return revivalTrigger.evaluate(facts);
    case "sequence":
      return sequenceTrigger.evaluate(facts);
    case "speed_to_lead":
      return speedToLeadTrigger.evaluate(facts);
    case "neighbour_campaign":
      return neighbourCampaignTrigger.evaluate(facts);
    case "never_quoted":
      return neverQuotedTrigger.evaluate(facts);
  }
}

export interface TriggerPresentation {
  triggerType: TriggerType;
  agentId: AgentId;
  agentName: string;
  outcome: TriggerOutcome;
  title: string;
  subtitle: string;
  footnote: string;
  chip: string;
}

export function describeTrigger(facts: TriggerFacts): TriggerPresentation {
  const base = (() => {
    switch (facts.kind) {
      case "eleven_month":
        return present(elevenMonthTrigger, facts);
      case "seasonal":
        return present(seasonalTrigger, facts);
      case "revival":
        return present(revivalTrigger, facts);
      case "sequence":
        return present(sequenceTrigger, facts);
      case "speed_to_lead":
        return present(speedToLeadTrigger, facts);
      case "neighbour_campaign":
        return present(neighbourCampaignTrigger, facts);
      case "never_quoted":
        return present(neverQuotedTrigger, facts);
    }
  })();

  return {
    ...base,
    agentName: AGENT_NAMES[base.agentId],
    chip: chipForTrigger(base.triggerType),
  };
}

/** Shared shape-builder, so each switch arm above stays one line. */
function present<F extends TriggerFacts>(
  definition: {
    type: TriggerType;
    agentId: AgentId;
    outcome: TriggerOutcome;
    title: (facts: F) => string;
    subtitle: (facts: F) => string;
    footnote: (facts: F) => string;
  },
  facts: F,
) {
  return {
    triggerType: definition.type,
    agentId: definition.agentId,
    outcome: definition.outcome,
    title: definition.title(facts),
    subtitle: definition.subtitle(facts),
    footnote: definition.footnote(facts),
  };
}

/**
 * Which chip the card wears.
 *
 * Triggers that react to an event on the record — a job hitting 11 months, a
 * cooling period completing, a crew finishing a house — have their draft
 * created on the day they fire, so those cards genuinely read "fired today".
 * Seasonal chases and sequence steps are scheduled work inside a programme
 * that was already running, and get the quieter chip.
 *
 * `speed_to_lead` never reaches a card; it is listed so the function stays
 * total over `TriggerType`.
 */
export function chipForTrigger(type: TriggerType): string {
  switch (type) {
    case "eleven_month":
    case "revival":
    case "neighbour_campaign":
    case "speed_to_lead":
      return CHIP_TRIGGER;
    case "seasonal":
    case "sequence":
    // A never-quoted record has been eligible for months; nothing happened
    // today except that we finally looked. The quieter chip is the honest one.
    case "never_quoted":
      return CHIP_SEQUENCE;
  }
}
