import type { TriggerType } from "@/lib/types";
import { elevenMonthTrigger } from "./eleven-month";
import { revivalTrigger } from "./revival";
import { seasonalTrigger } from "./seasonal";
import { sequenceTrigger } from "./sequence";
import {
  AGENT_NAMES,
  CHIP_SEQUENCE,
  CHIP_TRIGGER,
  type AgentId,
  type TriggerEvaluation,
  type TriggerFacts,
} from "./types";

export * from "./types";
export { elevenMonthTrigger, evaluateElevenMonth } from "./eleven-month";
export { revivalTrigger, evaluateRevival, isPriceObjection } from "./revival";
export { seasonalTrigger, evaluateSeasonal } from "./seasonal";
export { sequenceTrigger, evaluateSequence, stepDueAt } from "./sequence";

/**
 * Trigger dispatch.
 *
 * The four trigger modules are pure and independent; this is the only place
 * that knows all four exist. Everything downstream — drafting, the cron
 * runner, the approvals UI — goes through these functions and never
 * switches on trigger type itself.
 */

/** The full set, in the order the Triggers-live stat card lists them. */
export const TRIGGER_TYPES: TriggerType[] = [
  "eleven_month",
  "seasonal",
  "revival",
  "sequence",
];

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  eleven_month: elevenMonthTrigger.label,
  seasonal: seasonalTrigger.label,
  revival: revivalTrigger.label,
  sequence: sequenceTrigger.label,
};

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
  }
}

export interface TriggerPresentation {
  triggerType: TriggerType;
  agentId: AgentId;
  agentName: string;
  title: string;
  subtitle: string;
  footnote: string;
  chip: string;
}

export function describeTrigger(facts: TriggerFacts): TriggerPresentation {
  const base = (() => {
    switch (facts.kind) {
      case "eleven_month":
        return {
          triggerType: elevenMonthTrigger.type,
          agentId: elevenMonthTrigger.agentId,
          title: elevenMonthTrigger.title(facts),
          subtitle: elevenMonthTrigger.subtitle(facts),
          footnote: elevenMonthTrigger.footnote(facts),
        };
      case "seasonal":
        return {
          triggerType: seasonalTrigger.type,
          agentId: seasonalTrigger.agentId,
          title: seasonalTrigger.title(facts),
          subtitle: seasonalTrigger.subtitle(facts),
          footnote: seasonalTrigger.footnote(facts),
        };
      case "revival":
        return {
          triggerType: revivalTrigger.type,
          agentId: revivalTrigger.agentId,
          title: revivalTrigger.title(facts),
          subtitle: revivalTrigger.subtitle(facts),
          footnote: revivalTrigger.footnote(facts),
        };
      case "sequence":
        return {
          triggerType: sequenceTrigger.type,
          agentId: sequenceTrigger.agentId,
          title: sequenceTrigger.title(facts),
          subtitle: sequenceTrigger.subtitle(facts),
          footnote: sequenceTrigger.footnote(facts),
        };
    }
  })();

  return {
    ...base,
    agentName: AGENT_NAMES[base.agentId],
    chip: chipForTrigger(base.triggerType),
  };
}

/**
 * Which chip the card wears.
 *
 * The 11-month and revival triggers react to an event on the record and the
 * runner creates their draft on the day they fire, so those cards genuinely
 * read "fired today". Seasonal chases and sequence steps are scheduled work
 * inside a programme that was already running — they get the quieter chip.
 */
export function chipForTrigger(type: TriggerType): string {
  return type === "eleven_month" || type === "revival"
    ? CHIP_TRIGGER
    : CHIP_SEQUENCE;
}
