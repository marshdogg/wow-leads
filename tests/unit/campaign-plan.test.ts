import { describe, expect, it } from "vitest";
import {
  actionKey,
  planCampaignRun,
  stepIsDue,
  type CandidateFacts,
} from "@/lib/campaigns/plan";
import type {
  Campaign,
  CampaignEnrolment,
  CampaignStep,
} from "@/lib/campaigns/types";

/**
 * The runner decides who gets contacted and when. Every case below is one a
 * franchise would notice going wrong — a customer nagged the day after they
 * booked, a review request sent twice because the cron ran twice, a sequence
 * that silently stops.
 */

const NOW = new Date(2026, 7, 1); // 1 August 2026

function step(n: number, delayDays: number): CampaignStep {
  return {
    id: `st-${n}`,
    campaignId: "cmp-review",
    stepNumber: n,
    delayDays,
    channel: "SMS",
    templateId: null,
    label: `Step ${n}`,
  };
}

function campaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: "cmp-review",
    name: "Google review request",
    category: "RESIDENTIAL LEADS",
    description: "",
    audience: { kind: "job_completed_days_ago", params: { days: 4 } },
    approvalMode: "per_message",
    active: true,
    reenrolAfterDays: null,
    authoredBy: "u-marshall",
    steps: [step(1, 0), step(2, 3)],
    ...overrides,
  };
}

function candidate(overrides: Partial<CandidateFacts> = {}): CandidateFacts {
  return {
    dealId: "r1",
    jobCompletedAt: new Date(2026, 6, 28), // exactly 4 days before NOW
    tags: ["DIRECT HOMEOWNER"],
    pipelineId: "resi",
    stageId: "result",
    lastEnrolledAt: null,
    booked: false,
    unsubscribed: false,
    ...overrides,
  };
}

function enrolment(overrides: Partial<CampaignEnrolment> = {}): CampaignEnrolment {
  return {
    id: "enr-1",
    campaignId: "cmp-review",
    dealId: "r1",
    enrolledAt: new Date(2026, 6, 29),
    currentStep: 1,
    state: "active",
    exitReason: null,
    ...overrides,
  };
}

describe("enrolment", () => {
  it("enrols a customer whose job finished exactly N days ago", () => {
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate()],
      enrolments: [],
      now: NOW,
    });
    expect(plan.actions).toEqual([
      { type: "enrol", dealId: "r1", sendsImmediately: true },
    ]);
  });

  it("does not enrol a day early or a day late", () => {
    for (const completedAt of [new Date(2026, 6, 27), new Date(2026, 6, 29)]) {
      const plan = planCampaignRun({
        campaign: campaign(),
        candidates: [candidate({ jobCompletedAt: completedAt })],
        enrolments: [],
        now: NOW,
      });
      expect(plan.actions).toEqual([]);
    }
  });

  it("never enrols somebody already in the campaign", () => {
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate()],
      enrolments: [enrolment({ currentStep: 0 })],
      now: NOW,
    });
    expect(plan.actions.some((a) => a.type === "enrol")).toBe(false);
  });

  it("never enrols somebody who has unsubscribed or already booked", () => {
    for (const flag of ["unsubscribed", "booked"] as const) {
      const plan = planCampaignRun({
        campaign: campaign(),
        candidates: [candidate({ [flag]: true })],
        enrolments: [],
        now: NOW,
      });
      expect(plan.actions).toEqual([]);
    }
  });

  it("respects the re-enrolment window", () => {
    const recently = candidate({ lastEnrolledAt: new Date(2026, 6, 20) });
    expect(
      planCampaignRun({
        campaign: campaign({ reenrolAfterDays: 30 }),
        candidates: [recently],
        enrolments: [],
        now: NOW,
      }).actions,
    ).toEqual([]);

    expect(
      planCampaignRun({
        campaign: campaign({ reenrolAfterDays: 10 }),
        candidates: [recently],
        enrolments: [],
        now: NOW,
      }).actions,
    ).toHaveLength(1);
  });

  it("does nothing at all for an inactive campaign or one with no steps", () => {
    for (const c of [campaign({ active: false }), campaign({ steps: [] })]) {
      const plan = planCampaignRun({
        campaign: c,
        candidates: [candidate()],
        enrolments: [],
        now: NOW,
      });
      expect(plan.actions).toEqual([]);
      expect(plan.blocked).toBeTruthy();
    }
  });
});

describe("advancement", () => {
  it("advances an enrolment whose next step has come due", () => {
    // Enrolled 29 Jul, step 2 delay 3 → due 1 Aug (step 1 delay is 0).
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate()],
      enrolments: [enrolment()],
      now: NOW,
    });
    const advance = plan.actions.find((a) => a.type === "advance");
    expect(advance).toMatchObject({ enrolmentId: "enr-1", dealId: "r1" });
  });

  it("does not advance before the delay has elapsed", () => {
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate()],
      enrolments: [enrolment({ enrolledAt: new Date(2026, 6, 30) })],
      now: NOW,
    });
    expect(plan.actions.some((a) => a.type === "advance")).toBe(false);
  });

  it("measures each step from enrolment, so a late step does not shift the rest", () => {
    const c = campaign({ steps: [step(1, 0), step(2, 3), step(3, 4)] });
    const e = enrolment({ enrolledAt: new Date(2026, 6, 25), currentStep: 2 });
    // Step 3 is cumulative day 7 from enrolment: 25 Jul + 7 = 1 Aug.
    expect(stepIsDue(c, e, c.steps[2], NOW)).toBe(true);
    expect(stepIsDue(c, e, c.steps[2], new Date(2026, 6, 31))).toBe(false);
  });

  it("completes an enrolment that has run out of steps", () => {
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate()],
      enrolments: [enrolment({ currentStep: 2 })],
      now: NOW,
    });
    expect(plan.actions).toContainEqual({
      type: "complete",
      enrolmentId: "enr-1",
      dealId: "r1",
    });
  });
});

describe("exits", () => {
  it("exits a booked customer instead of sending them the next step", () => {
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate({ booked: true })],
      enrolments: [enrolment()],
      now: NOW,
    });
    expect(plan.actions).toContainEqual({
      type: "exit",
      enrolmentId: "enr-1",
      dealId: "r1",
      reason: "Job booked",
    });
    // The whole point: no send goes out on the way out the door.
    expect(plan.actions.some((a) => a.type === "advance")).toBe(false);
  });

  it("exits an unsubscribed contact", () => {
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate({ unsubscribed: true })],
      enrolments: [enrolment()],
      now: NOW,
    });
    expect(plan.actions[0]).toMatchObject({ reason: "Contact unsubscribed" });
  });

  it("exits a stage-nurture enrolment when they leave the stage", () => {
    const c = campaign({
      audience: {
        kind: "pipeline_stage",
        params: { pipelineId: "resi", stageId: "promo" },
      },
    });
    const plan = planCampaignRun({
      campaign: c,
      candidates: [candidate({ stageId: "result" })],
      enrolments: [enrolment()],
      now: NOW,
    });
    expect(plan.actions[0]).toMatchObject({ reason: "Audience no longer matches" });
  });

  it("keeps a post-job enrolment when the exact-day window passes", () => {
    // The window stops matching on day 5 by design. Treating that as an exit
    // would throw everybody out of a review campaign one day after enrolling.
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate({ jobCompletedAt: new Date(2026, 6, 20) })],
      enrolments: [enrolment()],
      now: NOW,
    });
    expect(plan.actions.some((a) => a.type === "exit")).toBe(false);
  });
});

describe("idempotency", () => {
  it("does not repeat a step already performed today", () => {
    const performedToday = new Set([actionKey("enr-1", 2)]);
    const plan = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate()],
      enrolments: [enrolment()],
      now: NOW,
      performedToday,
    });
    expect(plan.actions.some((a) => a.type === "advance")).toBe(false);
  });

  it("a second run the same morning plans nothing new", () => {
    const first = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate()],
      enrolments: [enrolment()],
      now: NOW,
    });
    const advance = first.actions.find((a) => a.type === "advance");
    expect(advance).toBeDefined();

    // Replay with the first run's effects applied: the step is recorded, and
    // the enrolment has moved on.
    const second = planCampaignRun({
      campaign: campaign(),
      candidates: [candidate()],
      enrolments: [enrolment({ currentStep: 2 })],
      now: NOW,
      performedToday: new Set([actionKey("enr-1", 2)]),
    });
    expect(second.actions.some((a) => a.type === "advance")).toBe(false);
    // It completes instead, which is correct and also idempotent.
    expect(second.actions).toContainEqual({
      type: "complete",
      enrolmentId: "enr-1",
      dealId: "r1",
    });
  });
});
