import { describe, expect, it, vi } from "vitest";
import type { deals, jobs, touchpoints } from "@/db/schema";

/**
 * Where job facts come from.
 *
 * There used to be two answers — the `jobs` table and a prose heuristic over
 * JOB touchpoints — and the heuristic existed for one reason: the `JOB`
 * channel carries an estimate booking as well as a completion, so reading the
 * newest JOB row as "the job finished" was wrong in a way nothing surfaced.
 * Booking an estimate for a past customer reset their warranty clock to zero
 * and silently switched off the 11-month trigger.
 *
 * The heuristic is gone and `jobs` is authoritative. These tests hold the
 * property the heuristic used to defend, at the layer that now owns it: a
 * touchpoint cannot move a job fact, whatever it says.
 */

// `fact-source.ts` reaches the Neon client at module load. The fact *builders*
// never touch it — only `loadFactContext` does — so the db module is stubbed
// and the builders imported after.
vi.doMock("@/db", () => ({ db: {}, schema: {} }));
const {
  elevenMonthFacts,
  neighbourCampaignFacts,
} = await import("@/lib/triggers/fact-source");
type FactContext = Awaited<
  ReturnType<typeof import("@/lib/triggers/fact-source").loadFactContext>
>;

type DealRow = typeof deals.$inferSelect;
type JobRow = typeof jobs.$inferSelect;
type TouchpointRow = typeof touchpoints.$inferSelect;

const NOW = new Date(2026, 6, 31, 9, 0);
const COMPLETED = new Date(2025, 7, 22);

function dealRow(overrides: Partial<DealRow> = {}): DealRow {
  return {
    id: "r1",
    pipelineId: "resi",
    stageId: "past",
    track: "repeat",
    name: "Delia Marchetti",
    accountLine: "2712 Cathedral Ave NW",
    accountId: "acct-r1",
    tags: ["INTERIOR"],
    source: "Past Customer",
    ownerUserId: null,
    ownerAgentId: "remarketing",
    ownerInitials: "AI",
    ownerName: "Re-marketing agent",
    ownerIsAgent: true,
    assignedBy: "Trigger",
    aiPending: true,
    stale: "11 mo since job",
    staleWarn: false,
    lastTouchAt: NOW,
    metrics: [{ label: "LAST JOB", value: "$8,400" }],
    sequenceId: null,
    seq: null,
    seqName: null,
    seqStep: null,
    nextLabel: null,
    nextDue: null,
    nextState: null,
    nextDueAt: null,
    act: "Review draft",
    quick: true,
    osRef: null,
    initialType: null,
    resultOutcome: null,
    retryAt: null,
    promoId: null,
    sourcedFromDealId: null,
    createdAt: COMPLETED,
    updatedAt: NOW,
    ...overrides,
  };
}

function jobRow(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: "job-r1",
    wowOsJobId: null,
    accountId: "acct-r1",
    dealId: "r1",
    completedAt: COMPLETED,
    workType: "interior",
    scope: "4 rooms, hallway, stairwell",
    areas: ["hallway", "stairwell"],
    valueCents: 840_000,
    crew: "Kris Jolin crew",
    ...overrides,
  };
}

function touchpointRow(overrides: Partial<TouchpointRow> = {}): TouchpointRow {
  return {
    id: "tp-1",
    dealId: "r1",
    accountId: "acct-r1",
    channel: "JOB",
    body: "Interior repaint completed — 4 rooms, hallway, stairwell · $8,400",
    who: "Kris Jolin",
    byAgent: false,
    initials: "KJ",
    userId: null,
    agentId: null,
    structured: null,
    occurredAt: COMPLETED,
    ...overrides,
  };
}

/** An estimate booked this morning, exactly as `bookDeal` writes it. */
const ESTIMATE_BOOKING = touchpointRow({
  id: "tp-booking",
  body: "Estimate scheduled — Thu Aug 6 at 10:00 AM with Kris Jolin · EST-40218",
  structured: [{ label: "EVENT", value: "estimate_booked" }],
  occurredAt: NOW,
});

function context(overrides: Partial<FactContext> = {}): FactContext {
  const deal = dealRow();
  return {
    now: NOW,
    deals: [deal],
    accountsById: new Map([
      [
        "acct-r1",
        {
          id: "acct-r1",
          name: "Marchetti residence",
          tags: ["INTERIOR"],
          details: [],
          createdAt: COMPLETED,
          updatedAt: NOW,
        },
      ],
    ]),
    accessNotesByAccount: new Map(),
    contactsByAccount: new Map(),
    touchpointsByDeal: new Map(),
    promosById: new Map(),
    sequencesById: new Map(),
    stepsBySequence: new Map(),
    approvalsByDeal: new Map(),
    canvassByDeal: new Map(),
    jobsByAccount: new Map([["acct-r1", [jobRow()]]]),
    ...overrides,
  } as FactContext;
}

describe("job facts come from `jobs`, not from touchpoints", () => {
  it("does not let an estimate booked today move the completion date", () => {
    const facts = elevenMonthFacts(
      context({ touchpointsByDeal: new Map([["r1", [ESTIMATE_BOOKING]]]) }),
      dealRow(),
    );
    expect(facts?.jobCompletedAt).toEqual(COMPLETED);
  });

  it("takes work type and areas off the row, not off the body", () => {
    // The body says interior and names the rooms; the row says exterior and
    // names different ones. The row wins — that is the whole point of it.
    const ctx = context({
      touchpointsByDeal: new Map([["r1", [touchpointRow()]]]),
      jobsByAccount: new Map([
        [
          "acct-r1",
          [jobRow({ workType: "exterior", areas: ["siding", "trim"] })],
        ],
      ]),
    });
    const facts = elevenMonthFacts(ctx, dealRow());
    expect(facts?.scope.workType).toBe("exterior");
    expect(facts?.scope.areas).toEqual(["siding", "trim"]);
  });

  it("falls back to the account's tag only when there is no job row", () => {
    const ctx = context({
      jobsByAccount: new Map(),
      touchpointsByDeal: new Map([["r1", [touchpointRow()]]]),
    });
    // No job row and no COMPLETED metric leaves the display string, which is
    // the last resort and still says eleven months.
    const facts = elevenMonthFacts(ctx, dealRow());
    expect(facts?.scope.workType).toBe("interior"); // the INTERIOR tag
    expect(facts?.scope.areas).toEqual([]);
  });

  it("will not claim a finished job to the neighbours without a job row", () => {
    // A JOB touchpoint saying "completed" is not evidence. "We just finished
    // the exterior next door" goes to real houses on a real street, so the
    // trigger needs the row or it does not fire.
    const ctx = context({
      jobsByAccount: new Map(),
      touchpointsByDeal: new Map([["r1", [touchpointRow()]]]),
      canvassByDeal: new Map([
        [
          "r1",
          [
            {
              id: "cv-1",
              sourceDealId: "r1",
              dealId: null,
              address: "2710 Cathedral Ave NW",
              notes: "next door",
              status: "pending",
              createdAt: NOW,
              updatedAt: NOW,
            },
          ],
        ],
      ]),
    } as Partial<FactContext>);
    expect(neighbourCampaignFacts(ctx, dealRow())).toEqual([]);
  });
});
