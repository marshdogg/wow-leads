"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import { setNextAction } from "@/lib/repositories/deals";
import { formatDue } from "@/lib/repositories/rules";

/**
 * Manager-dashboard writes.
 *
 * "Nudge" is deliberately not a reminder — a neglected deal's problem is that
 * nobody owns the next move, so the button creates the move. The due date is
 * computed here rather than in the browser: `dueAt` drives the overdue query,
 * and a client clock would let a rep's timezone decide when a deal goes red.
 */

export interface ActionResult {
  ok: boolean;
  toast: string;
}

const nudgeInput = z.object({
  dealId: z.string().min(1),
  dealName: z.string().min(1),
});

/** Tomorrow at 09:00 local. */
function tomorrowMorning(now: Date = new Date()): Date {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
}

export async function nudgeAction(
  input: z.infer<typeof nudgeInput>,
): Promise<ActionResult> {
  const parsed = nudgeInput.safeParse(input);
  if (!parsed.success) return { ok: false, toast: "Could not assign a step." };
  const { dealId, dealName } = parsed.data;

  const dueAt = tomorrowMorning();

  try {
    await setNextAction({
      dealId,
      label: "Call",
      // Written the way the board writes due strings, so the card this deal
      // appears on reads consistently with every other next action.
      due: formatDue(dueAt),
      state: "ok",
      dueAt,
      actorUserId: getCurrentUser().id,
    });
  } catch (err) {
    return {
      ok: false,
      toast: err instanceof Error ? err.message : "Could not assign a step.",
    };
  }

  revalidatePath("/manager");
  revalidatePath("/board");
  revalidatePath(`/record/${dealId}`);

  return {
    ok: true,
    toast: `Next step assigned on ${dealName} — call, tomorrow 9:00 AM`,
  };
}
