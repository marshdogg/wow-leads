import { describe, expect, it } from "vitest";
import {
  daysSilent,
  isNeglected,
  neglectRuleCopy,
} from "@/components/manager/neglect";
import { PIPES } from "@/lib/pipelines";

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

    it("is not yet neglected at exactly 14 days", () => {
      // Same boundary the repository's SQL uses: strictly older than the window.
      expect(isNeglected(ago(14), RESI, NOW)).toBe(false);
    });

    it("is neglected at 15 days", () => {
      expect(isNeglected(ago(15), RESI, NOW)).toBe(true);
    });
  });

  describe(`commercial — ${COMM} days`, () => {
    it("is fine at 44 days", () => {
      expect(isNeglected(ago(44), COMM, NOW)).toBe(false);
    });

    it("is not yet neglected at exactly 45 days", () => {
      expect(isNeglected(ago(45), COMM, NOW)).toBe(false);
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

  describe("no last touch", () => {
    it("counts a never-touched deal as neglected", () => {
      expect(isNeglected(null, RESI, NOW)).toBe(true);
      expect(isNeglected(undefined, COMM, NOW)).toBe(true);
    });

    it("counts an unparseable timestamp as neglected rather than silently fine", () => {
      expect(isNeglected("not a date", RESI, NOW)).toBe(true);
    });
  });

  it("accepts an ISO string as well as a Date", () => {
    expect(isNeglected(ago(15).toISOString(), RESI, NOW)).toBe(true);
    expect(isNeglected(ago(13).toISOString(), RESI, NOW)).toBe(false);
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
});
