import { minutesBetween } from "./dates";
import { humaniseMinutes } from "./text";
import type {
  SpeedToLeadFacts,
  SpeedToLeadSeverity,
  TriggerDefinition,
} from "./types";

/**
 * Speed-to-lead escalation.
 *
 * **This trigger never puts anything in the Approvals queue, and that is the
 * point.**
 *
 * Every other trigger drafts a message to a customer, so a human has to
 * approve it before it sends. This one tells *us* something: a paid lead is
 * sitting unworked and the clock is running. There is nothing to approve
 * because nothing is going to a customer — the output is an alert on the
 * rep's own board.
 *
 * Routing it through Approvals would be actively harmful. That screen's whole
 * promise is "nothing sends until you approve it", and the promise is only
 * worth something if everything in the queue is a thing that would send. Pad
 * it with internal nudges and approving stops meaning "I checked this before
 * it went out" and starts meaning "I cleared a notification". So the
 * definition below carries `outcome: "escalate"`, and the runner branches on
 * it — this trigger cannot reach the approvals table even by mistake.
 *
 * The thresholds are the business case. Contacting a paid lead inside five
 * minutes versus thirty is the difference between booking it and losing it to
 * whoever called first, so the numbers are named constants rather than magic
 * numbers buried in a comparison.
 */

/** Unworked past this, the rep needs telling. */
export const WARN_MINUTES = 15;

/** Unworked past this, it is a manager's problem, not a reminder. */
export const ESCALATE_MINUTES = 60;

/** Sources where we have already spent money to make the phone ring. */
const PAID_SOURCES = ["facebook", "instagram", "google ads", "paid", "ppc"];

export function isPaidSource(source: string): boolean {
  const normalised = source.toLowerCase();
  return PAID_SOURCES.some((term) => normalised.includes(term));
}

/** Which side of the SLA a lead is on. Pure, and total for any age. */
export function severityFor(facts: SpeedToLeadFacts): SpeedToLeadSeverity {
  if (!facts.arrivedAt || facts.firstContactAt) return "on_track";
  const minutes = minutesBetween(facts.arrivedAt, facts.now);
  if (minutes >= ESCALATE_MINUTES) return "breach";
  if (minutes >= WARN_MINUTES) return "warn";
  return "on_track";
}

export function evaluateSpeedToLead(facts: SpeedToLeadFacts): {
  eligible: boolean;
  reasons: string[];
} {
  const { arrivedAt, firstContactAt, stageId, source, paid, ownerName, now } = facts;

  if (!arrivedAt) {
    return {
      eligible: false,
      reasons: ["No arrival time on the lead — cannot start the clock"],
    };
  }

  // Once it has moved on, somebody is working it and the SLA is satisfied.
  if (stageId !== "new") {
    return {
      eligible: false,
      reasons: [`Lead has moved to ${stageId} — it is being worked`],
    };
  }

  if (firstContactAt) {
    const responseMinutes = minutesBetween(arrivedAt, firstContactAt);
    return {
      eligible: false,
      reasons: [
        `Contacted ${humaniseMinutes(responseMinutes)} after arriving — inside the SLA`,
      ],
    };
  }

  const waiting = minutesBetween(arrivedAt, now);
  if (waiting < WARN_MINUTES) {
    return {
      eligible: false,
      reasons: [
        `Arrived ${humaniseMinutes(waiting)} ago — still inside the ${WARN_MINUTES}-minute window`,
      ],
    };
  }

  const breaching = waiting >= ESCALATE_MINUTES;
  const reasons: string[] = [
    `Lead arrived ${humaniseMinutes(waiting)} ago and nobody has contacted them`,
    breaching
      ? `Past the ${ESCALATE_MINUTES}-minute escalation threshold, not just the ${WARN_MINUTES}-minute warning`
      : `Speed-to-lead SLA is ${WARN_MINUTES} minutes to first contact`,
  ];

  if (paid) {
    reasons.push(
      `Source: ${source} — paid demand, the cost per lead is already spent`,
    );
  } else {
    reasons.push(`Source: ${source} — net-new demand, nobody has worked with us before`);
  }

  reasons.push(`Assigned to ${ownerName}, still in the New column`);

  return { eligible: true, reasons };
}

export const speedToLeadTrigger: TriggerDefinition<SpeedToLeadFacts> = {
  type: "speed_to_lead",
  label: "Speed to lead",
  agentId: "agent-prospecting",
  // Internal alert only. See the note at the top of this file.
  outcome: "escalate",
  evaluate: evaluateSpeedToLead,
  title: (f) =>
    severityFor(f) === "breach"
      ? `Speed-to-lead breach · ${f.dealName}`
      : `Speed-to-lead warning · ${f.dealName}`,
  subtitle: (f) => {
    const waiting = f.arrivedAt ? humaniseMinutes(minutesBetween(f.arrivedAt, f.now)) : "";
    return [f.source, waiting && `unworked ${waiting}`, "New Leads"]
      .filter((part): part is string => Boolean(part))
      .join(" · ");
  },
  footnote: (f) =>
    `Nothing was sent to ${f.dealName} — this is an internal alert. ${f.ownerName} has an urgent next action on the lead.`,
};

/** The alert body written to the timeline. Not a customer-facing message. */
export function escalationNote(facts: SpeedToLeadFacts): string {
  const waiting = facts.arrivedAt
    ? humaniseMinutes(minutesBetween(facts.arrivedAt, facts.now))
    : "an unknown time";
  const level = severityFor(facts) === "breach" ? "BREACH" : "WARNING";
  return `Speed-to-lead ${level} — ${facts.dealName} has been unworked for ${waiting}. Source ${facts.source}. Assigned to ${facts.ownerName}.`;
}

/** What the rep is told to do, and by when. */
export function escalationNextAction(facts: SpeedToLeadFacts): string {
  return severityFor(facts) === "breach"
    ? `Call ${facts.dealName} now — speed-to-lead breached`
    : `Call ${facts.dealName} — speed-to-lead clock running`;
}
