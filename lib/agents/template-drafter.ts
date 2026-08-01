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
import type {
  ElevenMonthFacts,
  NeighbourCampaignFacts,
  RevivalFacts,
  SeasonalFacts,
  SequenceFacts,
} from "@/lib/triggers/types";
import type { DraftRequest, DraftResult, Drafter, Sender } from "./types";

/**
 * The deterministic drafter.
 *
 * This is the *primary* path, not a fallback: the product has to be
 * convincing with no API key set, so this has to write copy a rep would
 * actually send. The register is fixed and non-negotiable — first person,
 * named, specific to the actual job, one clear ask, zero marketing fluff:
 *
 *   Hi Delia — Marshall at WOW 1 DAY PAINTING. Your one-year warranty
 *   inspection is coming up on the interior work we finished last August. It
 *   is a good moment to touch up the hallway and stairwell zones that take
 *   the most traffic. Want me to bring an estimator by in the next couple of
 *   weeks?
 *
 * Every noun in that message comes off the record. So does every noun here:
 * where a fact is missing the sentence is dropped, never padded.
 */
export class TemplateDrafter implements Drafter {
  readonly id = "template";

  async draft(request: DraftRequest): Promise<DraftResult> {
    return { body: renderTemplate(request), source: "template" };
  }
}

export function renderTemplate(request: DraftRequest): string {
  const { facts, sender } = request;
  switch (facts.kind) {
    case "eleven_month":
      return elevenMonthBody(facts, sender);
    case "seasonal":
      return seasonalBody(facts, sender);
    case "revival":
      return revivalBody(facts, sender);
    case "sequence":
      return sequenceBody(facts, sender);
    case "neighbour_campaign":
      return neighbourBody(facts, sender);
    case "speed_to_lead":
      // Speed-to-lead never drafts a customer message — it raises an internal
      // alert. Reaching here means the runner routed an escalation down the
      // drafting path, which the `outcome` discriminator exists to prevent.
      throw new Error(
        "speed_to_lead has no customer-facing draft: it is an internal escalation.",
      );
  }
}

/* -------------------------------------------------------------------------
   11-month warranty
   ------------------------------------------------------------------------- */

function elevenMonthBody(f: ElevenMonthFacts, sender: Sender): string {
  const first = f.contact.firstName;
  const parts: string[] = [`Hi ${first} — ${sender.firstName} at ${sender.company}.`];

  const when = f.jobCompletedAt
    ? ` we finished ${completionPhrase(f.jobCompletedAt, f.now)}`
    : " we did for you";
  parts.push(
    `Your one-year warranty inspection is coming up on the ${f.scope.workType} work${when}.`,
  );

  if (f.scope.areas.length > 0) {
    parts.push(
      `It is a good moment to touch up the ${joinList(f.scope.areas)} zones that take the most traffic.`,
    );
  } else {
    parts.push(
      "It is a good moment to walk the job and catch anything worth touching up while the warranty is live.",
    );
  }

  parts.push("Want me to bring an estimator by in the next couple of weeks?");
  return parts.join(" ");
}

/* -------------------------------------------------------------------------
   Seasonal promo
   ------------------------------------------------------------------------- */

function seasonalBody(f: SeasonalFacts, _sender: Sender): string {
  const first = f.contact.firstName;
  const sent = f.promoSentAt ? ` we sent ${recentSendPhrase(f.promoSentAt, f.now)}` : "";
  const parts: string[] = [
    `Hi ${first} — checking in on the ${f.promoShortLabel} offer${sent}.`,
  ];

  const holds = f.promoExpiresAt
    ? `It holds until ${monthDay(f.promoExpiresAt)}`
    : "The offer is still open";
  const covers =
    f.scopeAreas.length > 0
      ? ` and covers the ${joinList(f.scopeAreas)} we talked through${f.priorJobPhrase ? ` ${f.priorJobPhrase}` : ""}`
      : "";
  parts.push(`${holds}${covers}.`);

  // Offering "a Monday slot" in a message that opens "we sent Monday" reads
  // like a template. Step a day on when the two collide.
  let slot = nextWeekdaySlot(f.now);
  if (f.promoSentAt && slot.getDay() === f.promoSentAt.getDay()) {
    slot = nextWeekdaySlot(f.now, 4);
  }
  parts.push(`Happy to hold a ${weekdayName(slot)} slot if that helps you decide.`);

  return parts.join(" ");
}

/* -------------------------------------------------------------------------
   Revival
   ------------------------------------------------------------------------- */

function revivalBody(f: RevivalFacts, sender: Sender): string {
  const first = f.contact.firstName;
  const parts: string[] = [`Hi ${first} — ${sender.firstName} at ${sender.company}.`];

  const at = f.originalValue ? ` at ${f.originalValue}` : "";
  const when = f.lostAt ? ` back in ${monthName(f.lostAt)}` : "";
  parts.push(
    `We quoted your ${lowerFirst(unpunctuated(f.originalScope))}${at}${when} and price was the sticking point.`,
  );

  parts.push(
    `Our ${seasonName(f.now)} schedule has room, and I can put a tighter phased option in front of you.`,
  );
  parts.push("Worth a ten-minute call this week?");

  return parts.join(" ");
}

/* -------------------------------------------------------------------------
   Sequence step
   ------------------------------------------------------------------------- */

function sequenceBody(f: SequenceFacts, sender: Sender): string {
  return f.stepNumber === 1
    ? sequenceIntroBody(f, sender)
    : sequenceFollowUpBody(f, sender);
}

function sequenceIntroBody(f: SequenceFacts, sender: Sender): string {
  const parts: string[] = [
    `${f.contact.firstName} — ${sender.firstName} with ${sender.company}.`,
  ];

  if (f.reference) {
    parts.push(
      `We finished ${f.workType} work on ${f.reference.proof}, one-day turnarounds on occupied buildings.`,
    );
  } else {
    parts.push(
      `We run one-day ${f.workType} turnarounds on occupied buildings — crews in and out inside a shift.`,
    );
  }

  const project = f.projectHint ? ` on ${f.projectHint}` : "";
  parts.push(
    `If ${f.accountShortName} has repaint scope coming${project}, I would like ten minutes to show you how we sequence around trades.`,
  );

  return parts.join(" ");
}

function sequenceFollowUpBody(f: SequenceFacts, sender: Sender): string {
  const parts: string[] = [`${f.contact.firstName} — ${sender.firstName} again.`];

  if (f.previousStepAt) {
    parts.push(
      `Following up on the note I sent ${recentSendPhrase(f.previousStepAt, f.now)}.`,
    );
  } else {
    parts.push(`Following up on my earlier note.`);
  }

  if (f.reference) {
    parts.push(
      `${f.reference.name} is an active account of ours on ${f.workType} work if you want a reference before we talk.`,
    );
  }

  const project = f.projectHint ? f.projectHint : "your upcoming repaint scope";
  parts.push(
    `Still worth ten minutes on ${project}? I can work around your trade schedule.`,
  );

  return parts.join(" ");
}

/* -------------------------------------------------------------------------
   Neighbour campaign
   ------------------------------------------------------------------------- */

/**
 * The reference:
 *
 *   Hi — Marshall at WOW 1 DAY PAINTING. We just finished the exterior at
 *   2308 Tunlaw Rd NW, two doors down from you. The crew is in the
 *   neighbourhood through Friday, so if you have been thinking about your
 *   trim I can have an estimator take a look while we are already here.
 *
 * Two things this must not do. It must not name the recipient, because a
 * canvassed address has no contact on file and inventing one is worse than
 * an unaddressed opener. And it must not claim to know anything about
 * *their* house — "if you have been thinking about your exterior" is a
 * conditional; "your trim is looking tired" would be a fabrication about
 * property nobody has looked at.
 */
function neighbourBody(f: NeighbourCampaignFacts, sender: Sender): string {
  const greeting = f.contact.firstName ? `Hi ${f.contact.firstName}` : "Hi";
  const parts: string[] = [`${greeting} — ${sender.firstName} at ${sender.company}.`];

  const where = f.proximity ? `, ${proximityClause(f.proximity)}` : " nearby";
  parts.push(`We just finished the ${f.scope.workType} at ${f.jobAddress}${where}.`);

  const stillHere =
    f.crewOnSiteUntil && f.crewOnSiteUntil.getTime() >= f.now.getTime()
      ? `The crew is in the neighbourhood through ${weekdayName(f.crewOnSiteUntil)}, so if`
      : "If";
  parts.push(
    `${stillHere} you have been thinking about your ${f.scope.workType} I can have an estimator take a look while we are already here.`,
  );

  return parts.join(" ");
}
