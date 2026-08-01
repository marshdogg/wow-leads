import type { Campaign } from "./types";

/**
 * The bulk approval gate.
 *
 * `per_message` campaigns need nothing here — every send becomes an approvals
 * row and a human reads it, exactly as a trigger draft does. This file is for
 * `bulk`, where what gets approved is a **campaign version**: the audience
 * rule, the steps, and the copy each step will send.
 *
 * The gate is only honest because approval is *revocable by edit*. Approving
 * once and then rewriting the message would let unreviewed copy go out under a
 * stale tick, so the approval records a hash of the reviewed content and any
 * change to it puts the campaign back to unapproved. What was approved is
 * provably what sends.
 *
 * See DECISIONS.md — "Bulk approval changes what the guarantee means" — for
 * why per-run approval was rejected, and for the known limit: this covers the
 * audience *rule*, not the audience *size*.
 */

/**
 * The approval lives on the campaign row itself (`approvedAt`, `approvedBy`,
 * `approvedHash`) rather than in a separate shape, so there is one answer to
 * "is this approved" and no way for a caller to pair a campaign with somebody
 * else's approval.
 */
export type CampaignGate =
  | { allowed: true }
  | { allowed: false; reason: string; needsApproval: boolean };

/**
 * Everything a person is agreeing to when they approve a bulk campaign.
 *
 * Deliberately not the whole row. `name` and `description` are labels — a
 * typo fix should not silently stop a live campaign — while the audience, the
 * cadence and the copy are the substance. Resolved template bodies are passed
 * in rather than template ids, because a franchise editing the *template* a
 * step points at changes what sends just as surely as re-pointing the step.
 */
export interface ApprovableContent {
  audienceKind: string;
  audienceParams: Record<string, unknown>;
  reenrolAfterDays: number | null;
  steps: {
    stepNumber: number;
    delayDays: number;
    channel: string;
    /** The copy this step would send, already resolved. */
    body: string;
  }[];
}

export function approvableContent(
  campaign: Campaign,
  bodyByStep: Map<number, string>,
): ApprovableContent {
  return {
    audienceKind: campaign.audience.kind,
    audienceParams: { ...campaign.audience.params },
    reenrolAfterDays: campaign.reenrolAfterDays,
    steps: campaign.steps
      .slice()
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .map((s) => ({
        stepNumber: s.stepNumber,
        delayDays: s.delayDays,
        channel: s.channel,
        body: bodyByStep.get(s.stepNumber) ?? "",
      })),
  };
}

/**
 * A stable fingerprint of the reviewed content.
 *
 * Keys are emitted in a fixed order rather than whatever `JSON.stringify`
 * happens to produce, because an object-key reshuffle elsewhere in the code
 * would otherwise revoke every approval in the system at once.
 */
export function campaignContentHash(content: ApprovableContent): string {
  const canonical = [
    content.audienceKind,
    stableParams(content.audienceParams),
    String(content.reenrolAfterDays),
    ...content.steps.map(
      (s) => `${s.stepNumber}|${s.delayDays}|${s.channel}|${s.body}`,
    ),
  ].join("\n");
  return fnv1a(canonical);
}

function stableParams(params: Record<string, unknown>): string {
  return Object.keys(params)
    .sort()
    .map((k) => `${k}=${String(params[k])}`)
    .join(",");
}

/**
 * FNV-1a. Not cryptographic and does not need to be — this detects an edit by
 * the person who owns the campaign, not an attacker forging one.
 */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Whether this campaign may send right now.
 *
 * `needsApproval` distinguishes "nobody has approved this yet" from "somebody
 * approved it and then changed it", because those read very differently on the
 * Campaigns screen — the second is the more alarming and should say so.
 */
export function campaignGate(
  campaign: Campaign,
  content: ApprovableContent,
): CampaignGate {
  if (campaign.approvalMode === "per_message") return { allowed: true };

  if (!campaign.approvedAt || !campaign.approvedHash) {
    return {
      allowed: false,
      needsApproval: true,
      reason: "Bulk campaign has not been approved — nothing sends until it is",
    };
  }

  const current = campaignContentHash(content);
  if (current !== campaign.approvedHash) {
    return {
      allowed: false,
      needsApproval: true,
      reason:
        "Campaign changed since it was approved — the copy, audience or steps are not what was reviewed",
    };
  }

  return { allowed: true };
}

/* -------------------------------------------------------------------------
   Volume
   ------------------------------------------------------------------------- */

/**
 * The gap the content hash cannot close.
 *
 * A hash covers the audience *rule*, not what the rule currently matches.
 * `tagged: DIRECT HOMEOWNER` approved when it selected 50 accounts keeps its
 * approval when the same tag later selects 5,000 — nothing about the campaign
 * changed, so nothing revokes. Under bulk, audience size is the one thing a
 * human never reviewed and the one thing that can move on its own.
 *
 * **Measured against the last run, not against the size at approval.** That
 * distinction is the whole design. Comparing to approval-time size punishes
 * growth: a franchise adding a hundred customers a month trips any fixed
 * multiple eventually, every year, and a guard that cries wolf on ordinary
 * success gets switched off. Comparing consecutive runs makes gradual growth
 * invisible — each run is barely larger than the last — while a bulk import,
 * a retagging migration or a mistyped audience shows up as a step change on
 * the first run after it happens, which is what actually goes wrong.
 *
 * A tripped run pauses and asks; it does not revoke the campaign. This is the
 * one case where per-run approval is the right instrument, because it is the
 * one case where the run itself is the surprising thing.
 */

/** A run this many times the previous one is a step change, not growth. */
export const VOLUME_JUMP_FACTOR = 4;

/**
 * Below this, multiples are noise — 2 recipients becoming 10 is a 5× jump and
 * means nothing. The floor keeps the guard quiet on the small daily runs that
 * post-job campaigns are made of.
 */
export const VOLUME_FLOOR = 25;

export interface VolumeCheck {
  /** How many this run would contact. */
  recipientCount: number;
  /** How many the previous run contacted. Null on the first run. */
  lastRunCount: number | null;
}

export function volumeGate(check: VolumeCheck): CampaignGate {
  const { recipientCount, lastRunCount } = check;

  // Nothing to compare against, and a first run is covered by the approval
  // itself — whoever approved it saw the audience preview.
  if (lastRunCount === null) return { allowed: true };
  if (recipientCount <= VOLUME_FLOOR) return { allowed: true };
  if (recipientCount <= lastRunCount * VOLUME_JUMP_FACTOR) return { allowed: true };

  return {
    allowed: false,
    // Not a content change, so the campaign's approval stands — this run is
    // what needs a human, and only this run.
    needsApproval: false,
    reason:
      `This run would contact ${recipientCount} people; the last one contacted ${lastRunCount}. ` +
      `Paused pending review — the audience rule has not changed, so something it matches has.`,
  };
}
