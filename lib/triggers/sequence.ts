import { addDays, daysBetween } from "./dates";
import { joinList, pluralDays } from "./text";
import type { SequenceFacts, TriggerDefinition } from "./types";

/**
 * Sequence step.
 *
 * The Biz Dev pipeline runs multi-touch sequences — the Commercial 4-touch is
 * the canonical one. Unlike the other three triggers there is no event to
 * react to: the sequence itself is the schedule, and this trigger just asks
 * whether the next step has come due.
 *
 * It is the one trigger that is not "same day" in the human sense, which is
 * why its card carries the SEQUENCE STEP chip rather than TRIGGER FIRED TODAY.
 */

/** When the next step is due, given where the sequence currently stands. */
export function stepDueAt(facts: SequenceFacts): Date | null {
  const anchor = facts.previousStepAt ?? facts.sequenceStartedAt;
  if (!anchor) return null;
  return addDays(anchor, facts.delayDays);
}

export function evaluateSequence(facts: SequenceFacts): {
  eligible: boolean;
  reasons: string[];
} {
  const {
    sequenceName,
    stepNumber,
    totalSteps,
    dayInSequence,
    completed,
    accountTags,
    bestFitTags,
    reference,
    now,
  } = facts;

  if (completed) {
    return {
      eligible: false,
      reasons: [`${sequenceName} is complete — no step left to send`],
    };
  }

  if (stepNumber < 1 || stepNumber > totalSteps) {
    return {
      eligible: false,
      reasons: [
        `Step ${stepNumber} is outside the ${totalSteps}-step ${sequenceName} sequence`,
      ],
    };
  }

  const dueAt = stepDueAt(facts);
  if (!dueAt) {
    return {
      eligible: false,
      reasons: ["Sequence has no start date — cannot schedule the next step"],
    };
  }

  if (now.getTime() < dueAt.getTime()) {
    const wait = daysBetween(now, dueAt);
    return {
      eligible: false,
      reasons: [
        `Step ${stepNumber} of ${totalSteps} is not due for ${pluralDays(Math.max(wait, 1))}`,
      ],
    };
  }

  const reasons: string[] = [
    `Day ${dayInSequence} of the ${sequenceName} sequence`,
  ];

  const matched = accountTags.filter((tag) => bestFitTags.includes(tag));
  if (matched.length > 0) {
    reasons.push(
      `Account tagged ${joinList(matched)} — matches our best-fit profile`,
    );
  }

  if (reference) {
    reasons.push(
      `Adjacent ${reference.relation} (${reference.name}) already an active account — usable reference`,
    );
  }

  return { eligible: true, reasons };
}

export const sequenceTrigger: TriggerDefinition<SequenceFacts> = {
  type: "sequence",
  label: "Sequence step",
  agentId: "agent-prospecting",
  outcome: "draft",
  evaluate: evaluateSequence,
  title: (f) => `Sequence step ${f.stepNumber} · ${f.contact.name}`,
  // "Northgate Development · Commercial 4-touch · Biz Dev"
  subtitle: (f) => [f.accountName, f.sequenceName, "Biz Dev"].join(" · "),
  // "Day 3 phone call and Day 7 packet drop generate automatically once this sends."
  footnote: (f) => {
    const next = f.upcomingStepLabels.slice(0, 2);
    if (next.length === 0) {
      return `Last step of the ${f.sequenceName}. If this one lands the lead hands off to Commercial.`;
    }
    const verb = next.length === 1 ? "generates" : "generate";
    return `${joinList(next)} ${verb} automatically once this sends.`;
  },
};
