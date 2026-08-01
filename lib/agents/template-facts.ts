import {
  completionPhrase,
  monthDay,
  monthName,
  nextWeekdaySlot,
  recentSendPhrase,
  seasonName,
  weekdayName,
} from "@/lib/triggers/dates";
import { proximityClause } from "@/lib/triggers/record-parse";
import { joinList, lowerFirst, unpunctuated } from "@/lib/triggers/text";
import type { TriggerFacts } from "@/lib/triggers/types";
import type { TemplateFacts } from "@/lib/templates/types";
import type { Sender } from "./types";

/**
 * Record facts, flattened into the tokens a template can interpolate.
 *
 * This is the seam that makes franchise-authored copy safe. A token is present
 * only when the record genuinely supports it — never an empty string, never a
 * placeholder — because `factsSatisfy` reads absence as "this template is not
 * eligible for this record". Returning `""` for a missing room list would turn
 * that guard off and let "touch up the  zones" reach a customer.
 *
 * So the rule here is the same one the reasoning bullets follow, enforced one
 * layer lower: if the record does not know it, the token is null.
 */
export function buildTemplateFacts(
  facts: TriggerFacts,
  sender: Sender,
): TemplateFacts {
  return {
    "contact.firstName": blankToNull(facts.contact.firstName),
    "sender.firstName": sender.firstName,
    "sender.company": sender.company,
    ...perTrigger(facts),
  };
}

function perTrigger(facts: TriggerFacts): TemplateFacts {
  switch (facts.kind) {
    case "eleven_month":
      return {
        "job.workType": blankToNull(facts.scope.workType),
        "job.completedMonth": facts.jobCompletedAt
          ? completionPhrase(facts.jobCompletedAt, facts.now)
          : null,
        "job.areas": facts.scope.areas.length
          ? joinList(facts.scope.areas)
          : null,
      };

    case "seasonal": {
      // "we sent Monday" and "hold a Monday slot" in one message reads like a
      // template, so the offered slot steps a day when the two collide.
      let slot = nextWeekdaySlot(facts.now);
      if (facts.promoSentAt && slot.getDay() === facts.promoSentAt.getDay()) {
        slot = nextWeekdaySlot(facts.now, 4);
      }
      return {
        "promo.label": blankToNull(facts.promoShortLabel),
        "promo.sentWhen": facts.promoSentAt
          ? recentSendPhrase(facts.promoSentAt, facts.now)
          : null,
        "promo.expires": facts.promoExpiresAt
          ? monthDay(facts.promoExpiresAt)
          : null,
        "promo.slot": weekdayName(slot),
        "job.areas": facts.scopeAreas.length ? joinList(facts.scopeAreas) : null,
        "job.completedMonth": facts.priorJobPhrase,
      };
    }

    case "revival":
      return {
        "loss.scope": blankToNull(lowerFirst(unpunctuated(facts.originalScope))),
        "loss.value": facts.originalValue,
        "loss.month": facts.lostAt ? monthName(facts.lostAt) : null,
        season: seasonName(facts.now),
      };

    case "sequence":
      return {
        "prospect.firstName": blankToNull(facts.contact.firstName),
        "prospect.company": blankToNull(facts.accountShortName),
        // `account.workType`, not `job.workType`. A cold prospect has no
        // completed job, so supplying the tag under the job token made the
        // same name mean two things — and the registry says job-derived, so
        // it was the tag arriving under a description that denied it.
        "account.workType": blankToNull(facts.workType),
        "reference.proof": facts.reference?.proof ?? null,
      };

    case "neighbour_campaign":
      return {
        "job.workType": blankToNull(facts.scope.workType),
        "job.address": blankToNull(facts.jobAddress),
        "neighbour.proximity": facts.proximity
          ? proximityClause(facts.proximity)
          : null,
        // Only while they are actually still there.
        "crew.until":
          facts.crewOnSiteUntil &&
          facts.crewOnSiteUntil.getTime() >= facts.now.getTime()
            ? weekdayName(facts.crewOnSiteUntil)
            : null,
      };

    case "never_quoted":
      return {
        // Same reason as `sequence`: never quoted means never worked, so the
        // only work type on the record came from the enquiry. Null when the
        // account carries no tag — no default, because "we don't know" and
        // "it's painting" must stay distinguishable or a template can no
        // longer choose to say less.
        "account.workType": facts.enquiredAbout,
        // Always present: "interior work" when the enquiry captured a scope,
        // a phrase true of any painting enquiry when it did not. A rendering
        // of what we know rather than a claim about their house, so it can be
        // required without ever making a template ineligible.
        "enquiry.subject": facts.enquiredAbout
          ? `${facts.enquiredAbout} work`
          : "getting some painting done",
        // Deliberately mutually exclusive. Meeting someone at a show *is* the
        // "when", so an event enquiry supplies the channel and no month —
        // which also stops the dated and in-person templates ever tying.
        "enquiry.month":
          facts.enquiryChannel === "event" || !facts.enquiredAt
            ? null
            : enquiryMonth(facts.enquiredAt, facts.now),
        "enquiry.channel":
          facts.enquiryChannel === "event"
            ? `the ${facts.sourceLabel.toLowerCase()}`
            : null,
      };

    case "speed_to_lead":
      // Never drafts a customer message; the runner routes it to an internal
      // alert before any drafter is reached.
      return {};
  }
}

/**
 * "back in June last year" — the preposition belongs to the token, because
 * the template reads "You asked about interior work {{enquiry.month}}" and an
 * author should not have to guess whether to supply one.
 */
function enquiryMonth(enquiredAt: Date, now: Date): string {
  const suffix = enquiredAt.getFullYear() < now.getFullYear() ? " last year" : "";
  return `back in ${monthName(enquiredAt)}${suffix}`;
}

/**
 * An empty string is not a value. Returning one would satisfy the eligibility
 * check and render a gap, which is precisely the failure the check exists to
 * prevent.
 */
function blankToNull(value: string | null | undefined): string | null {
  return value && value.trim().length > 0 ? value : null;
}
