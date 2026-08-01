/**
 * Pure booking helpers — no I/O, no React, no database.
 *
 * Everything here is deterministic so the booking flow can be unit-tested
 * without a database or a WOW OS endpoint. The stateful half lives in
 * `lib/wow-os/client.ts` (the Funnel adapter) and `app/actions/booking.ts`
 * (the server action that ties them together).
 */

import { DAYS, ESTIMATORS, TIMES } from "@/lib/pipelines";
import type { BookingDay, Deal, Estimator } from "@/lib/types";

/* -------------------------------------------------------------------------
   Selection state
   ------------------------------------------------------------------------- */

/**
 * What step 1 of the modal collects. `null` means "not chosen yet" — the
 * prototype defaulted all three to index 0, which let you confirm a booking
 * you never actually picked. We require an explicit choice for each.
 */
export interface BookingSelection {
  dayIndex: number | null;
  timeIndex: number | null;
  estimatorIndex: number | null;
}

export const EMPTY_SELECTION: BookingSelection = {
  dayIndex: null,
  timeIndex: null,
  estimatorIndex: null,
};

function inRange(i: number | null, length: number): i is number {
  return i !== null && Number.isInteger(i) && i >= 0 && i < length;
}

/** Step 1 is only confirmable once day, time *and* estimator are all chosen. */
export function canConfirm(sel: BookingSelection): boolean {
  return (
    inRange(sel.dayIndex, DAYS.length) &&
    inRange(sel.timeIndex, TIMES.length) &&
    inRange(sel.estimatorIndex, ESTIMATORS.length)
  );
}

/** The first unmet requirement, for the disabled-button hint. Null when ready. */
export function missingSelection(sel: BookingSelection): string | null {
  if (!inRange(sel.dayIndex, DAYS.length)) return "Pick a day";
  if (!inRange(sel.timeIndex, TIMES.length)) return "Pick a time";
  if (!inRange(sel.estimatorIndex, ESTIMATORS.length)) return "Pick an estimator";
  return null;
}

/* -------------------------------------------------------------------------
   Labels
   ------------------------------------------------------------------------- */

/** "Thu Aug 6 at 10:00 AM" */
export function whenLabel(day: BookingDay, time: string): string {
  return `${day.dow} ${day.date} at ${time}`;
}

/**
 * Same label from selection indices. Throws on an incomplete selection —
 * callers must gate on `canConfirm` first (the server action does, via Zod).
 */
export function whenLabelFromSelection(sel: BookingSelection): string {
  if (!canConfirm(sel)) {
    throw new Error(
      `Cannot build a when label from an incomplete selection: ${missingSelection(sel)}`,
    );
  }
  return whenLabel(DAYS[sel.dayIndex as number], TIMES[sel.timeIndex as number]);
}

export function estimatorFromSelection(sel: BookingSelection): Estimator {
  if (!inRange(sel.estimatorIndex, ESTIMATORS.length)) {
    throw new Error("No estimator selected");
  }
  return ESTIMATORS[sel.estimatorIndex];
}

/* -------------------------------------------------------------------------
   osRef
   ------------------------------------------------------------------------- */

/**
 * WOW OS estimate ids are `EST-` plus exactly five digits (the seeded example
 * is `EST-40218`). Once the real Funnel API is wired up *it* mints these and
 * `generateOsRef` goes away — see the header of `lib/wow-os/client.ts`.
 */
export const OS_REF_PATTERN = /^EST-\d{5}$/;

export function isValidOsRef(value: string): boolean {
  return OS_REF_PATTERN.test(value);
}

const OS_REF_MIN = 40000;
const OS_REF_SPAN = 60000; // 40000–99999, always five digits.

/**
 * `random` is injectable so tests are deterministic. Any float in [0, 1)
 * maps to a valid five-digit ref.
 */
export function generateOsRef(random: () => number = Math.random): string {
  const n = OS_REF_MIN + Math.floor(random() * OS_REF_SPAN);
  return `EST-${n}`;
}

/* -------------------------------------------------------------------------
   What carries across the seam
   ------------------------------------------------------------------------- */

/**
 * The "CARRIES ACROSS THE SEAM — NOTHING RETYPED" chips. Two are
 * deal-specific so the list is visibly about *this* record, not boilerplate.
 */
export function carriesFor(
  deal: Pick<Deal, "source" | "assignedBy">,
): string[] {
  return [
    "Account + contacts",
    "Property details",
    "Access notes",
    `Source · ${deal.source}`,
    "Full activity with provenance",
    `Assigned by · ${deal.assignedBy}`,
  ];
}

/* -------------------------------------------------------------------------
   Modal chrome copy
   ------------------------------------------------------------------------- */

export type BookingStep = 1 | 2;

export function bookingEyebrow(step: BookingStep): string {
  return step === 1 ? "THE HANDOFF" : "HANDOFF COMPLETE";
}

export function bookingTitle(step: BookingStep, leadName: string): string {
  return step === 1
    ? `Book the estimate — ${leadName}`
    : "One record, now in the Funnel";
}

/* -------------------------------------------------------------------------
   Selection styling — the prototype's `sel()` helper, verbatim
   ------------------------------------------------------------------------- */

export interface SelectionStyle {
  border: string;
  bg: string;
  color: string;
}

export function sel(on: boolean): SelectionStyle {
  return {
    border: on ? "#4b9c2d" : "#262b25",
    bg: on ? "#0f1a0b" : "#141814",
    color: on ? "#b6f07a" : "#c6cdc6",
  };
}
