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
import { logTouchpoint } from "@/lib/repositories/touchpoints";
import type { Deal } from "@/lib/types";

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
});

export async function moveDealAction(
  input: z.input<typeof moveSchema>,
): Promise<ActionResult<{ deal: Deal }>> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid move request." };

  try {
    const deal = await moveDeal({
      ...parsed.data,
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
