import { describe, expect, it } from "vitest";
import {
  WINDOW_CLOSES_MONTHS,
  WINDOW_OPENS_MONTHS,
  evaluateElevenMonth,
} from "@/lib/triggers/eleven-month";
import {
  EXPIRY_HORIZON_DAYS,
  MAX_CHASES,
  MIN_DAYS_SINCE_SEND,
  evaluateSeasonal,
} from "@/lib/triggers/seasonal";
import { COOLING_MONTHS, evaluateRevival, isPriceObjection } from "@/lib/triggers/revival";
import { evaluateSequence, stepDueAt } from "@/lib/triggers/sequence";
import { chipForTrigger, describeTrigger, evaluateTrigger } from "@/lib/triggers";
import {
  dayInSequence,
  isAbsent,
  jobScopeAreas,
  parseInitialType,
  parseMonthDay,
  parseMonthYear,
  parseRelativeStale,
  pronounFrom,
  replyNoteFrom,
  shortAccountName,
  splitAreas,
} from "@/lib/triggers/record-parse";
import { CHIP_SEQUENCE, CHIP_TRIGGER } from "@/lib/triggers/types";
import type {
  ContactFacts,
  ElevenMonthFacts,
  RevivalFacts,
  SeasonalFacts,
  SequenceFacts,
} from "@/lib/triggers/types";

/**
 * The predicates decide whether a real customer gets a real message, and the
 * bullets they emit are what a human reads before approving that send. So the
 * tests care about two things in equal measure: that the boundaries are
 * exactly where they claim to be, and that the reasons say something true.
 */

const NOW = new Date(2026, 6, 31); // 31 July 2026

/* -------------------------------------------------------------------------
   Fixtures — the canonical deals from the prototype
   ------------------------------------------------------------------------- */

const delia: ContactFacts = {
  name: "Delia Marchetti",
  firstName: "Delia",
  prefers: "SMS",
  address: "(202) 555-0188",
  pronoun: null,
};

const yuki: ContactFacts = {
  name: "Yuki Tanabe",
  firstName: "Yuki",
  prefers: "EMAIL",
  address: "yuki@example.com",
  pronoun: null,
};

const rudy: ContactFacts = {
  name: "Rudy Kaminski",
  firstName: "Rudy",
  prefers: "EMAIL",
  address: "rudy@example.com",
  pronoun: null,
};

const desmond: ContactFacts = {
  name: "Desmond Achebe",
  firstName: "Desmond",
  prefers: "EMAIL",
  address: "d.achebe@northgate.example",
  pronoun: null,
};

function elevenMonth(overrides: Partial<ElevenMonthFacts> = {}): ElevenMonthFacts {
  return {
    kind: "eleven_month",
    dealId: "r1",
    dealName: "Delia Marchetti",
    contact: delia,
    jobCompletedAt: new Date(2025, 7, 20), // 20 Aug 2025 — 11 months before NOW
    completionFollowUpAt: new Date(2025, 8, 4),
    lastContactAt: new Date(2025, 8, 4),
    scope: {
      summary: "Interior repaint",
      workType: "interior",
      areas: ["hallway", "stairwell"],
      value: "$8,400",
    },
    replies: { count: 2, medianMinutes: 40, note: null },
    now: NOW,
    ...overrides,
  };
}

function seasonal(overrides: Partial<SeasonalFacts> = {}): SeasonalFacts {
  return {
    kind: "seasonal",
    dealId: "r5",
    dealName: "Yuki Tanabe",
    contact: yuki,
    promoLabel: "15% spring interior",
    promoShortLabel: "spring interior",
    promoSentAt: new Date(2026, 6, 28), // 3 days before NOW
    promoExpiresAt: new Date(2026, 7, 15), // 15 days after NOW
    promoStartsAt: new Date(2026, 4, 1),
    promoActive: true,
    replied: false,
    opened: false,
    priorJobNotes: ["interior", "low-VOC preference on file"],
    scopeAreas: ["kitchen", "stairwell"],
    priorJobPhrase: "last year",
    chasesSent: 0,
    parkRetryLabel: "spring 2027",
    now: NOW,
    ...overrides,
  };
}

function revival(overrides: Partial<RevivalFacts> = {}): RevivalFacts {
  return {
    kind: "revival",
    dealId: "r6",
    dealName: "Rudy Kaminski",
    contact: rudy,
    lostAt: new Date(2026, 0, 20), // 6 months before NOW
    lostReason: "Price",
    originalValue: "$5,600",
    originalScope: "Exterior repaint",
    lastContactAt: new Date(2026, 0, 20),
    now: NOW,
    ...overrides,
  };
}

function sequence(overrides: Partial<SequenceFacts> = {}): SequenceFacts {
  return {
    kind: "sequence",
    dealId: "b2",
    dealName: "Desmond Achebe",
    contact: desmond,
    sequenceName: "Commercial 4-touch",
    stepNumber: 1,
    totalSteps: 4,
    stepLabel: "Intro email",
    stepChannel: "EMAIL",
    delayDays: 0,
    dayInSequence: 1,
    upcomingStepLabels: ["Day 3 phone call", "Day 7 packet drop", "Day 10 final email"],
    previousStepAt: null,
    sequenceStartedAt: new Date(2026, 6, 30),
    completed: false,
    accountTags: ["GENERAL CONTRACTOR", "EXTERIOR"],
    bestFitTags: ["GENERAL CONTRACTOR", "PROPERTY MANAGER"],
    accountName: "Northgate Development",
    accountShortName: "Northgate",
    workType: "exterior",
    projectHint: null,
    reference: {
      name: "Vantage Construction Group",
      relation: "GC",
      proof: "Vantage Construction Group sites",
    },
    now: NOW,
    ...overrides,
  };
}

/* -------------------------------------------------------------------------
   11-month warranty
   ------------------------------------------------------------------------- */

describe("11-month warranty trigger", () => {
  it("fires for a job completed 11 months ago with no contact since the follow-up", () => {
    const result = evaluateElevenMonth(elevenMonth());
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([
      "Job completed 11 months ago — inside the warranty-inspection window",
      "No contact since the completion follow-up in September 2025",
      "High-traffic interior scope: hallway and stairwell were in the original job",
      "Prefers SMS; last two replies came within the hour",
    ]);
  });

  it("is eligible on the exact day the window opens", () => {
    const facts = elevenMonth({ jobCompletedAt: new Date(2025, 7, 31) });
    expect(evaluateElevenMonth(facts).eligible).toBe(true);
  });

  it("is not yet eligible one day before the window opens", () => {
    const facts = elevenMonth({ jobCompletedAt: new Date(2025, 8, 1) });
    const result = evaluateElevenMonth(facts);
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("window opens in 1 month");
  });

  it("is past the window on the exact day it closes", () => {
    const facts = elevenMonth({ jobCompletedAt: new Date(2025, 5, 30) }); // 13 months
    const result = evaluateElevenMonth(facts);
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("past the warranty-inspection window");
  });

  it("is still eligible one day before the window closes", () => {
    const facts = elevenMonth({ jobCompletedAt: new Date(2025, 6, 1) }); // 12 months
    expect(evaluateElevenMonth(facts).eligible).toBe(true);
  });

  it("does not fire when somebody has already been in touch since the follow-up", () => {
    const facts = elevenMonth({ lastContactAt: new Date(2026, 5, 2) });
    const result = evaluateElevenMonth(facts);
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("a human is already on this");
  });

  it("fires when the only contact was the completion follow-up itself", () => {
    const followUp = new Date(2025, 8, 4);
    const facts = elevenMonth({ completionFollowUpAt: followUp, lastContactAt: followUp });
    expect(evaluateElevenMonth(facts).eligible).toBe(true);
  });

  it("cannot fire without a completion date", () => {
    const result = evaluateElevenMonth(elevenMonth({ jobCompletedAt: null }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("No completion date");
  });

  it("drops the scope bullet rather than inventing rooms", () => {
    const facts = elevenMonth({
      scope: { summary: "Interior repaint", workType: "interior", areas: [], value: null },
    });
    const result = evaluateElevenMonth(facts);
    expect(result.eligible).toBe(true);
    expect(result.reasons.some((r) => r.includes("original job"))).toBe(false);
  });

  it("prefers a rep's recorded note over the computed reply latency", () => {
    const facts = elevenMonth({
      replies: { count: 2, medianMinutes: 40, note: "replies within the hour" },
    });
    expect(evaluateElevenMonth(facts).reasons).toContain(
      "Prefers SMS; replies within the hour",
    );
  });

  it("says only what it knows when there is no reply history at all", () => {
    const facts = elevenMonth({
      replies: { count: 0, medianMinutes: null, note: null },
    });
    expect(evaluateElevenMonth(facts).reasons).toContain(
      "Prefers SMS — channel taken from the contact record",
    );
  });

  it("has a window that opens before it closes", () => {
    expect(WINDOW_OPENS_MONTHS).toBeLessThan(WINDOW_CLOSES_MONTHS);
  });
});

/* -------------------------------------------------------------------------
   Seasonal promo
   ------------------------------------------------------------------------- */

describe("seasonal promo trigger", () => {
  it("fires for an unanswered live offer with the deadline in sight", () => {
    const result = evaluateSeasonal(seasonal());
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([
      "Promo sent 3 days ago with no open or reply",
      "Offer expires in 15 days — the window closes",
      "Prior job history: interior, low-VOC preference on file",
    ]);
  });

  it("says 'no reply' rather than 'no open or reply' once it has been opened", () => {
    const result = evaluateSeasonal(seasonal({ opened: true }));
    expect(result.reasons[0]).toBe("Promo sent 3 days ago with no reply");
  });

  it("is eligible on the exact day the send has aged enough", () => {
    const sentAt = new Date(2026, 6, 31 - MIN_DAYS_SINCE_SEND);
    expect(evaluateSeasonal(seasonal({ promoSentAt: sentAt })).eligible).toBe(true);
  });

  it("waits when the send is one day too fresh", () => {
    const sentAt = new Date(2026, 6, 31 - (MIN_DAYS_SINCE_SEND - 1));
    const result = evaluateSeasonal(seasonal({ promoSentAt: sentAt }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("before the first chase");
  });

  it("never chases somebody who replied", () => {
    const result = evaluateSeasonal(seasonal({ replied: true }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("belongs to a human");
  });

  it("is eligible on the last day inside the expiry horizon", () => {
    const expires = new Date(2026, 6, 31 + EXPIRY_HORIZON_DAYS);
    expect(evaluateSeasonal(seasonal({ promoExpiresAt: expires })).eligible).toBe(true);
  });

  it("holds off one day beyond the expiry horizon", () => {
    const expires = new Date(2026, 6, 31 + EXPIRY_HORIZON_DAYS + 1);
    const result = evaluateSeasonal(seasonal({ promoExpiresAt: expires }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("too far out");
  });

  it("does not chase an offer that has already expired", () => {
    const result = evaluateSeasonal(seasonal({ promoExpiresAt: new Date(2026, 6, 30) }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("the window has closed");
  });

  it("does not chase an offer whose window has not opened", () => {
    const result = evaluateSeasonal(
      seasonal({ promoStartsAt: new Date(2026, 7, 5) }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("not yet live");
  });

  it("does not chase a deactivated promo", () => {
    const result = evaluateSeasonal(seasonal({ promoActive: false }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("no longer active");
  });

  it("stops after the chase allowance is used up", () => {
    const result = evaluateSeasonal(seasonal({ chasesSent: MAX_CHASES }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("the deal parks");
  });

  it("cannot fire without a send date or an expiry", () => {
    expect(evaluateSeasonal(seasonal({ promoSentAt: null })).eligible).toBe(false);
    expect(evaluateSeasonal(seasonal({ promoExpiresAt: null })).eligible).toBe(false);
  });
});

/* -------------------------------------------------------------------------
   Revival
   ------------------------------------------------------------------------- */

describe("revival trigger", () => {
  it("fires for a price loss whose cooling period is complete", () => {
    const result = evaluateRevival(revival());
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([
      "Lost 6 months ago — the 6-month cooling period is complete",
      "Lost on price at $5,600 — a price objection on file, not scope or quality",
      "Original scope never done: exterior repaint",
      "No contact since the loss was logged in January 2026",
    ]);
  });

  it("is eligible on the exact day the cooling period completes", () => {
    const lostAt = new Date(2026, 0, 31); // exactly 6 months before NOW
    expect(evaluateRevival(revival({ lostAt })).eligible).toBe(true);
  });

  it("is not yet eligible one day before the cooling period completes", () => {
    const lostAt = new Date(2026, 1, 1);
    const result = evaluateRevival(revival({ lostAt }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("cooling period still to run");
  });

  it("does not fire on a loss that was not about price", () => {
    const result = evaluateRevival(revival({ lostReason: "Quality concerns" }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("not price");
  });

  it("does not fire when no objection was recorded", () => {
    const result = evaluateRevival(revival({ lostReason: null }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("No objection recorded");
  });

  it("does not fire when the revival is already under way", () => {
    const result = evaluateRevival(revival({ lastContactAt: new Date(2026, 4, 10) }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("already in progress");
  });

  it("cannot fire without a loss date", () => {
    const result = evaluateRevival(revival({ lostAt: null }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("No loss date");
  });

  it("recognises the ways a price objection gets written down", () => {
    for (const reason of ["Price", "price", "Too expensive", "Budget", "Cost"]) {
      expect(isPriceObjection(reason)).toBe(true);
    }
    for (const reason of ["Timing", "Quality", "Went with a friend", null]) {
      expect(isPriceObjection(reason)).toBe(false);
    }
  });

  it("cools for six months", () => {
    expect(COOLING_MONTHS).toBe(6);
  });
});

/* -------------------------------------------------------------------------
   Sequence step
   ------------------------------------------------------------------------- */

describe("sequence step trigger", () => {
  it("fires for step 1 on the day the sequence starts", () => {
    const result = evaluateSequence(sequence());
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual([
      "Day 1 of the Commercial 4-touch sequence",
      "Account tagged GENERAL CONTRACTOR — matches our best-fit profile",
      "Adjacent GC (Vantage Construction Group) already an active account — usable reference",
    ]);
  });

  it("is eligible on the exact day a delayed step comes due", () => {
    const facts = sequence({
      stepNumber: 2,
      dayInSequence: 3,
      delayDays: 3,
      previousStepAt: new Date(2026, 6, 28), // NOW − 3 days
    });
    expect(stepDueAt(facts)?.getTime()).toBe(NOW.getTime());
    expect(evaluateSequence(facts).eligible).toBe(true);
  });

  it("is not eligible the day before a step comes due", () => {
    const facts = sequence({
      stepNumber: 2,
      delayDays: 3,
      previousStepAt: new Date(2026, 6, 29), // NOW − 2 days
    });
    const result = evaluateSequence(facts);
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("not due for");
  });

  it("does not fire on a completed sequence", () => {
    const result = evaluateSequence(sequence({ completed: true }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("is complete");
  });

  it("does not fire on a step past the end of the sequence", () => {
    const result = evaluateSequence(sequence({ stepNumber: 5 }));
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("outside the 4-step");
  });

  it("cannot schedule a sequence with no start date", () => {
    const result = evaluateSequence(
      sequence({ sequenceStartedAt: null, previousStepAt: null }),
    );
    expect(result.eligible).toBe(false);
    expect(result.reasons[0]).toContain("no start date");
  });

  it("omits the fit and reference bullets when the record has neither", () => {
    const result = evaluateSequence(
      sequence({ accountTags: ["EXTERIOR"], reference: null }),
    );
    expect(result.eligible).toBe(true);
    expect(result.reasons).toEqual(["Day 1 of the Commercial 4-touch sequence"]);
  });
});

/* -------------------------------------------------------------------------
   Dispatch and presentation
   ------------------------------------------------------------------------- */

describe("trigger dispatch", () => {
  it("routes each fact shape to its own predicate", () => {
    expect(evaluateTrigger(elevenMonth()).eligible).toBe(true);
    expect(evaluateTrigger(seasonal()).eligible).toBe(true);
    expect(evaluateTrigger(revival()).eligible).toBe(true);
    expect(evaluateTrigger(sequence()).eligible).toBe(true);
  });

  it("gives event triggers the fired-today chip and scheduled ones the quiet chip", () => {
    expect(chipForTrigger("eleven_month")).toBe(CHIP_TRIGGER);
    expect(chipForTrigger("revival")).toBe(CHIP_TRIGGER);
    expect(chipForTrigger("seasonal")).toBe(CHIP_SEQUENCE);
    expect(chipForTrigger("sequence")).toBe(CHIP_SEQUENCE);
  });

  it("builds the prototype's card copy from the record", () => {
    const eleven = describeTrigger(elevenMonth());
    expect(eleven.title).toBe("11-Month Touchpoint · Delia Marchetti");
    expect(eleven.subtitle).toBe(
      "Interior repaint completed Aug 2025 · $8,400 · Residential Re-marketing",
    );
    expect(eleven.agentId).toBe("agent-remarketing");
    expect(eleven.footnote).toBe(
      "Nothing sends until you approve. Approving logs the send against Delia with agent provenance and sets the next step.",
    );

    const promo = describeTrigger(seasonal());
    expect(promo.title).toBe("Seasonal promo follow-up · Yuki Tanabe");
    expect(promo.subtitle).toBe(
      "15% spring interior offer sent 3 days ago · expires Aug 15",
    );
    expect(promo.footnote).toBe(
      "Second and final chase on this offer. If they do not respond the deal parks with a spring 2027 retry.",
    );

    const step = describeTrigger(sequence());
    expect(step.title).toBe("Sequence step 1 · Desmond Achebe");
    expect(step.subtitle).toBe("Northgate Development · Commercial 4-touch · Biz Dev");
    expect(step.agentId).toBe("agent-prospecting");
    expect(step.footnote).toBe(
      "Day 3 phone call and Day 7 packet drop generate automatically once this sends.",
    );
  });

  it("uses the recorded pronoun when the record has one", () => {
    const promo = describeTrigger(
      seasonal({ contact: { ...yuki, pronoun: "she" } }),
    );
    expect(promo.footnote).toContain("If she does not respond");
  });
});

/* -------------------------------------------------------------------------
   Reading facts out of free text
   ------------------------------------------------------------------------- */

describe("record parsing", () => {
  it("reads a completion month off a metric string", () => {
    expect(parseMonthYear("Aug 2025")?.toDateString()).toBe("Fri Aug 01 2025");
    expect(parseMonthYear("September 2025")?.getMonth()).toBe(8);
    expect(parseMonthYear("not a date")).toBeNull();
    expect(parseMonthYear(null)).toBeNull();
  });

  it("reads a bare deadline as the next one, never one already missed", () => {
    expect(parseMonthDay("Aug 15", NOW)?.toDateString()).toBe("Sat Aug 15 2026");
    // 1 July is behind us on 31 July, so it means next year's.
    expect(parseMonthDay("Jul 1", NOW)?.getFullYear()).toBe(2027);
    // Today still counts as live.
    expect(parseMonthDay("Jul 31", NOW)?.getFullYear()).toBe(2026);
    expect(parseMonthDay("whenever", NOW)).toBeNull();
  });

  it("reads the relative strings the cards display", () => {
    expect(parseRelativeStale("11 mo since job", NOW)?.getMonth()).toBe(7); // Aug 2025
    expect(parseRelativeStale("lost 6 mo ago", NOW)?.getMonth()).toBe(0); // Jan 2026
    expect(parseRelativeStale("19d silent", NOW)?.getDate()).toBe(12);
    expect(parseRelativeStale("promo sent 3d ago", NOW)?.getDate()).toBe(28);
    expect(parseRelativeStale("booked yesterday", NOW)).toBeNull();
  });

  it("reads a Biz Dev first-contact date as being in the past", () => {
    expect(parseInitialType("Site drop-by · Jul 30", NOW)?.toDateString()).toBe(
      "Thu Jul 30 2026",
    );
    // A date ahead of today must mean last year, not a first contact in the future.
    expect(parseInitialType("Cold call · Dec 2", NOW)?.getFullYear()).toBe(2025);
    expect(parseInitialType(null, NOW)).toBeNull();
  });

  it("treats an unfilled field as an absence, never as a fact", () => {
    for (const empty of [
      "None — new account",
      "Not captured yet",
      "No history on file",
      "n/a",
      "unknown",
      "  ",
    ]) {
      expect(isAbsent(empty)).toBe(true);
    }
    for (const real of [
      "Low-VOC",
      "Benjamin Moore Regal Select · Simply White OC-117",
      "2,240 sq ft",
    ]) {
      expect(isAbsent(real)).toBe(false);
    }
  });

  it("takes the painted areas off the completion record and drops bare counts", () => {
    const job = {
      body: "Interior repaint completed — 4 rooms, hallway, stairwell · $8,400",
      structured: null,
    } as Parameters<typeof jobScopeAreas>[0];
    expect(jobScopeAreas(job)).toEqual(["hallway", "stairwell"]);
  });

  it("prefers a structured scope field over the body text", () => {
    const job = {
      body: "Interior repaint completed — 4 rooms · $8,400",
      structured: [{ label: "ROOMS", value: "kitchen, den" }],
    } as Parameters<typeof jobScopeAreas>[0];
    expect(jobScopeAreas(job)).toEqual(["kitchen", "den"]);
  });

  it("yields no areas rather than junk when the record has none", () => {
    expect(jobScopeAreas(undefined)).toEqual([]);
    expect(splitAreas("Not captured yet")).toEqual([]);
    expect(splitAreas(undefined)).toEqual([]);
  });

  it("reads a pronoun only from what a rep wrote down", () => {
    expect(pronounFrom("Warm and direct. She replies within the hour.")).toBe("she");
    expect(pronounFrom("Ask for him at the site office.")).toBe("he");
    expect(pronounFrom("They handle scheduling for the whole block.")).toBe("they");
    // A name is not evidence.
    expect(pronounFrom("Delia Marchetti, homeowner, decision maker")).toBeNull();
    expect(pronounFrom("")).toBeNull();
  });

  it("lifts a recorded reply habit verbatim", () => {
    expect(
      replyNoteFrom(
        "Warm, direct, replies within the hour. Daughter's wedding is the real deadline.",
      ),
    ).toBe("replies within the hour");
    expect(replyNoteFrom("Prefers a call on Fridays.")).toBeNull();
  });

  it("shortens a company name only when it ends in a corporate word", () => {
    expect(shortAccountName("Northgate Development")).toBe("Northgate");
    expect(shortAccountName("Vantage Construction Group")).toBe("Vantage Construction");
    expect(shortAccountName("Nnamdi Holdings")).toBe("Nnamdi");
    expect(shortAccountName("Redstone Property Management")).toBe("Redstone Property");
    // Nothing to strip — leave it alone rather than mangle it.
    expect(shortAccountName("Bright Path Real Estate")).toBe("Bright Path Real Estate");
    expect(shortAccountName("Meridian")).toBe("Meridian");
  });

  it("trusts a human-written day label over cumulative arithmetic", () => {
    const steps = [
      { stepNumber: 1, label: "Intro email", delayDays: 0 },
      { stepNumber: 2, label: "Day 3 phone call", delayDays: 3 },
      { stepNumber: 3, label: "Packet drop", delayDays: 4 },
    ] as Parameters<typeof dayInSequence>[0];
    expect(dayInSequence(steps, 1)).toBe(1);
    expect(dayInSequence(steps, 2)).toBe(3); // from the label, not 0 + 3 + 1
    // No day in this label, so fall back to the delays that came *before* it:
    // step 1 (0) + step 2 (3), landing on day 4. Step 3's own delay is how
    // long until step 4, not how long until itself.
    expect(dayInSequence(steps, 3)).toBe(4);
  });
});
