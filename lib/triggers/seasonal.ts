import { daysBetween, monthDay, monthDayShort } from "./dates";
import { joinList, pluralDays } from "./text";
import type { SeasonalFacts, TriggerDefinition } from "./types";

/**
 * Seasonal promo follow-up.
 *
 * An offer sitting unanswered with an expiry date on it is the one piece of
 * outreach that is genuinely time-boxed — the deadline is real, so the chase
 * is not nagging. It fires once the send has had a few days to breathe, only
 * while the offer is still live, and only while the expiry is close enough
 * that mentioning it means something.
 *
 * A reply of any kind ends it: the conversation belongs to a human from
 * there.
 */

/** Give a send this long to land before chasing it. */
export const MIN_DAYS_SINCE_SEND = 3;
/** Only chase once the deadline is inside this horizon. */
export const EXPIRY_HORIZON_DAYS = 21;
/**
 * One chase per offer. The send is contact one, the chase is contact two and
 * the last — which is why the card footnote reads "Second and final chase".
 * Past that the deal parks with a retry date rather than being nagged.
 */
export const MAX_CHASES = 1;

export function evaluateSeasonal(facts: SeasonalFacts): {
  eligible: boolean;
  reasons: string[];
} {
  const {
    promoSentAt,
    promoExpiresAt,
    promoStartsAt,
    promoActive,
    replied,
    opened,
    priorJobNotes,
    chasesSent,
    now,
  } = facts;

  if (!promoSentAt || !promoExpiresAt) {
    return {
      eligible: false,
      reasons: ["No promo send date or expiry on the record — nothing to chase"],
    };
  }

  if (!promoActive) {
    return { eligible: false, reasons: ["Promo is no longer active"] };
  }

  if (promoStartsAt && now.getTime() < promoStartsAt.getTime()) {
    return {
      eligible: false,
      reasons: [`Promo window opens ${monthDay(promoStartsAt)} — not yet live`],
    };
  }

  if (replied) {
    return {
      eligible: false,
      reasons: ["They replied to the offer — the conversation belongs to a human"],
    };
  }

  const daysSinceSend = daysBetween(promoSentAt, now);
  if (daysSinceSend < MIN_DAYS_SINCE_SEND) {
    return {
      eligible: false,
      reasons: [
        `Promo sent ${pluralDays(daysSinceSend)} ago — giving it ${pluralDays(MIN_DAYS_SINCE_SEND)} before the first chase`,
      ],
    };
  }

  const daysToExpiry = daysBetween(now, promoExpiresAt);
  if (daysToExpiry <= 0) {
    return {
      eligible: false,
      reasons: [`Offer expired ${monthDay(promoExpiresAt)} — the window has closed`],
    };
  }
  if (daysToExpiry > EXPIRY_HORIZON_DAYS) {
    return {
      eligible: false,
      reasons: [
        `Offer expires in ${pluralDays(daysToExpiry)} — too far out for the deadline to carry weight`,
      ],
    };
  }

  if (chasesSent >= MAX_CHASES) {
    return {
      eligible: false,
      reasons: [
        `Already chased ${pluralTimes(chasesSent)} — the offer is done, the deal parks`,
      ],
    };
  }

  const reasons: string[] = [
    `Promo sent ${pluralDays(daysSinceSend)} ago with no ${opened ? "reply" : "open or reply"}`,
    `Offer expires in ${pluralDays(daysToExpiry)} — the window closes`,
  ];

  if (priorJobNotes.length > 0) {
    reasons.push(`Prior job history: ${priorJobNotes.join(", ")}`);
  }

  return { eligible: true, reasons };
}

export const seasonalTrigger: TriggerDefinition<SeasonalFacts> = {
  type: "seasonal",
  label: "Seasonal promo",
  agentId: "agent-remarketing",
  outcome: "draft",
  evaluate: evaluateSeasonal,
  title: (f) => `Seasonal promo follow-up · ${f.contact.name}`,
  // "15% spring interior offer sent 3 days ago · expires Aug 15"
  subtitle: (f) => {
    const sent = f.promoSentAt
      ? `offer sent ${pluralDays(daysBetween(f.promoSentAt, f.now))} ago`
      : "offer sent";
    const expiry = f.promoExpiresAt
      ? `expires ${monthDayShort(f.promoExpiresAt)}`
      : null;
    return [`${f.promoLabel} ${sent}`, expiry]
      .filter((p): p is string => Boolean(p))
      .join(" · ");
  },
  // "Second and final chase on this offer. If she does not respond the deal
  // parks with a spring 2027 retry."
  footnote: (f) => {
    // The send is contact one, so this chase is contact `chasesSent + 2`.
    const ordinal = ORDINALS[Math.min(f.chasesSent + 1, ORDINALS.length - 1)];
    const final = f.chasesSent + 1 >= MAX_CHASES ? " and final" : "";
    const they = f.contact.pronoun ?? "they";
    const verb = they === "they" ? "do" : "does";
    const park = f.parkRetryLabel
      ? `the deal parks with a ${f.parkRetryLabel} retry`
      : "the deal parks with a retry date";
    return `${ordinal}${final} chase on this offer. If ${they} ${verb} not respond ${park}.`;
  },
};

const ORDINALS = ["First", "Second", "Third", "Fourth", "Fifth"] as const;

function pluralTimes(n: number): string {
  return n === 1 ? "once" : `${n} times`;
}

/** Areas the offer covers, for the drafted copy. Empty when the record has none. */
export function coveredAreas(facts: SeasonalFacts): string {
  return joinList(facts.scopeAreas);
}
