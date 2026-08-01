import { daysBetween, monthDayShort, weekdayName } from "./dates";
import { pluralDays } from "./text";
import type { NeighbourCampaignFacts, TriggerDefinition } from "./types";

/**
 * Neighbour campaign.
 *
 * A finished job is the best advertisement the company has, and it is only
 * an advertisement while the crew is still parked in the street. "We just
 * finished number 2308" is a true, checkable, local statement — which is
 * exactly why this outreach works and exactly why it has to be derived from
 * the real job rather than generated.
 *
 * Unlike speed-to-lead, this is ordinary customer outreach and goes through
 * the Approvals queue like everything else: `outcome: "draft"`. A human reads
 * the address, the date and the scope, and decides.
 *
 * One approval per neighbour address. The runner expands a completed job into
 * one fact object per address on its canvass list, so each drafted message
 * can be approved or skipped on its own — a rep might happily knock on three
 * doors and not the fourth.
 */

/**
 * How long "we just finished" stays true. Past a week the crew has gone and
 * the message becomes a cold pitch wearing a local one's clothes.
 */
export const CREW_WINDOW_DAYS = 7;

export function evaluateNeighbourCampaign(facts: NeighbourCampaignFacts): {
  eligible: boolean;
  reasons: string[];
} {
  const {
    jobAddress,
    jobCompletedAt,
    scope,
    crewName,
    crewOnSiteUntil,
    neighbourAddress,
    proximity,
    alreadyKnown,
    now,
  } = facts;

  if (!jobCompletedAt) {
    return {
      eligible: false,
      reasons: ["No completion date on the job — nothing to say we just finished"],
    };
  }

  if (!neighbourAddress) {
    return {
      eligible: false,
      reasons: ["No address on the canvass list entry"],
    };
  }

  // Never canvass someone we already have a relationship with — at best it is
  // duplicate work, at worst we pitch a customer their own house.
  if (alreadyKnown) {
    return {
      eligible: false,
      reasons: [`${neighbourAddress} is already a lead or a customer`],
    };
  }

  const daysSince = daysBetween(jobCompletedAt, now);
  if (daysSince < 0) {
    return {
      eligible: false,
      reasons: [`Job at ${jobAddress} is not finished yet`],
    };
  }
  if (daysSince > CREW_WINDOW_DAYS) {
    return {
      eligible: false,
      reasons: [
        `Job finished ${pluralDays(daysSince)} ago — past the ${CREW_WINDOW_DAYS}-day window while the crew is still nearby`,
      ],
    };
  }

  const reasons: string[] = [
    `We finished ${scope.workType} work at ${jobAddress} on ${monthDayShort(jobCompletedAt)}${scope.value ? ` · ${scope.value}` : ""}`,
    proximity
      ? `${neighbourAddress} is ${proximity} — on the canvass list for that job`
      : `${neighbourAddress} is on the canvass list for that job`,
  ];

  if (crewOnSiteUntil && crewOnSiteUntil.getTime() >= now.getTime()) {
    reasons.push(
      crewName
        ? `${crewName} is in the street through ${weekdayName(crewOnSiteUntil)}`
        : `The crew is in the street through ${weekdayName(crewOnSiteUntil)}`,
    );
  }

  reasons.push("No existing lead or customer at this address");

  return { eligible: true, reasons };
}

export const neighbourCampaignTrigger: TriggerDefinition<NeighbourCampaignFacts> = {
  type: "neighbour_campaign",
  label: "Neighbour campaign",
  agentId: "agent-prospecting",
  outcome: "draft",
  evaluate: evaluateNeighbourCampaign,
  title: (f) => `Neighbour campaign · ${f.neighbourAddress}`,
  subtitle: (f) => {
    const finished = f.jobCompletedAt
      ? `${f.scope.workType} finished ${monthDayShort(f.jobCompletedAt)}`
      : f.scope.workType;
    return [`Next to ${f.jobAddress}`, finished, "New Leads"].join(" · ");
  },
  footnote: (f) =>
    `Approving creates a New Leads card for ${f.neighbourAddress}, sourced from the ${f.jobAddress} job so the attribution holds.`,
};
