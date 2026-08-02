"use server";

/**
 * Deal mutations reachable from the client. Every input is parsed with Zod at
 * the boundary, and every result is a discriminated union so the board can
 * roll an optimistic drag back when the server rejects it.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import {
  StageTransitionError,
  bookDeal,
  getDeal,
  moveDeal,
  setNextAction,
} from "@/lib/repositories/deals";
import { getPipelines } from "@/lib/repositories/pipelines";
import { logTouchpoint } from "@/lib/repositories/touchpoints";
import { stageRequiresReason } from "@/lib/pipelines";
import { LOST_REASONS, type Deal, type LostReason } from "@/lib/types";

export type ActionResult<T> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

function revalidateBoard(dealId?: string) {
  revalidatePath("/");
  revalidatePath("/board");
  revalidatePath("/manager");
  if (dealId) revalidatePath(`/record/${dealId}`);
}

/* -------------------------------------------------------------------------
   Move
   ------------------------------------------------------------------------- */

const moveSchema = z.object({
  dealId: z.string().min(1),
  stageId: z.string().min(1),
  /** Required when the target stage demands one. See `requireReason`. */
  lostReason: z.enum(LOST_REASONS as [LostReason, ...LostReason[]]).optional(),
});

/**
 * Refuses a move into a reason-requiring stage that has no reason.
 *
 * Checked here rather than trusting the modal, because a rule enforced only in
 * the component that happens to call it is not a rule — and this one is
 * load-bearing twice over: `lostReason` drives the win-rate split and it is
 * what the Lost-Lead Revival trigger fires on. A deal closed without it looks
 * perfectly fine on the board and quietly never comes back.
 *
 * Reads the stage rows rather than the compile-time union so a franchise's own
 * stage, or one flagged `requiresReason` on a non-lost stage, behaves the same.
 */
async function requireReason(
  stageId: string,
  lostReason: LostReason | undefined,
): Promise<string | null> {
  if (lostReason) return null;

  const pipelines = await getPipelines();
  const stage = pipelines
    .flatMap((p) => p.stages)
    .find((s) => s.id === stageId);
  if (!stage || !stageRequiresReason(stage)) return null;

  return `Moving to ${stage.label} needs a reason — it is what the revival trigger reads later.`;
}

export async function moveDealAction(
  input: z.input<typeof moveSchema>,
): Promise<ActionResult<{ deal: Deal }>> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid move request." };

  const missing = await requireReason(
    parsed.data.stageId,
    parsed.data.lostReason,
  );
  if (missing) return { ok: false, error: missing };

  try {
    // Named explicitly rather than spread from `parsed.data`. A spread would
    // let `lostReason` through the type checker and straight into the bin —
    // TypeScript does not excess-property-check spreads — and a silently
    // dropped lost reason is invisible until a revival that should have fired
    // next spring doesn't. If this line stops compiling, `moveDeal` has lost
    // the parameter, which is exactly when someone should find out.
    const deal = await moveDeal({
      dealId: parsed.data.dealId,
      stageId: parsed.data.stageId,
      lostReason: parsed.data.lostReason ?? null,
      actorUserId: getCurrentUser().id,
    });
    revalidateBoard(deal.id);
    return { ok: true, deal };
  } catch (err) {
    if (err instanceof StageTransitionError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not move that deal.",
    };
  }
}

/* -------------------------------------------------------------------------
   Quick log
   ------------------------------------------------------------------------- */

const quickLogSchema = z.object({
  dealId: z.string().min(1),
  kind: z.enum(["Call", "Text", "Visit"]),
});

const QUICK_LOG_CHANNEL = {
  Call: "CALL",
  Text: "SMS",
  Visit: "VISIT",
} as const;

const QUICK_LOG_BODY = {
  Call: "Call logged from the board — no fields required",
  Text: "Text logged from the board — no fields required",
  Visit: "Visit logged from the board — no fields required",
} as const;

/**
 * One tap, zero required fields, next step pushed +2 days.
 *
 * Always resolves with a `toast` — a failed quick log still has to say
 * something to a rep standing in a driveway, so the error *is* the toast.
 */
export async function quickLogAction(
  input: z.input<typeof quickLogSchema>,
): Promise<{ ok: boolean; toast: string }> {
  const parsed = quickLogSchema.safeParse(input);
  if (!parsed.success) return { ok: false, toast: "Invalid quick-log request." };

  const { dealId, kind } = parsed.data;
  try {
    const deal = await getDeal(dealId);
    if (!deal) return { ok: false, toast: `Deal "${dealId}" not found.` };

    await logTouchpoint({
      dealId,
      channel: QUICK_LOG_CHANNEL[kind],
      body: QUICK_LOG_BODY[kind],
      actorUserId: getCurrentUser().id,
      advanceNextActionDays: 2,
    });

    revalidateBoard(dealId);
    return {
      ok: true,
      toast: `${kind} logged on ${deal.name} — no fields required, next step +2 days`,
    };
  } catch (err) {
    return {
      ok: false,
      toast: err instanceof Error ? err.message : "Could not log that touch.",
    };
  }
}

/* -------------------------------------------------------------------------
   Next action
   ------------------------------------------------------------------------- */

const nextActionSchema = z.object({
  dealId: z.string().min(1),
  label: z.string().min(1),
  due: z.string().min(1),
  state: z.enum(["ok", "overdue"]),
  dueAt: z.coerce.date().nullish(),
});

export async function setNextActionAction(
  input: z.input<typeof nextActionSchema>,
): Promise<ActionResult<{ deal: Deal }>> {
  const parsed = nextActionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid next-action request." };
  }

  try {
    const deal = await setNextAction({
      ...parsed.data,
      dueAt: parsed.data.dueAt ?? null,
      actorUserId: getCurrentUser().id,
    });
    revalidateBoard(deal.id);
    return { ok: true, deal };
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error ? err.message : "Could not set that next action.",
    };
  }
}

/* -------------------------------------------------------------------------
   Booking hand-off
   ------------------------------------------------------------------------- */

const bookSchema = z.object({
  dealId: z.string().min(1),
  osRef: z.string().min(1),
  whenLabel: z.string().min(1),
  estimatorName: z.string().min(1),
});

export async function bookDealAction(
  input: z.input<typeof bookSchema>,
): Promise<ActionResult<{ deal: Deal; toast: string }>> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid booking request." };

  try {
    const deal = await bookDeal({
      ...parsed.data,
      actorUserId: getCurrentUser().id,
    });
    revalidateBoard(deal.id);
    return {
      ok: true,
      deal,
      toast: `${deal.name} is live in the Funnel · ${deal.osRef}`,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Could not book that deal.",
    };
  }
}
