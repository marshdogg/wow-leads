import { daysBetween, monthYear } from "./dates";
import { humaniseDays, pluralDays } from "./text";
import type {
  EnquiryChannel,
  NeverQuotedFacts,
  TriggerDefinition,
} from "./types";

/**
 * Never quoted.
 *
 * Somebody called, or filled in a form, or stopped at our stand. We took their
 * details. Nothing else happened. No job, no estimate, no number, no loss —
 * just a name that went cold in a column.
 *
 * **The distinction from `revival` is the whole design constraint.** A revival
 * has a quote to reference, a figure to beat and an objection to answer. This
 * has none of that, and every other template in the drafter leans on something
 * these records do not contain:
 *
 *   - the 11-month draft references a completed job
 *   - the revival draft references a price and a cooling period
 *   - the seasonal draft references an offer that was sent
 *
 * Point any of them at Adaeze and you get a confident sentence about work that
 * never happened. So this trigger exists separately, and its reasoning is
 * allowed to reference exactly three things: **when** they got in touch, **how**
 * they got in touch, and the fact that **we never came back with a number**.
 *
 * That last one is stated rather than hidden. Naming the gap — "I do not think
 * we ever got you a proper number" — is more disarming than an opener that
 * pretends fourteen months of silence was a considered nurture strategy.
 */

/**
 * Below this a rep should just call them; it is a live enquiry, not a
 * neglected one, and an agent drafting over the top of a fresh lead is the
 * speed-to-lead problem in a different costume.
 */
export const MIN_UNWORKED_DAYS = 14;

/** How the source maps to the way we actually met them. */
export function enquiryChannelFor(source: string): EnquiryChannel {
  const s = source.toLowerCase();
  if (/show|expo|fair|event/.test(s)) return "event";
  if (/phone|call/.test(s)) return "phone";
  if (/landing|web|form|ads|angi|thumbtack|nextdoor|yelp|lsa/.test(s)) {
    return "web";
  }
  return "unknown";
}

export function evaluateNeverQuoted(facts: NeverQuotedFacts): {
  eligible: boolean;
  reasons: string[];
} {
  const {
    enquiredAt,
    enquiryChannel,
    enquiredAbout,
    unworkedDays,
    everQuoted,
    now,
  } = facts;

  // The one disqualifier that matters. A quote on file makes this a revival,
  // a follow-up or a loss — all of which have better things to say.
  if (everQuoted) {
    return {
      eligible: false,
      reasons: ["A quote exists on this record — it is not a never-quoted lead"],
    };
  }

  // Without a date *or* a channel there is nothing truthful to open with.
  if (!enquiredAt && enquiryChannel === "unknown") {
    return {
      eligible: false,
      reasons: [
        "No enquiry date and no recorded channel — nothing on file to reference",
      ],
    };
  }

  if (unworkedDays === null) {
    return {
      eligible: false,
      reasons: ["Cannot tell how long this has been sitting"],
    };
  }

  if (unworkedDays < MIN_UNWORKED_DAYS) {
    return {
      eligible: false,
      reasons: [
        `Last worked ${pluralDays(unworkedDays)} ago — inside the ${MIN_UNWORKED_DAYS}-day window a rep owns`,
      ],
    };
  }

  const reasons: string[] = [enquiryReason(facts, now)];

  reasons.push("No quote ever went out — there is no number on file to follow up");

  if (enquiredAbout) {
    reasons.push(`Asked about ${enquiredAbout} work — the only scope we captured`);
  } else {
    reasons.push("No scope captured at the enquiry — the first ask has to establish it");
  }

  reasons.push(
    unworkedDays >= 60
      ? `Untouched for ${humaniseDays(unworkedDays)} — well past the point a rep would pick it up unprompted`
      : `Untouched for ${humaniseDays(unworkedDays)}`,
  );

  return { eligible: true, reasons };
}

/**
 * The first bullet, which is also the one the copy is built on. It says only
 * what the record supports: a date when there is one, the channel when there
 * is not, and both when both exist.
 */
function enquiryReason(facts: NeverQuotedFacts, now: Date): string {
  const { enquiredAt, sourceLabel } = facts;
  if (!enquiredAt) {
    return `Enquired via ${sourceLabel} — no date captured on the record`;
  }
  // Same helper as the "untouched" bullet below, so the two agree.
  const days = daysBetween(enquiredAt, now);
  const age = days >= 30 ? ` (${humaniseDays(days)} ago)` : "";
  return `Enquired ${monthYear(enquiredAt)}${age} via ${sourceLabel}`;
}

export const neverQuotedTrigger: TriggerDefinition<NeverQuotedFacts> = {
  type: "never_quoted",
  label: "Never quoted",
  agentId: "agent-remarketing",
  outcome: "draft",
  evaluate: evaluateNeverQuoted,
  title: (f) => `Never quoted · ${f.contact.name}`,
  subtitle: (f) => {
    const when = f.enquiredAt
      ? `Enquired ${monthYear(f.enquiredAt)}`
      : `Enquired via ${f.sourceLabel}`;
    return [when, "never quoted", "Residential Re-marketing"].join(" · ");
  },
  footnote: (f) =>
    `No quote has ever gone to ${f.contact.firstName}. Approving logs the first real approach and sets the next step — there is no prior number to hold us to.`,
};
