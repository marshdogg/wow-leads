"use server";

/**
 * Template authoring. The one rule worth stating: a body referencing a token
 * that does not exist is rejected **at save**, loudly, rather than at send.
 * A typo like `{{contact.firstname}}` would otherwise make the template
 * permanently ineligible — it would simply never be chosen, with no error
 * anywhere, and the author would conclude the feature was broken.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import {
  duplicateTemplate,
  getTemplate,
  getTemplates,
  saveTemplate,
  setTemplateActive,
} from "@/lib/repositories/templates";
import { getPipelines } from "@/lib/repositories/pipelines";
import { TEMPLATE_VARIABLES, unknownTokens } from "@/lib/templates/resolve";
import type { MessageTemplate } from "@/lib/templates/types";


/**
 * Always carries a `toast`. A save that fails on an unknown token or a stale
 * stage has something specific and useful to say, and the caller should not
 * have to branch to find out what — the error *is* the message.
 */
export type TemplateResult =
  | { ok: true; template: MessageTemplate; toast: string }
  | { ok: false; error: string; toast: string };

const TRIGGER_TYPES = [
  "eleven_month",
  "seasonal",
  "revival",
  "sequence",
  "speed_to_lead",
  "neighbour_campaign",
  "never_quoted",
] as const;

const saveSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1, "A template needs a name."),
  channel: z.enum(["SMS", "EMAIL", "PHONE", "ANY"]),
  triggerType: z.enum(TRIGGER_TYPES).nullish(),
  // Open strings, checked below against the rows that exist rather than
  // against a compile-time union — franchise-created pipelines and stages have
  // to be scopeable, and a literal union would also miss one deleted after the
  // template was written.
  pipelineId: z.string().min(1).nullish(),
  stageId: z.string().min(1).nullish(),
  track: z.string().min(1).nullish(),
  subject: z.string().nullish(),
  body: z.string().min(1, "A template needs a body."),
  active: z.boolean().optional(),
  allowAiAdaptation: z.boolean().optional(),
});

async function validateScope(input: {
  pipelineId?: string | null;
  stageId?: string | null;
}): Promise<string | null> {
  if (!input.pipelineId && !input.stageId) return null;

  const pipelines = await getPipelines();
  if (input.pipelineId && !pipelines.some((p) => p.id === input.pipelineId)) {
    return `No pipeline "${input.pipelineId}". Available: ${pipelines.map((p) => p.id).join(", ")}.`;
  }

  if (input.stageId) {
    const scoped = input.pipelineId
      ? pipelines.filter((p) => p.id === input.pipelineId)
      : pipelines;
    const stages = scoped.flatMap((p) => p.stages);
    if (!stages.some((s) => s.id === input.stageId)) {
      return input.pipelineId
        ? `Pipeline "${input.pipelineId}" has no stage "${input.stageId}".`
        : `No stage "${input.stageId}" in any pipeline.`;
    }
  }
  return null;
}

function revalidateTemplates() {
  revalidatePath("/templates");
  revalidatePath("/approvals");
}

export async function saveTemplateAction(
  input: z.input<typeof saveSchema>,
): Promise<TemplateResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid template.",
      toast: parsed.error.issues[0]?.message ?? "Invalid template.",
    };
  }

  // `unknownTokens` wants a template shape; the unsaved draft is enough for it.
  const draft = {
    ...parsed.data,
    id: parsed.data.id ?? "draft",
    subject: parsed.data.subject ?? null,
    triggerType: parsed.data.triggerType ?? null,
    pipelineId: parsed.data.pipelineId ?? null,
    stageId: parsed.data.stageId ?? null,
    track: parsed.data.track ?? null,
    active: parsed.data.active ?? true,
    // Undefined, not false: the repository preserves the stored value.
    allowAiAdaptation: parsed.data.allowAiAdaptation,
    isDefault: false,
    authoredBy: null,
    updatedAt: new Date(),
  } as MessageTemplate;

  // Scope has to name something that exists. A template scoped to a stage
  // that was renamed or deleted silently matches nothing — it looks saved and
  // never fires, which is the same failure mode as an unknown token.
  const scopeError = await validateScope(parsed.data);
  if (scopeError) return { ok: false, error: scopeError, toast: scopeError };

  const unknown = unknownTokens(draft);
  if (unknown.length) {
    const known = TEMPLATE_VARIABLES.map((v) => v.token).join(", ");
    const message =
      `Unknown ${unknown.length === 1 ? "variable" : "variables"}: ` +
      `${unknown.map((t) => `{{${t}}}`).join(", ")}. Available: ${known}.`;
    return { ok: false, error: message, toast: message };
  }

  try {
    const template = await saveTemplate({
      ...parsed.data,
      subject: parsed.data.subject ?? null,
      actorUserId: getCurrentUser().id,
    });
    revalidateTemplates();
    return { ok: true, template, toast: `Saved "${template.name}"` };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save the template.";
    return { ok: false, error: message, toast: message };
  }
}

const activeSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

/**
 * Always resolves with a `toast` — a failed toggle still has to say something,
 * and the caller shouldn't have to branch to find out what. Same shape as
 * `quickLogAction`.
 */
export async function setTemplateActiveAction(
  input: z.input<typeof activeSchema>,
): Promise<{ ok: boolean; toast: string }> {
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, toast: "Invalid request." };

  try {
    const template = await getTemplate(parsed.data.id);
    await setTemplateActive(parsed.data.id, parsed.data.active, getCurrentUser().id);
    revalidateTemplates();
    const name = template?.name ?? "Template";
    return {
      ok: true,
      toast: parsed.data.active
        ? `${name} is live — drafts will use it from the next trigger run`
        : `${name} turned off — drafts will fall back to the next best template`,
    };
  } catch (err) {
    return {
      ok: false,
      toast:
        err instanceof Error ? err.message : "Could not update the template.",
    };
  }
}

const duplicateSchema = z.object({ id: z.string().min(1) });

/** The fork-a-default path — how a franchise edits copy we ship. */
export async function duplicateTemplateAction(
  input: z.input<typeof duplicateSchema>,
): Promise<TemplateResult> {
  const parsed = duplicateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request.", toast: "Invalid request." };
  }

  try {
    const template = await duplicateTemplate(parsed.data.id, getCurrentUser().id);
    revalidateTemplates();
    return {
      ok: true,
      template,
      // Forks arrive switched off, so say so — otherwise the author edits a
      // copy, sees no change in behaviour, and assumes it did not save.
      toast: `Copied to "${template.name}" — turn it on when you are happy with it`,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not duplicate the template.";
    return { ok: false, error: message, toast: message };
  }
}

export async function getTemplatesAction(): Promise<MessageTemplate[]> {
  return getTemplates();
}
