import { describe, expect, it } from "vitest";
import {
  actionKey,
  planCampaignRun,
  stepIsDue,
  type CandidateFacts,
} from "@/lib/campaigns/plan";
import {
  approvableContent,
  campaignContentHash,
  campaignGate,
  volumeGate,
  VOLUME_JUMP_FACTOR,
} from "@/lib/campaigns/approval";
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
    approvedAt: null,
    approvedBy: null,
    approvedHash: null,
    lastRunCount: null,
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

/* -------------------------------------------------------------------------
   Bulk approval — the gate that keeps "nothing sends unreviewed" true
   ------------------------------------------------------------------------- */

describe("bulk approval gate", () => {
  const bodies = new Map([
    [1, "Hi Delia — how did we do? A quick Google review helps a lot."],
    [2, "Hi Delia — one last nudge on that review if you have a minute."],
  ]);
  const unapproved = campaign({ approvalMode: "bulk" });
  const content = approvableContent(unapproved, bodies);
  const approvedHash = campaignContentHash(content);
  const bulk = campaign({
    approvalMode: "bulk",
    approvedAt: new Date(2026, 6, 30),
    approvedBy: "u-marshall",
    approvedHash,
  });

  it("lets a per-message campaign through without any campaign approval", () => {
    expect(campaignGate(campaign(), content)).toEqual({ allowed: true });
  });

  it("blocks a bulk campaign nobody has approved", () => {
    const gate = campaignGate(unapproved, content);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toContain("has not been approved");
  });

  it("lets an approved bulk campaign send", () => {
    expect(campaignGate(bulk, content)).toEqual({ allowed: true });
  });

  it("revokes approval when the copy is edited", () => {
    const edited = approvableContent(
      bulk,
      new Map([[1, "Hi Delia — leave us five stars and we'll knock 10% off."], [2, bodies.get(2)!]]),
    );
    const gate = campaignGate(bulk, edited);
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) expect(gate.reason).toContain("changed since it was approved");
  });

  it("revokes approval when the audience is widened", () => {
    const wider = approvableContent(
      { ...bulk, audience: { kind: "tagged", params: { tag: "DIRECT HOMEOWNER" } } },
      bodies,
    );
    expect(campaignGate(bulk, wider).allowed).toBe(false);
  });

  it("revokes approval when a step's timing or channel changes", () => {
    for (const steps of [
      [step(1, 0), step(2, 30)],
      [{ ...step(2, 3), channel: "EMAIL" }, step(1, 0)],
    ]) {
      const changed = approvableContent({ ...bulk, steps }, bodies);
      expect(campaignGate(bulk, changed).allowed).toBe(false);
    }
  });

  it("does not revoke over a rename — a label is not the substance", () => {
    const renamed = approvableContent(
      { ...bulk, name: "Review ask v2", description: "tidied up" },
      bodies,
    );
    expect(campaignGate(bulk, renamed)).toEqual({ allowed: true });
  });

  it("hashes step order stably, so reordering the array is not an edit", () => {
    const reversed = approvableContent({ ...bulk, steps: [step(2, 3), step(1, 0)] }, bodies);
    expect(campaignContentHash(reversed)).toBe(approvedHash);
  });

  it("distinguishes never-approved from approved-then-changed", () => {
    const never = campaignGate(unapproved, content);
    const stale = campaignGate(bulk, approvableContent({ ...bulk, reenrolAfterDays: 90 }, bodies));
    expect(never.allowed).toBe(false);
    expect(stale.allowed).toBe(false);
    if (!never.allowed && !stale.allowed) {
      expect(never.reason).not.toBe(stale.reason);
      expect(never.needsApproval).toBe(true);
      expect(stale.needsApproval).toBe(true);
    }
  });
});

describe("volume guard", () => {
  it("allows a first run, which the approval itself covered", () => {
    expect(volumeGate({ recipientCount: 5000, lastRunCount: null })).toEqual({
      allowed: true,
    });
  });

  it("is invisible to ordinary growth", () => {
    // A list growing a few percent a run never trips, however long it runs.
    let last = 50;
    for (let i = 0; i < 40; i++) {
      const next = Math.ceil(last * 1.08);
      expect(volumeGate({ recipientCount: next, lastRunCount: last }).allowed).toBe(true);
      last = next;
    }
    expect(last).toBeGreaterThan(1000); // genuinely grew, never nagged
  });

  it("catches a step change on the first run after it happens", () => {
    const gate = volumeGate({ recipientCount: 5000, lastRunCount: 50 });
    expect(gate.allowed).toBe(false);
    if (!gate.allowed) {
      expect(gate.reason).toContain("5000");
      expect(gate.reason).toContain("50");
      // The campaign is still approved — only this run is held.
      expect(gate.needsApproval).toBe(false);
    }
  });

  it("stays quiet on the small daily runs post-job campaigns are made of", () => {
    // 2 → 10 is a 5x jump and means nothing.
    expect(volumeGate({ recipientCount: 10, lastRunCount: 2 }).allowed).toBe(true);
  });

  it("trips exactly at the factor, above the floor", () => {
    const last = 30;
    expect(
      volumeGate({ recipientCount: last * VOLUME_JUMP_FACTOR, lastRunCount: last }).allowed,
    ).toBe(true);
    expect(
      volumeGate({ recipientCount: last * VOLUME_JUMP_FACTOR + 1, lastRunCount: last })
        .allowed,
    ).toBe(false);
  });

  it("does not fire when a list shrinks", () => {
    expect(volumeGate({ recipientCount: 40, lastRunCount: 5000 }).allowed).toBe(true);
  });
});
