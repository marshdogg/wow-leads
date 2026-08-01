import { describe, expect, it } from "vitest";
import {
  audienceIsSupported,
  audienceMatches,
  mayReenrol,
  shouldEnrol,
} from "@/lib/campaigns/audience";
import type { Audience, AudienceFacts } from "@/lib/campaigns/types";

const NOW = new Date(2026, 7, 1); // 1 Aug 2026

function facts(over: Partial<AudienceFacts> = {}): AudienceFacts {
  return {
    jobCompletedAt: null,
    tags: [],
    pipelineId: "resi",
    stageId: "past",
    lastEnrolledAt: null,
    ...over,
  };
}

const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("job_completed_days_ago", () => {
  const audience: Audience = {
    kind: "job_completed_days_ago",
    params: { days: 4 },
  };

  it("matches on the exact day", () => {
    expect(audienceMatches(audience, facts({ jobCompletedAt: daysAgo(4) }), NOW)).toBe(
      true,
    );
  });

  it("does not match before or after", () => {
    expect(audienceMatches(audience, facts({ jobCompletedAt: daysAgo(3) }), NOW)).toBe(
      false,
    );
    expect(audienceMatches(audience, facts({ jobCompletedAt: daysAgo(5) }), NOW)).toBe(
      false,
    );
  });

  it("is an exact day rather than a threshold, so it cannot nag daily", () => {
    // The whole reason: "4 or more days" would re-select the same customer
    // every day forever, leaving the re-enrolment guard as the only thing
    // between them and a daily message.
    for (const n of [6, 10, 90, 400]) {
      expect(
        audienceMatches(audience, facts({ jobCompletedAt: daysAgo(n) }), NOW),
      ).toBe(false);
    }
  });

  it("never matches someone with no job", () => {
    expect(audienceMatches(audience, facts(), NOW)).toBe(false);
  });
});

describe("no_job_in_months", () => {
  const audience: Audience = { kind: "no_job_in_months", params: { months: 18 } };

  it("matches once the gap is long enough, and keeps matching", () => {
    expect(
      audienceMatches(audience, facts({ jobCompletedAt: new Date(2025, 1, 1) }), NOW),
    ).toBe(true);
  });

  it("does not match a recent customer", () => {
    expect(
      audienceMatches(audience, facts({ jobCompletedAt: new Date(2026, 5, 1) }), NOW),
    ).toBe(false);
  });

  it("counts calendar months, not 30-day blocks", () => {
    // Exactly 18 months to the day qualifies; one day short does not.
    expect(
      audienceMatches(audience, facts({ jobCompletedAt: new Date(2025, 1, 1) }), NOW),
    ).toBe(true);
    expect(
      audienceMatches(audience, facts({ jobCompletedAt: new Date(2025, 1, 2) }), NOW),
    ).toBe(false);
  });

  it("excludes someone who has never had a job", () => {
    // Win-back is for customers. Someone who has never bought is a lead, and
    // belongs to a pipeline rather than to this.
    expect(audienceMatches(audience, facts(), NOW)).toBe(false);
  });
});

describe("tagged and pipeline_stage", () => {
  it("matches on an exact tag", () => {
    const a: Audience = { kind: "tagged", params: { tag: "DIRECT HOMEOWNER" } };
    expect(audienceMatches(a, facts({ tags: ["DIRECT HOMEOWNER"] }), NOW)).toBe(true);
    expect(audienceMatches(a, facts({ tags: ["HOA BOARD"] }), NOW)).toBe(false);
  });

  it("never matches every account when the tag is missing", () => {
    const a: Audience = { kind: "tagged", params: {} };
    expect(audienceMatches(a, facts({ tags: ["ANYTHING"] }), NOW)).toBe(false);
  });

  it("matches a pipeline and stage together, not either alone", () => {
    const a: Audience = {
      kind: "pipeline_stage",
      params: { pipelineId: "newleads", stageId: "new" },
    };
    expect(
      audienceMatches(a, facts({ pipelineId: "newleads", stageId: "new" }), NOW),
    ).toBe(true);
    expect(
      audienceMatches(a, facts({ pipelineId: "newleads", stageId: "contacted" }), NOW),
    ).toBe(false);
    expect(
      audienceMatches(a, facts({ pipelineId: "resi", stageId: "new" }), NOW),
    ).toBe(false);
  });
});

describe("re-enrolment", () => {
  it("lets a first-timer in", () => {
    expect(mayReenrol(facts(), 90, NOW)).toBe(true);
  });

  it("keeps a once-only campaign once-only", () => {
    expect(mayReenrol(facts({ lastEnrolledAt: daysAgo(9999) }), null, NOW)).toBe(
      false,
    );
  });

  it("honours the window in both directions", () => {
    expect(mayReenrol(facts({ lastEnrolledAt: daysAgo(89) }), 90, NOW)).toBe(false);
    expect(mayReenrol(facts({ lastEnrolledAt: daysAgo(90) }), 90, NOW)).toBe(true);
  });

  it("blocks a match that is still inside the window", () => {
    const audience: Audience = { kind: "tagged", params: { tag: "X" } };
    const f = facts({ tags: ["X"], lastEnrolledAt: daysAgo(10) });
    expect(audienceMatches(audience, f, NOW)).toBe(true);
    expect(shouldEnrol(audience, f, 90, NOW)).toBe(false);
  });
});

describe("audiences that cannot be evaluated yet", () => {
  it("reports the job-based kinds as unsupported without completion data", () => {
    expect(audienceIsSupported("job_completed_days_ago", false)).toBe(false);
    expect(audienceIsSupported("no_job_in_months", false)).toBe(false);
  });

  it("supports them once completions arrive", () => {
    expect(audienceIsSupported("job_completed_days_ago", true)).toBe(true);
  });

  it("leaves the non-job kinds available regardless", () => {
    expect(audienceIsSupported("tagged", false)).toBe(true);
    expect(audienceIsSupported("pipeline_stage", false)).toBe(true);
  });
});
