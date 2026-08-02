import { monthsBetween, monthYear } from "./dates";
import { lowerFirst, pluralMonths } from "./text";
import type { LostReason } from "@/lib/types";
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
 *
 * **This selects on `lostReason`, a structured column, and nothing else.**
 * The PRD specced re-engaging deals lost on price and there was no such field,
 * so the first version matched substrings — "price", "cost", "budget" — against
 * whatever a rep had typed into a `LOST FOR` card metric. That is a headline
 * automation resting on free text: "we went with a cheaper crew" is a
 * competitor loss that reads as a price objection, and "priced out of our
 * timeline" is a timing loss containing the word. There is deliberately no
 * fallback to the old inference. Two ways of deciding the same thing is the
 * arrangement this codebase keeps removing.
 */

/** How long a price objection has to cool before it is worth reopening. */
export const COOLING_MONTHS = 6;

/**
 * How each objection reads mid-sentence, for the bullet that explains why a
 * revival did *not* fire. A `Record` rather than a lookup with a default, so
 * adding a reason to `LostReason` fails the build here rather than silently
 * rendering the enum value into a sentence it does not fit.
 */
const OBJECTION_PHRASE: Record<LostReason, string> = {
  "not interested": "lack of interest",
  unqualified: "the lead not qualifying",
  price: "price",
  timing: "timing",
  competitor: "a competitor",
  "no response": "no response",
  other: "a reason nobody recorded",
};

export function evaluateRevival(facts: RevivalFacts): {
  eligible: boolean;
  reasons: string[];
} {
  const { lostAt, lostReason, originalValue, originalScope, lastContactAt, now } =
    facts;

  if (lostReason !== "price") {
    return {
      eligible: false,
      reasons: [
        lostReason
          ? `Lost on ${OBJECTION_PHRASE[lostReason]}, not price — a discount is not the answer`
          : "No objection recorded on the loss — nothing for a revival to address",
      ],
    };
  }

  if (!lostAt) {
    return {
      eligible: false,
      // A lost deal is supposed to carry both; one without the other is a data
      // defect, not a state, so it says so rather than guessing a date.
      reasons: ["No loss date on the record — cannot date the cooling period"],
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
  outcome: "draft",
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
