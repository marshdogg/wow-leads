"use server";

/**
 * The booking hand-off: the write that turns a lead into a scheduled estimate.
 *
 * Order matters. The Funnel is the outside system, so it goes first — if it
 * rejects the estimate we have not yet mutated our own deal and the user can
 * retry cleanly. Only once the Funnel has minted an `osRef` do we move the
 * deal to Result and record the touchpoint.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { DAYS, ESTIMATORS, TIMES } from "@/lib/pipelines";
import { getDeal, bookDeal } from "@/lib/repositories/deals";
import { logTouchpoint } from "@/lib/repositories/touchpoints";
import {
  carriesFor,
  estimatorFromSelection,
  whenLabelFromSelection,
} from "@/lib/wow-os/booking";
import { getWowOsClient } from "@/lib/wow-os/client";

/* -------------------------------------------------------------------------
   Input
   ------------------------------------------------------------------------- */

/**
 * Indices rather than labels: the client can only ever submit a slot the
 * server already offered, so there is no free-text date to sanitise.
 */
const bookEstimateSchema = z.object({
  dealId: z.string().min(1),
  dayIndex: z.number().int().min(0).max(DAYS.length - 1),
  timeIndex: z.number().int().min(0).max(TIMES.length - 1),
  estimatorIndex: z.number().int().min(0).max(ESTIMATORS.length - 1),
});

export type BookEstimateInput = z.infer<typeof bookEstimateSchema>;

/* -------------------------------------------------------------------------
   Output
   ------------------------------------------------------------------------- */

export interface BookingConfirmation {
  osRef: string;
  /** "Thu Aug 6 at 10:00 AM" */
  when: string;
  estimatorName: string;
  leadName: string;
  /** The card's account line — address, site or company. */
  address: string;
  carries: string[];
}

export type BookEstimateResult =
  | { ok: true; confirmation: BookingConfirmation }
  | { ok: false; error: string };

/* -------------------------------------------------------------------------
   Action
   ------------------------------------------------------------------------- */

export async function bookEstimateAction(
  input: BookEstimateInput,
): Promise<BookEstimateResult> {
  const parsed = bookEstimateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Pick a day, a time and an estimator." };
  }
  const { dealId, dayIndex, timeIndex, estimatorIndex } = parsed.data;

  const deal = await getDeal(dealId);
  if (!deal) return { ok: false, error: "That lead no longer exists." };

  if (deal.osRef) {
    return {
      ok: false,
      error: `Already booked in WOW OS · ${deal.osRef}.`,
    };
  }

  const selection = { dayIndex, timeIndex, estimatorIndex };
  const when = whenLabelFromSelection(selection);
  const estimator = estimatorFromSelection(selection);
  const carries = carriesFor(deal);
  const actor = getCurrentUser();

  let osRef: string;
  try {
    const created = await getWowOsClient().createEstimate({
      dealId: deal.id,
      leadName: deal.name,
      address: deal.account,
      when,
      estimatorName: estimator.name,
      source: deal.source,
      assignedBy: deal.assignedBy,
      carries,
    });
    osRef = created.osRef;
  } catch {
    return {
      ok: false,
      error: "WOW OS did not accept the estimate. Nothing was changed.",
    };
  }

  // Moves the deal to Result, sets osRef and resultOutcome 'booked' — which is
  // what renders the "Linked in WOW OS · EST-#####" footer on the card.
  await bookDeal({
    dealId: deal.id,
    osRef,
    whenLabel: when,
    estimatorName: estimator.name,
    actorUserId: actor.id,
  });

  // The human half of the provenance trail. The adapter separately records the
  // Funnel-side JOB entry; these are two different actors and the timeline is
  // meant to show both.
  await logTouchpoint({
    dealId: deal.id,
    channel: "NOTE",
    body: `Booked the estimate — ${when} with ${estimator.name}. Handed off to the WOW OS Funnel as ${osRef}.`,
    actorUserId: actor.id,
  });

  revalidatePath("/board");
  revalidatePath("/switcher");
  revalidatePath(`/record/${deal.id}`);

  return {
    ok: true,
    confirmation: {
      osRef,
      when,
      estimatorName: estimator.name,
      leadName: deal.name,
      address: deal.account,
      carries,
    },
  };
}

/* -------------------------------------------------------------------------
   Modal context
   ------------------------------------------------------------------------- */

export interface BookingContext {
  dealId: string;
  leadName: string;
  address: string;
  /** Chips for the "carries across the seam" block. */
  carries: string[];
  /** Non-null when the deal has already been handed off. */
  osRef: string | null;
}

/**
 * Everything step 1 needs to render, keyed by deal id alone — so a caller can
 * open the modal knowing nothing but the id (see `BookingModal`'s props).
 */
export async function getBookingContextAction(
  dealId: string,
): Promise<BookingContext | null> {
  const deal = await getDeal(dealId);
  if (!deal) return null;
  return {
    dealId: deal.id,
    leadName: deal.name,
    address: deal.account,
    carries: carriesFor(deal),
    osRef: deal.osRef ?? null,
  };
}

/* -------------------------------------------------------------------------
   Round-trip read
   ------------------------------------------------------------------------- */

export interface EstimateStatusResult {
  osRef: string;
  status: string;
  when: string;
  estimator: string;
}

/**
 * Reads the estimate back out of the Funnel. This is the round trip that lets
 * the UI say "Estimate Scheduled" on the authority of WOW OS rather than on
 * our own say-so.
 */
export async function getEstimateStatusAction(
  osRef: string,
): Promise<EstimateStatusResult | null> {
  return getWowOsClient().getEstimateStatus(osRef);
}
