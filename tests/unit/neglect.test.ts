import { describe, expect, it } from "vitest";
import {
  CONTACT_CHANNELS,
  daysSilent,
  isContactChannel,
  isNeglected,
  neglectRuleCopy,
} from "@/components/manager/neglect";
import { PIPELINE_IDS, PIPES } from "@/lib/pipelines";

const NOW = new Date("2026-07-31T12:00:00Z");
const DAY_MS = 86_400_000;

/** A touch exactly `days` ago. */
const ago = (days: number) => new Date(NOW.getTime() - days * DAY_MS);

const RESI = PIPES.resi.neglectDays;
const COMM = PIPES.comm.neglectDays;

describe("isNeglected", () => {
  it("reads its threshold from pipeline config, not a constant", () => {
    expect(RESI).toBe(14);
    expect(COMM).toBe(45);
    expect(COMM).toBeGreaterThan(RESI);
  });

  describe(`residential — ${RESI} days`, () => {
    it("is fine at 13 days", () => {
      expect(isNeglected(ago(13), RESI, NOW)).toBe(false);
    });

    it("is neglected on the threshold day itself", () => {
      // The alert copy says "no logged activity in 14+ days", and 14+ includes
      // 14. An earlier version excluded the boundary day and quietly
      // contradicted its own header.
      expect(isNeglected(ago(14), RESI, NOW)).toBe(true);
    });

    it("is neglected at 15 days", () => {
      expect(isNeglected(ago(15), RESI, NOW)).toBe(true);
    });
  });

  describe(`commercial — ${COMM} days`, () => {
    it("is fine at 44 days", () => {
      expect(isNeglected(ago(44), COMM, NOW)).toBe(false);
    });

    it("is neglected on the threshold day itself", () => {
      expect(isNeglected(ago(45), COMM, NOW)).toBe(true);
    });

    it("is neglected at 46 days", () => {
      expect(isNeglected(ago(46), COMM, NOW)).toBe(true);
    });

    it("does not inherit the residential threshold", () => {
      // 20 days silent is a dropped resi lead and a perfectly normal comm bid.
      expect(isNeglected(ago(20), RESI, NOW)).toBe(true);
      expect(isNeglected(ago(20), COMM, NOW)).toBe(false);
    });
  });

  describe("never contacted", () => {
    it("is not neglected on last-touch alone — there is nothing to measure", () => {
      expect(isNeglected(null, RESI, NOW)).toBe(false);
    });

    it("falls back to createdAt, so a lead that has sat for a month counts", () => {
      expect(isNeglected(null, RESI, NOW, null, ago(30))).toBe(true);
    });

    it("does not punish a deal created yesterday", () => {
      expect(isNeglected(null, RESI, NOW, null, ago(1))).toBe(false);
    });

    it("prefers a real last touch over createdAt", () => {
      // Created long ago but spoken to yesterday — not neglected.
      expect(isNeglected(ago(1), RESI, NOW, null, ago(300))).toBe(false);
    });
  });

  describe("booked next action", () => {
    // Long silence plus an on-time next action is a deal being worked. A
    // revival lead sits quiet for months by design and still has a call on
    // Thursday's calendar.
    it("is not neglected however long the silence, when a next action is on time", () => {
      expect(isNeglected(ago(182), RESI, NOW, "ok")).toBe(false);
      expect(isNeglected(ago(400), COMM, NOW, "ok")).toBe(false);
    });

    it("outranks even a stale createdAt on a never-contacted deal", () => {
      expect(isNeglected(null, RESI, NOW, "ok", ago(300))).toBe(false);
    });

    it("is neglected when the next action is itself overdue", () => {
      expect(isNeglected(ago(15), RESI, NOW, "overdue")).toBe(true);
      expect(isNeglected(ago(152), RESI, NOW, "overdue")).toBe(true);
    });

    it("is neglected when no next action is set", () => {
      expect(isNeglected(ago(15), RESI, NOW, null)).toBe(true);
    });

    it("does not rescue a deal that is inside its window anyway", () => {
      // Still false, but for the silence reason, not the next-action one.
      expect(isNeglected(ago(13), RESI, NOW, "overdue")).toBe(false);
    });

    it("omitting the argument tests silence alone", () => {
      expect(isNeglected(ago(182), RESI, NOW)).toBe(true);
    });
  });
});

describe("isContactChannel", () => {
  it("counts conversations", () => {
    for (const c of ["SMS", "EMAIL", "CALL", "VISIT", "NOTE"] as const) {
      expect(isContactChannel(c), c).toBe(true);
    }
  });

  it("does not count things that happened to the account, not with it", () => {
    // A trigger firing or a job completing is not someone reaching out.
    for (const c of ["TRIGGER", "JOB", "SOURCE"] as const) {
      expect(isContactChannel(c), c).toBe(false);
    }
  });

  it("exports the set it checks against", () => {
    expect([...CONTACT_CHANNELS].sort()).toEqual([
      "CALL",
      "EMAIL",
      "NOTE",
      "SMS",
      "VISIT",
    ]);
  });
});

describe("daysSilent", () => {
  it("counts whole days since the last touch", () => {
    expect(daysSilent(ago(19), NOW)).toBe(19);
    expect(daysSilent(ago(0), NOW)).toBe(0);
  });

  it("returns null when there has never been a touch", () => {
    expect(daysSilent(null, NOW)).toBeNull();
  });

  it("never goes negative on a future timestamp", () => {
    expect(daysSilent(new Date(NOW.getTime() + DAY_MS), NOW)).toBe(0);
  });
});

describe("neglectRuleCopy", () => {
  it("states the real thresholds, generated from config", () => {
    const copy = neglectRuleCopy();
    expect(copy).toContain(`${RESI}+ days`);
    expect(copy).toContain(`${COMM}+`);
    expect(copy).toContain(PIPES.comm.label);
  });

  it("states both halves of the rule, not just the silence half", () => {
    // The header claimed only the threshold while the query also required no
    // booked next action — half a rule reads as a wrong one.
    expect(neglectRuleCopy()).toContain("no next action booked");
  });

  it("reads as one sentence", () => {
    // Deliberately exact. Adding a pipeline changes this sentence, and a
    // manager-facing rule statement should not change without someone
    // re-reading it — this assertion is the thing that forces that.
    expect(neglectRuleCopy()).toBe(
      "No logged activity in 14+ days (45+ on Commercial Bid, 1+ on New Leads) and no next action booked.",
    );
  });

  it("stays a sentence rather than becoming a list as pipelines are added", () => {
    const copy = neglectRuleCopy();
    expect(copy.match(/\./g)).toHaveLength(1);
    // Every non-default threshold is named with the pipeline it applies to.
    for (const id of PIPELINE_IDS) {
      const p = PIPES[id];
      if (p.neglectDays === PIPES.resi.neglectDays) continue;
      expect(copy).toContain(`${p.neglectDays}+ on ${p.label}`);
    }
  });
});
