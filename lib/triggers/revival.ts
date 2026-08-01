import { monthsBetween, monthYear } from "./dates";
import { lowerFirst, pluralMonths } from "./text";
import type { RevivalFacts, TriggerDefinition } from "./types";

/**
 * Revival.
 *
 * A deal lost on *price* is a different animal from one lost on quality,
 * timing or trust: the customer wanted the work and could not make the
 * number work. Six months later their budget has moved, our schedule has
 * moved, and the scope is usually still sitting there undone.
 *
 * The cooling period is the whole point. Chasing a price objection at three
 * months reads as desperation; at six it reads as a new offer. And if anyone
 * has spoken to them since the loss, the revival is already happening
 * without an agent.
 */

/** How long a price objection has to cool before it is worth reopening. */
export const COOLING_MONTHS = 6;

/** Objections a revival can address. Quality and trust losses are not these. */
const PRICE_OBJECTIONS = ["price", "cost", "budget", "too expensive", "quote"];

export function isPriceObjection(reason: string | null): boolean {
  if (!reason) return false;
  const normalised = reason.toLowerCase();
  return PRICE_OBJECTIONS.some((term) => normalised.includes(term));
}

export function evaluateRevival(facts: RevivalFacts): {
  eligible: boolean;
  reasons: string[];
} {
  const { lostAt, lostReason, originalValue, originalScope, lastContactAt, now } =
    facts;

  if (!lostAt) {
    return {
      eligible: false,
      reasons: ["No loss date on the record — cannot date the cooling period"],
    };
  }

  if (!isPriceObjection(lostReason)) {
    return {
      eligible: false,
      reasons: [
        lostReason
          ? `Lost on ${lowerFirst(lostReason)}, not price — a discount is not the answer`
          : "No objection recorded on the loss — nothing for a revival to address",
      ],
    };
  }

  const monthsSinceLoss = monthsBetween(lostAt, now);
  if (monthsSinceLoss < COOLING_MONTHS) {
    const remaining = COOLING_MONTHS - monthsSinceLoss;
    return {
      eligible: false,
      reasons: [
        `Lost ${pluralMonths(monthsSinceLoss)} ago — ${pluralMonths(remaining)} of the ${COOLING_MONTHS}-month cooling period still to run`,
      ],
    };
  }

  if (lastContactAt && lastContactAt.getTime() > lostAt.getTime()) {
    return {
      eligible: false,
      reasons: [
        `Contacted ${monthYear(lastContactAt)}, after the loss was logged — the revival is already in progress`,
      ],
    };
  }

  const reasons: string[] = [
    `Lost ${pluralMonths(monthsSinceLoss)} ago — the ${COOLING_MONTHS}-month cooling period is complete`,
    originalValue
      ? `Lost on price at ${originalValue} — a price objection on file, not scope or quality`
      : "Lost on price — a price objection on file, not scope or quality",
    `Original scope never done: ${lowerFirst(originalScope)}`,
    `No contact since the loss was logged in ${monthYear(lostAt)}`,
  ];

  return { eligible: true, reasons };
}

export const revivalTrigger: TriggerDefinition<RevivalFacts> = {
  type: "revival",
  label: "Revival",
  agentId: "agent-remarketing",
  evaluate: evaluateRevival,
  title: (f) => `Revival · ${f.contact.name}`,
  subtitle: (f) => {
    const lost = f.lostAt
      ? `Lost ${pluralMonths(monthsBetween(f.lostAt, f.now))} ago on price`
      : "Lost on price";
    return [lost, f.originalValue, "Residential Re-marketing"]
      .filter((p): p is string => Boolean(p))
      .join(" · ");
  },
  footnote: (f) =>
    `Cooling period is the whole mechanism — approving restarts the clock on ${f.contact.firstName}. Skipping holds the revival for another 90 days.`,
};
