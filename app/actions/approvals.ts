"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  APPROVAL_TOASTS,
  IllegalApprovalTransitionError,
  decide,
} from "@/lib/agents/approval-machine";
import { getCurrentUser } from "@/lib/current-user";

/**
 * The approval gate.
 *
 * These three actions are the only way an approval changes state, and each
 * one is a deliberate act by a named human — `getCurrentUser()` is read here,
 * on the server, and never accepted from the client. A caller cannot approve
 * as somebody else.
 *
 * Every input crosses a Zod schema first. The edit body in particular is
 * user-authored text on its way to a real customer, so it is bounded before
 * it is trusted.
 */

export type ActionResult =
  | { ok: true; toast: string }
  | { ok: false; error: string };

const ApprovalId = z.string().min(1, "An approval id is required.");

const ApproveInput = z.object({ approvalId: ApprovalId });

const EditInput = z.object({
  approvalId: ApprovalId,
  body: z
    .string()
    .trim()
    .min(20, "That is too short to send — write the message you want to go out.")
    .max(2000, "That is longer than any of these messages should be."),
});

const SkipInput = z.object({ approvalId: ApprovalId });

export async function approveAction(input: unknown): Promise<ActionResult> {
  const parsed = ApproveInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  return run(() =>
    decide({
      approvalId: parsed.data.approvalId,
      decision: "approve",
      actorUserId: getCurrentUser().id,
    }),
  );
}

/**
 * The edited body actually persists and actually sends — the prototype's
 * "Edit first" only opened the editor, but an edit that does not go out is
 * worse than no edit at all.
 */
export async function editAndSendAction(input: unknown): Promise<ActionResult> {
  const parsed = EditInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  return run(() =>
    decide({
      approvalId: parsed.data.approvalId,
      decision: "edit",
      body: parsed.data.body,
      actorUserId: getCurrentUser().id,
    }),
  );
}

export async function skipAction(input: unknown): Promise<ActionResult> {
  const parsed = SkipInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  return run(() =>
    decide({
      approvalId: parsed.data.approvalId,
      decision: "skip",
      actorUserId: getCurrentUser().id,
    }),
  );
}

/** The toast shown when the inline editor opens. No state changes. */
export async function editToast(): Promise<string> {
  return APPROVAL_TOASTS.edit();
}

async function run(
  work: () => Promise<{ toast: string }>,
): Promise<ActionResult> {
  try {
    const { toast } = await work();
    revalidate();
    return { ok: true, toast };
  } catch (error) {
    if (error instanceof IllegalApprovalTransitionError) {
      // Two people hit the queue at once, or a stale tab. Refresh so the
      // reader sees the decision that actually won.
      revalidate();
      return {
        ok: false,
        error: "Somebody already decided this one — refreshing the queue.",
      };
    }
    const message =
      error instanceof Error ? error.message : "That did not go through.";
    return { ok: false, error: message };
  }
}

/**
 * The board is the other half of this: approving clears `ai_pending`, so the
 * pulsing AI DRAFTED chip has to disappear there too.
 */
function revalidate(): void {
  revalidatePath("/approvals");
  revalidatePath("/board");
  revalidatePath("/");
}

function invalid(error: z.ZodError): ActionResult {
  return { ok: false, error: error.issues[0]?.message ?? "Invalid input." };
}
