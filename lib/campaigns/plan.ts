import { shouldEnrol } from "./audience";
import type {
  AudienceFacts,
  Campaign,
  CampaignEnrolment,
  CampaignStep,
} from "./types";

/**
 * What a campaign run would do, decided without touching the database.
 *
 * The runner's judgement lives here so it can be tested at the boundaries
 * that matter — who enrols, whose next step is due, who leaves and why —
 * without a fixture database and without a clock. `runner.ts` takes this plan
 * and performs it.
 *
 * The separation also makes a dry run honest: the Campaigns screen can show
 * "this would enrol 14 and send 3" by calling exactly the code that will run
 * tomorrow morning, rather than an approximation of it.
 */

/** Somebody entering the campaign for the first time. */
export interface EnrolAction {
  type: "enrol";
  dealId: string;
  /** Step one always sends on the day of enrolment when its delay is zero. */
  sendsImmediately: boolean;
}

/** An existing enrolment whose next step has come due. */
export interface AdvanceAction {
  type: "advance";
  enrolmentId: string;
  dealId: string;
  step: CampaignStep;
}

/** Somebody leaving, with a reason worth recording. */
export interface ExitAction {
  type: "exit";
  enrolmentId: string;
  dealId: string;
  reason: string;
}

/** An enrolment that has run out of steps. */
export interface CompleteAction {
  type: "complete";
  enrolmentId: string;
  dealId: string;
}

export type CampaignAction =
  | EnrolAction
  | AdvanceAction
  | ExitAction
  | CompleteAction;

export interface CandidateFacts extends AudienceFacts {
  dealId: string;
  /** Set when the deal has been booked — the exit that matters most. */
  booked: boolean;
  /** Set when the contact has opted out of everything. */
  unsubscribed: boolean;
}

export interface PlanInput {
  campaign: Campaign;
  candidates: CandidateFacts[];
  enrolments: CampaignEnrolment[];
  now: Date;
  /**
   * Steps already performed today, keyed `enrolmentId:stepNumber`. Two runs
   * on one morning must not send twice, and the enrolment's own
   * `currentStep` cannot express "already done today" on its own.
   */
  performedToday?: ReadonlySet<string>;
}

export interface CampaignPlan {
  campaignId: string;
  actions: CampaignAction[];
  /** Why the campaign as a whole did nothing, when that is the case. */
  blocked: string | null;
}

export function actionKey(enrolmentId: string, stepNumber: number): string {
  return `${enrolmentId}:${stepNumber}`;
}

/**
 * Exits are evaluated before advances, deliberately.
 *
 * A customer who booked yesterday should not receive today's "still thinking
 * about it?" step on the way out. Deciding to exit first means the reason is
 * recorded and the send never happens, rather than both happening in an order
 * that depends on which loop ran first.
 */
export function planCampaignRun(input: PlanInput): CampaignPlan {
  const { campaign, candidates, enrolments, now } = input;
  const performed = input.performedToday ?? new Set<string>();
  const actions: CampaignAction[] = [];

  if (!campaign.active) {
    return { campaignId: campaign.id, actions, blocked: "Campaign is not active" };
  }
  if (campaign.steps.length === 0) {
    return { campaignId: campaign.id, actions, blocked: "Campaign has no steps" };
  }

  const byDeal = new Map(candidates.map((c) => [c.dealId, c]));
  const active = enrolments.filter((e) => e.state === "active");
  const enrolledDeals = new Set(active.map((e) => e.dealId));

  /* ---- existing enrolments: exit, advance or complete ------------------ */
  for (const enrolment of active) {
    const candidate = byDeal.get(enrolment.dealId);

    const exit = exitReasonFor(candidate, campaign);
    if (exit) {
      actions.push({
        type: "exit",
        enrolmentId: enrolment.id,
        dealId: enrolment.dealId,
        reason: exit,
      });
      continue;
    }

    const next = campaign.steps.find(
      (s) => s.stepNumber === enrolment.currentStep + 1,
    );
    if (!next) {
      actions.push({
        type: "complete",
        enrolmentId: enrolment.id,
        dealId: enrolment.dealId,
      });
      continue;
    }

    if (performed.has(actionKey(enrolment.id, next.stepNumber))) continue;
    if (!stepIsDue(campaign, enrolment, next, now)) continue;

    actions.push({
      type: "advance",
      enrolmentId: enrolment.id,
      dealId: enrolment.dealId,
      step: next,
    });
  }

  /* ---- new enrolments -------------------------------------------------- */
  for (const candidate of candidates) {
    if (enrolledDeals.has(candidate.dealId)) continue;
    if (candidate.unsubscribed || candidate.booked) continue;
    if (!shouldEnrol(campaign.audience, candidate, campaign.reenrolAfterDays, now)) {
      continue;
    }
    actions.push({
      type: "enrol",
      dealId: candidate.dealId,
      sendsImmediately: (campaign.steps[0]?.delayDays ?? 0) === 0,
    });
  }

  return { campaignId: campaign.id, actions, blocked: null };
}

/**
 * Why this enrolment should stop.
 *
 * A booking is the important one: the campaign has done its job, and "are you
 * still thinking about it?" to somebody who booked on Tuesday is the single
 * most damaging message this system could send.
 */
function exitReasonFor(
  candidate: CandidateFacts | undefined,
  campaign: Campaign,
): string | null {
  if (!candidate) return "Deal is no longer in the candidate set";
  if (candidate.unsubscribed) return "Contact unsubscribed";
  if (candidate.booked) return "Job booked";
  // A stage-based nurture ends when they leave the stage; a post-job campaign
  // must *not*, because "4 days after the job" stops matching on day 5 and
  // everybody mid-sequence would be thrown out.
  if (campaign.audience.kind === "pipeline_stage") {
    const { pipelineId, stageId } = campaign.audience.params;
    if (candidate.pipelineId !== pipelineId || candidate.stageId !== stageId) {
      return "Audience no longer matches";
    }
  }
  return null;
}

/**
 * Whether the next step's delay has elapsed.
 *
 * Measured from enrolment plus the cumulative delay of every step up to and
 * including this one, rather than from "the last send". Cumulative means a
 * run that is skipped or delayed does not shift the whole schedule — day 7
 * stays day 7 even if day 3 went out late.
 */
export function stepIsDue(
  campaign: Campaign,
  enrolment: CampaignEnrolment,
  step: CampaignStep,
  now: Date,
): boolean {
  const cumulative = campaign.steps
    .filter((s) => s.stepNumber <= step.stepNumber)
    .reduce((total, s) => total + s.delayDays, 0);
  const dueAt = new Date(
    enrolment.enrolledAt.getTime() + cumulative * 86_400_000,
  );
  return now.getTime() >= dueAt.getTime();
}
