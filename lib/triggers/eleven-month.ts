import { monthsBetween, monthYear, monthYearShort } from "./dates";
import { countWord, joinList, latencyPhrase, pluralMonths } from "./text";
import type { ElevenMonthFacts, TriggerDefinition } from "./types";

/**
 * 11-month warranty touchpoint.
 *
 * A WOW job carries a one-year warranty. Eleven months out is the moment to
 * offer the inspection: the customer still remembers the crew, the warranty
 * is still live, and any touch-up work can be scoped before it expires.
 *
 * It fires only if nobody has spoken to them since the completion follow-up.
 * A rep who already called this month does not need an agent texting over
 * the top of them.
 */

/** Warranty inspection window opens at 11 months. */
export const WINDOW_OPENS_MONTHS = 11;
/** And closes at 13 — past the warranty expiry the pitch is a different one. */
export const WINDOW_CLOSES_MONTHS = 13;

export function evaluateElevenMonth(facts: ElevenMonthFacts): {
  eligible: boolean;
  reasons: string[];
} {
  const { jobCompletedAt, completionFollowUpAt, lastContactAt, scope, replies, now } =
    facts;

  if (!jobCompletedAt) {
    return {
      eligible: false,
      reasons: ["No completion date on the record — cannot date the warranty window"],
    };
  }

  const monthsSinceJob = monthsBetween(jobCompletedAt, now);

  if (monthsSinceJob < WINDOW_OPENS_MONTHS) {
    const away = WINDOW_OPENS_MONTHS - monthsSinceJob;
    return {
      eligible: false,
      reasons: [
        `Job completed ${pluralMonths(monthsSinceJob)} ago — warranty-inspection window opens in ${pluralMonths(away)}`,
      ],
    };
  }

  if (monthsSinceJob >= WINDOW_CLOSES_MONTHS) {
    return {
      eligible: false,
      reasons: [
        `Job completed ${pluralMonths(monthsSinceJob)} ago — past the warranty-inspection window`,
      ],
    };
  }

  // The completion follow-up is the expected last touch. Anything after it is
  // a live conversation the agent must not talk over.
  const since = completionFollowUpAt ?? jobCompletedAt;
  if (lastContactAt && lastContactAt.getTime() > since.getTime()) {
    return {
      eligible: false,
      reasons: [
        `Contacted ${monthYear(lastContactAt)}, after the completion follow-up — a human is already on this`,
      ],
    };
  }

  const reasons: string[] = [
    `Job completed ${pluralMonths(monthsSinceJob)} ago — inside the warranty-inspection window`,
    completionFollowUpAt
      ? `No contact since the completion follow-up in ${monthYear(completionFollowUpAt)}`
      : `No contact logged since the job completed in ${monthYear(jobCompletedAt)}`,
  ];

  if (scope.areas.length > 0) {
    const verb = scope.areas.length === 1 ? "was" : "were";
    reasons.push(
      `High-traffic ${scope.workType} scope: ${joinList(scope.areas)} ${verb} in the original job`,
    );
  }

  // Why this channel, in whichever form the record can actually support.
  if (replies.note) {
    reasons.push(`Prefers ${facts.contact.prefers}; ${replies.note}`);
  } else if (replies.count > 0 && replies.medianMinutes !== null) {
    reasons.push(
      `Prefers ${facts.contact.prefers}; last ${countWord(replies.count)} replies came ${latencyPhrase(replies.medianMinutes)}`,
    );
  } else {
    reasons.push(
      `Prefers ${facts.contact.prefers} — channel taken from the contact record`,
    );
  }

  return { eligible: true, reasons };
}

export const elevenMonthTrigger: TriggerDefinition<ElevenMonthFacts> = {
  type: "eleven_month",
  label: "11-month warranty",
  agentId: "agent-remarketing",
  evaluate: evaluateElevenMonth,
  title: (f) => `11-Month Touchpoint · ${f.contact.name}`,
  // "Interior repaint completed Aug 2025 · $8,400 · Residential Re-marketing"
  subtitle: (f) => {
    const head = f.jobCompletedAt
      ? `${f.scope.summary} completed ${monthYearShort(f.jobCompletedAt)}`
      : f.scope.summary;
    return [head, f.scope.value, "Residential Re-marketing"]
      .filter((p): p is string => Boolean(p))
      .join(" · ");
  },
  footnote: (f) =>
    `Nothing sends until you approve. Approving logs the send against ${f.contact.firstName} with agent provenance and sets the next step.`,
};
