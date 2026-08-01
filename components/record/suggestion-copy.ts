/**
 * Bodies for the three AI suggestion cards.
 *
 * These are *agent output*, not configuration — in the shipped product they
 * come from the drafting service alongside the approval queue's drafts, and
 * this module is the seam where that call replaces the fixtures below.
 * Until then: hand-written copy for the demo records that have it, and a
 * fact-derived fallback for every other record so no card is ever empty or
 * claims something the timeline does not support.
 */

import { PIPES } from "@/lib/pipelines";
import type { SuggestionId } from "@/lib/record-fields";
import type { RecordView } from "./view-model";

export type SuggestionBodies = Record<SuggestionId, string>;

/** Demo copy standing in for the drafting service. Keyed by deal id. */
const FIXTURES: Record<string, SuggestionBodies> = {
  r1: {
    sg1: "Book the estimate now — scope grew to two bedrooms and she named an October deadline. Warranty visits that grow scope book at 3× the rate.",
    sg2: "5 touches over 13 months. One completed $8,400 interior job, high satisfaction, warranty window open. Scope now larger than the original trigger assumed.",
    sg3: '"Hi Delia — booked Kris for Thursday at 10. He\'ll price the stairwell touch-ups and both bedrooms in one visit."',
  },
};

export function suggestionBodies(
  view: RecordView,
  now: Date = new Date(),
): SuggestionBodies {
  const fixture = FIXTURES[view.deal.id];
  if (fixture) return fixture;

  const { deal } = view;
  const touches = view.timeline.length;
  const neglectDays = PIPES[deal.pipe].neglectDays;

  return {
    sg1: nextStepSuggestion(view, neglectDays, now),
    sg2: touches
      ? `${touches} ${touches === 1 ? "touch" : "touches"} on file. Source ${deal.source}, owned by ${deal.owner.name}, currently in ${PIPES[deal.pipe].label}.`
      : `Short history on this record. Source ${deal.source}, owned by ${deal.owner.name}.`,
    sg3: "Draft a follow-up matching this contact’s preferred channel.",
  };
}

function nextStepSuggestion(
  view: RecordView,
  neglectDays: number,
  now: Date,
): string {
  const next = view.deal.next;
  if (!next) {
    return `Set a next step — this record has no scheduled touch and will hit the neglected list in ${daysToNeglect(view, neglectDays, now)} days.`;
  }
  // `due` is a human phrase ("Today 3:00 PM", "Was due 4 days ago"), so it is
  // read as its own sentence rather than dropped into one.
  if (next.state === "overdue") {
    return `${next.label} is overdue — ${next.due.toLowerCase()}. Clear it or reschedule before the account goes quiet.`;
  }
  return `${next.label} is scheduled — ${next.due.toLowerCase()}. Confirm it lands, or bring it forward while the account is warm.`;
}

function daysToNeglect(
  view: RecordView,
  neglectDays: number,
  now: Date,
): number {
  const last = view.timeline[0]?.occurredAt;
  if (!last) return 0;
  const elapsed = Math.floor(
    (now.getTime() - new Date(last).getTime()) / 86_400_000,
  );
  return Math.max(0, neglectDays - elapsed);
}
