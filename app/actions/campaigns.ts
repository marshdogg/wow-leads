"use server";

/**
 * Campaign authoring.
 *
 * The rule worth stating up front: **an audience that cannot be evaluated is
 * saved, not rejected.** A review campaign written against job completions the
 * Funnel does not send yet is a reasonable thing to have on the books — the
 * screen explains it, and it starts working the day the data arrives.
 * Refusing the save would only push the author into expressing the same intent
 * badly through a tag.
 *
 * What *is* rejected is a campaign that would misfire: a stage that no longer
 * exists, a pinned template that has been deleted, a template that cannot be
 * sent down the channel its step uses. Those look saved and never work, which
 * is the failure mode the Templates screen already refuses.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/lib/current-user";
import {
  approvableContent,
  campaignContentHash,
} from "@/lib/campaigns/approval";
import type { Audience, AudienceParams } from "@/lib/campaigns/types";
import {
  approveCampaign,
  deleteCampaign,
  getCampaign,
  saveCampaign,
  setCampaignActive,
} from "@/lib/repositories/campaigns";
import { getPipelines } from "@/lib/repositories/pipelines";
import { getTemplates } from "@/lib/repositories/templates";
import type { Campaign } from "@/lib/campaigns/types";
import type { PipelineId, StageId } from "@/lib/types";

export type CampaignResult =
  | { ok: true; campaign: Campaign; toast: string }
  | { ok: false; error: string; toast: string };

const AUDIENCE_KINDS = [
  "job_completed_days_ago",
  "no_job_in_months",
  "tagged",
  "pipeline_stage",
] as const;

const audienceSchema = z.object({
  kind: z.enum(AUDIENCE_KINDS),
  params: z.object({
    days: z.number().int().min(0).optional(),
    months: z.number().int().min(1).optional(),
    tag: z.string().min(1).optional(),
    // Open strings for the same reason the template scope is: pipelines and
    // stages are rows, and a franchise-created one has to be targetable. The
    // unions in `lib/types.ts` only ever named the ids we seed.
    pipelineId: z.string().min(1).optional(),
    stageId: z.string().min(1).optional(),
  }),
});

const stepSchema = z.object({
  stepNumber: z.number().int().min(1),
  delayDays: z.number().int().min(0),
  channel: z.enum(["SMS", "EMAIL", "PHONE"]),
  templateId: z.string().min(1).nullable(),
  label: z.string().min(1, "Every step needs a name."),
});

const saveSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1, "A campaign needs a name."),
  // Open string, not a union — a franchise invents "Reviews" or "Newsletters"
  // and the rail derives its headings from the data. See PipelineCategory.
  category: z.string().min(1, "A campaign needs a category."),
  description: z.string(),
  audience: audienceSchema,
  approvalMode: z.enum(["per_message", "bulk"]),
  active: z.boolean(),
  reenrolAfterDays: z.number().int().min(1).nullable(),
  steps: z.array(stepSchema).min(1, "A campaign with no steps sends nothing."),
});

type SaveInput = z.infer<typeof saveSchema>;

/**
 * Zod validates the ids as open strings; `AudienceParams` names the seeded
 * ones. Narrowed here rather than loosening the domain type, and only after
 * `validateAudience` has checked the pair against the pipelines that exist.
 */
function toAudience(input: SaveInput["audience"]): Audience {
  const params: AudienceParams = {
    days: input.params.days,
    months: input.params.months,
    tag: input.params.tag,
    pipelineId: input.params.pipelineId as PipelineId | undefined,
    stageId: input.params.stageId as StageId | undefined,
  };
  return { kind: input.kind, params };
}

/**
 * The audience must name things that exist.
 *
 * A campaign scoped to a stage that was since renamed selects nobody,
 * silently, forever — indistinguishable on the screen from an audience that is
 * simply empty today, and therefore worth catching at save.
 */
async function validateAudience(input: SaveInput): Promise<string | null> {
  const { kind, params } = input.audience;

  switch (kind) {
    case "job_completed_days_ago":
      return typeof params.days === "number"
        ? null
        : "Say how many days after the job this fires.";
    case "no_job_in_months":
      return typeof params.months === "number"
        ? null
        : "Say how many months of silence qualify someone.";
    case "tagged":
      return params.tag?.trim() ? null : "Pick the tag this campaign goes to.";
    case "pipeline_stage": {
      if (!params.pipelineId || !params.stageId) {
        return "Pick both a pipeline and a stage.";
      }
      const pipelines = await getPipelines();
      const pipeline = pipelines.find((p) => p.id === params.pipelineId);
      if (!pipeline) {
        return `No pipeline "${params.pipelineId}". Available: ${pipelines.map((p) => p.id).join(", ")}.`;
      }
      if (!pipeline.stages.some((s) => s.id === params.stageId)) {
        return `Pipeline "${pipeline.label}" has no stage "${params.stageId}".`;
      }
      return null;
    }
  }
}

/**
 * A pinned template has to still exist, and has to be sendable down its step's
 * channel. Pinning EMAIL copy to an SMS step is the sort of mistake that
 * otherwise surfaces at send time, to a customer.
 */
async function validatePinnedTemplates(input: SaveInput): Promise<string | null> {
  const pinned = input.steps.filter((s) => s.templateId);
  if (!pinned.length) return null;

  const templates = await getTemplates();
  for (const s of pinned) {
    const t = templates.find((x) => x.id === s.templateId);
    if (!t) {
      return `Step ${s.stepNumber} pins a template that no longer exists. Clear it and the copy will be chosen at send time.`;
    }
    if (t.channel !== "ANY" && t.channel !== s.channel) {
      return `Step ${s.stepNumber} sends by ${s.channel} but pins “${t.name}”, which is ${t.channel} copy.`;
    }
  }
  return null;
}

function revalidateCampaigns() {
  revalidatePath("/campaigns");
  // The rail groups campaigns under their category, so a new category or a
  // rename changes the shell as well as the screen.
  revalidatePath("/", "layout");
}

export async function saveCampaignAction(
  input: z.input<typeof saveSchema>,
): Promise<CampaignResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid campaign.";
    return { ok: false, error: message, toast: message };
  }

  for (const check of [validateAudience, validatePinnedTemplates]) {
    const problem = await check(parsed.data);
    if (problem) return { ok: false, error: problem, toast: problem };
  }

  const wasApproved = parsed.data.id
    ? Boolean((await getCampaign(parsed.data.id))?.approvedHash)
    : false;

  try {
    const campaign = await saveCampaign({
      id: parsed.data.id,
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description,
      audience: toAudience(parsed.data.audience),
      approvalMode: parsed.data.approvalMode,
      active: parsed.data.active,
      reenrolAfterDays: parsed.data.reenrolAfterDays,
      steps: parsed.data.steps,
      actorUserId: getCurrentUser().id,
    });
    revalidateCampaigns();

    // The repository revokes a bulk approval on every edit — deliberately, so
    // approved copy is provably the copy that sends. Saying nothing about it
    // would leave an author staring at a live campaign that stopped sending
    // after a typo fix.
    if (wasApproved) {
      return {
        ok: true,
        campaign,
        toast: `“${campaign.name}” saved. Its bulk approval is cleared — approve the new version before it sends again`,
      };
    }

    return {
      ok: true,
      campaign,
      // A campaign saved switched off has not started, and an author who is
      // not told will come back tomorrow wondering why nothing sent.
      toast: campaign.active
        ? `“${campaign.name}” saved and live — it enrols on the next run`
        : `“${campaign.name}” saved. It is switched off, so nothing sends yet`,
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not save the campaign.";
    return { ok: false, error: message, toast: message };
  }
}

const activeSchema = z.object({
  id: z.string().min(1),
  active: z.boolean(),
});

/**
 * Always resolves with a `toast`, the same shape as `setTemplateActiveAction`:
 * a failed toggle still has something specific to say and the caller should
 * not have to branch to find out what.
 */
export async function setCampaignActiveAction(
  input: z.input<typeof activeSchema>,
): Promise<{ ok: boolean; toast: string }> {
  const parsed = activeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, toast: "Invalid request." };

  try {
    const before = await getCampaign(parsed.data.id);
    await setCampaignActive(
      parsed.data.id,
      parsed.data.active,
      getCurrentUser().id,
    );
    revalidateCampaigns();

    const name = before?.name ?? "Campaign";
    if (!parsed.data.active) {
      return {
        ok: true,
        toast: `${name} paused. Anyone part-way through it stops where they are`,
      };
    }

    // Arming a bulk campaign that nobody has approved is the one case where
    // "it's live" would be a lie: the gate holds every send.
    const unapproved =
      before?.approvalMode === "bulk" && !before.approvedHash;
    return {
      ok: true,
      toast: unapproved
        ? `${name} is armed, but it approves in bulk and no version has been approved — nothing sends until one is`
        : `${name} is live — it enrols on the next run`,
    };
  } catch (err) {
    return {
      ok: false,
      toast:
        err instanceof Error ? err.message : "Could not update the campaign.",
    };
  }
}

const approveSchema = z.object({ id: z.string().min(1) });

/**
 * Approves the current version of a bulk campaign.
 *
 * The hash is built here, on the server, from the campaign and the **resolved
 * body of every step** — so re-pointing a step, or editing the template a step
 * points at, both invalidate it. That is also why a step with no pinned
 * template cannot be approved: its copy is chosen per record at send time, so
 * there is no wording for a person to have agreed to. Refused rather than
 * hashed as an empty string, which would tick the box over nothing.
 */
export async function approveCampaignAction(
  input: z.input<typeof approveSchema>,
): Promise<{ ok: boolean; toast: string }> {
  const parsed = approveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, toast: "Invalid request." };

  try {
    const campaign = await getCampaign(parsed.data.id);
    if (!campaign) return { ok: false, toast: "That campaign no longer exists." };
    if (campaign.approvalMode !== "bulk") {
      return {
        ok: false,
        toast: `“${campaign.name}” approves message by message — there is nothing to approve in advance.`,
      };
    }

    const templates = await getTemplates();
    const bodyByStep = new Map<number, string>();
    const unpinned: number[] = [];
    for (const step of campaign.steps) {
      const template = step.templateId
        ? templates.find((t) => t.id === step.templateId)
        : undefined;
      if (!template) unpinned.push(step.stepNumber);
      else bodyByStep.set(step.stepNumber, template.body);
    }

    if (unpinned.length) {
      return {
        ok: false,
        toast:
          `Step ${unpinned.join(", ")} has no pinned template, so the wording is not decided until send. ` +
          `Pin the copy you want approved.`,
      };
    }

    const hash = campaignContentHash(approvableContent(campaign, bodyByStep));
    await approveCampaign({
      campaignId: campaign.id,
      actorUserId: getCurrentUser().id,
      hash,
    });
    revalidateCampaigns();

    return {
      ok: true,
      toast: `Approved this version of “${campaign.name}”. Any edit to the audience, the steps or the copy clears it again`,
    };
  } catch (err) {
    return {
      ok: false,
      toast:
        err instanceof Error ? err.message : "Could not approve the campaign.",
    };
  }
}

const deleteSchema = z.object({ id: z.string().min(1) });

export async function deleteCampaignAction(
  input: z.input<typeof deleteSchema>,
): Promise<{ ok: boolean; toast: string }> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, toast: "Invalid request." };

  try {
    const name = (await getCampaign(parsed.data.id))?.name ?? "Campaign";
    await deleteCampaign(parsed.data.id, getCurrentUser().id);
    revalidateCampaigns();
    return { ok: true, toast: `“${name}” deleted` };
  } catch (err) {
    return {
      ok: false,
      toast:
        err instanceof Error ? err.message : "Could not delete the campaign.",
    };
  }
}
