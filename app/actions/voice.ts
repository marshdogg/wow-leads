"use server";

import { revalidatePath } from "next/cache";
import { logTouchpoint } from "@/lib/repositories/touchpoints";
import { setNextAction } from "@/lib/repositories/deals";
import { formatDue } from "@/lib/repositories/rules";
import { getTranscriptParser } from "@/lib/voice/parser";
import {
  logOutcomeInput,
  parseVoiceInput,
  saveVoiceNoteInput,
} from "@/lib/voice/schema";
import { splitNextStep, VOICE_FIELDS } from "@/lib/voice/types";
import type { EditableFields, ParseResult } from "@/lib/voice/types";
import type { TouchpointChannel } from "@/lib/types";

/**
 * Writes for the Field screen. Everything crossing this boundary is
 * Zod-validated; parsing runs here so no transcript ever needs an API key in
 * the browser.
 */

const MS_DAY = 86_400_000;

type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

function fail(error: unknown, fallback: string): { ok: false; error: string } {
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

/* -------------------------------------------------------------------------
   One-tap outcomes
   ------------------------------------------------------------------------- */

const TAP_CHANNEL: Record<"Call" | "Text" | "Visit", TouchpointChannel> = {
  Call: "CALL",
  Text: "SMS",
  Visit: "VISIT",
};

/** Zero fields required means the default next step has to come from here. */
const TAP_NEXT_STEP: Record<"Call" | "Text" | "Visit", string> = {
  Call: "Follow up on the call",
  Text: "Follow up on the text",
  Visit: "Follow up on the visit",
};

const TAP_BODY: Record<"Call" | "Text" | "Visit", string> = {
  Call: "Call logged from the field — one tap, no fields required.",
  Text: "Text logged from the field — one tap, no fields required.",
  Visit: "Site visit logged from the field — one tap, no fields required.",
};

export async function logOutcomeAction(
  raw: unknown,
): Promise<ActionResult<{ nextDue: string }>> {
  const input = logOutcomeInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "Could not log that outcome." };
  const { dealId, kind, actorUserId } = input.data;

  try {
    await logTouchpoint({
      dealId,
      channel: TAP_CHANNEL[kind],
      body: TAP_BODY[kind],
      actorUserId,
    });

    // +2 days at 9am is the driveway default: never leave a deal without a next step.
    const dueAt = new Date(Date.now() + 2 * MS_DAY);
    dueAt.setHours(9, 0, 0, 0);
    await setNextAction({
      dealId,
      label: TAP_NEXT_STEP[kind],
      due: formatDue(dueAt),
      state: "ok",
      dueAt,
      actorUserId,
    });

    revalidatePath("/field");
    revalidatePath("/board");
    revalidatePath(`/record/${dealId}`);

    return { ok: true, data: { nextDue: formatDue(dueAt) } };
  } catch (error) {
    return fail(error, "Could not log that outcome.");
  }
}

/* -------------------------------------------------------------------------
   Transcript → structure
   ------------------------------------------------------------------------- */

export async function parseVoiceAction(
  raw: unknown,
): Promise<ActionResult<ParseResult>> {
  const input = parseVoiceInput.safeParse(raw);
  if (!input.success) return { ok: false, error: "That note could not be read." };

  try {
    const parser = getTranscriptParser();
    return { ok: true, data: await parser.parse(input.data.transcript) };
  } catch (error) {
    return fail(error, "That note could not be structured.");
  }
}

/* -------------------------------------------------------------------------
   Save
   ------------------------------------------------------------------------- */

function toStructured(fields: EditableFields) {
  return VOICE_FIELDS.map(({ key, label }) => ({
    label,
    value: fields[key],
  })).filter((f) => f.value.length > 0);
}

export async function saveVoiceNoteAction(
  raw: unknown,
): Promise<ActionResult<{ redirectTo: string }>> {
  const input = saveVoiceNoteInput.safeParse(raw);
  if (!input.success) {
    return {
      ok: false,
      error: input.error.issues[0]?.message ?? "That note could not be saved.",
    };
  }
  const { dealId, transcript, fields, dueAt, actorUserId } = input.data;

  try {
    await logTouchpoint({
      dealId,
      channel: "NOTE",
      body: transcript,
      actorUserId,
      structured: toStructured(fields),
    });

    const { label, due } = splitNextStep(fields.nextStep);
    if (label) {
      const at = dueAt ? new Date(dueAt) : null;
      await setNextAction({
        dealId,
        label,
        due: due || (at ? formatDue(at) : "Not scheduled"),
        state: "ok",
        dueAt: at,
        actorUserId,
      });
    }

    revalidatePath(`/record/${dealId}`);
    revalidatePath("/board");
    revalidatePath("/field");

    return { ok: true, data: { redirectTo: `/record/${dealId}` } };
  } catch (error) {
    return fail(error, "That note could not be saved.");
  }
}
