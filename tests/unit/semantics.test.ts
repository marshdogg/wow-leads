import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEGLECT_DAYS,
  PIPELINE_IDS,
  PIPES,
  columnBorder,
  columnTitleColor,
  resolveNeglectDays,
  stageCountsForNeglect,
  stageRequiresReason,
  stageRequiresRevisitDate,
  validatePipelineStages,
  winRate,
} from "@/lib/pipelines";
import type { SemanticType } from "@/lib/types";

const stage = (semanticType: SemanticType, over = {}) => ({
  id: "s",
  label: "S",
  hint: "",
  semanticType,
  ...over,
});

/* -------------------------------------------------------------------------
   The rule the whole release rests on
   ------------------------------------------------------------------------- */

describe("every pipeline can say how a deal ended", () => {
  it("has at least one won and one lost stage", () => {
    // The gap that let Commercial ship terminating in On-Hold, which made its
    // win rate uncomputable. Addendum §2.2.
    for (const id of PIPELINE_IDS) {
      expect(validatePipelineStages(PIPES[id].stages)).toEqual([]);
    }
  });

  it("names what is missing rather than failing silently", () => {
    expect(validatePipelineStages([stage("open")])).toEqual([
      "A pipeline needs at least one Won stage.",
      "A pipeline needs at least one Lost stage.",
    ]);
    expect(validatePipelineStages([stage("open"), stage("won")])).toEqual([
      "A pipeline needs at least one Lost stage.",
    ]);
  });

  it("does not count an archived stage toward the requirement", () => {
    // Archiving the only Won stage leaves the pipeline unable to report.
    const stages = [stage("open"), stage("won", { active: false }), stage("lost")];
    expect(validatePipelineStages(stages)).toEqual([
      "A pipeline needs at least one Won stage.",
    ]);
  });

  it("keeps On-Hold as a paused state rather than the terminal column", () => {
    const comm = PIPES.comm.stages;
    const hold = comm.find((s) => s.id === "hold")!;
    expect(hold.semanticType).toBe("paused");
    // And it is no longer last — outcomes come after it.
    expect(comm[comm.length - 1].semanticType).toBe("lost");
  });

  it("keeps the Residential win stage's id stable through the rename", () => {
    // `result` became "Won". The id must not move or the two seeded deals and
    // their history would be orphaned.
    const won = PIPES.resi.stages.find((s) => s.semanticType === "won")!;
    expect(won.id).toBe("result");
    expect(won.label).toBe("Won");
  });
});

/* -------------------------------------------------------------------------
   Styling derives from meaning, never from ids
   ------------------------------------------------------------------------- */

describe("presentation follows the semantic type", () => {
  it("gives a positive stage the green border and an open one the neutral", () => {
    expect(columnBorder(stage("positive"), false)).toBe("#2f6b1f");
    expect(columnBorder(stage("open"), false)).toBe("#1f231e");
  });

  it("uses the existing amber for paused and dusty for lost — no new ramps", () => {
    expect(columnTitleColor(stage("paused"))).toBe("#d8b45e");
    expect(columnTitleColor(stage("lost"))).toBe("#c9a29a");
  });

  it("lets the drop target win over everything while dragging", () => {
    expect(columnBorder(stage("lost"), true)).toBe("#4b9c2d");
  });

  it("honours an explicit accent override", () => {
    expect(columnBorder(stage("open", { accent: "#123456" }), false)).toBe(
      "#123456",
    );
  });

  it("styles a stage nobody has seen before, purely from its type", () => {
    // The point of the mechanism: invent "Awaiting Permit", tag it paused, and
    // it renders correctly with no code change.
    const invented = { id: "awaiting-permit", label: "Awaiting Permit", hint: "", semanticType: "paused" as const };
    expect(columnBorder(invented, false)).toBe("#4a3a17");
    expect(columnTitleColor(invented)).toBe("#d8b45e");
  });
});

/* -------------------------------------------------------------------------
   Neglect
   ------------------------------------------------------------------------- */

describe("neglect thresholds", () => {
  it("prefers a stage override over the pipeline default", () => {
    expect(resolveNeglectDays({ neglectDays: 3 }, 45)).toBe(3);
  });

  it("falls back to the pipeline, then to the global default", () => {
    expect(resolveNeglectDays(undefined, 45)).toBe(45);
    expect(resolveNeglectDays({}, undefined)).toBe(DEFAULT_NEGLECT_DAYS);
  });

  it("keeps the reasoned pipeline defaults intact", () => {
    // 14 days everywhere, 45 for Commercial — see DECISIONS.md #3.
    expect(PIPES.comm.neglectDays).toBe(45);
    expect(PIPES.resi.neglectDays).toBe(14);
    expect(PIPES.newleads.neglectDays).toBe(1);
  });

  it("excludes paused stages entirely, whatever the threshold says", () => {
    // A bid on hold with a revisit date six months out was tripping the 45-day
    // rule while sitting exactly where somebody put it.
    expect(stageCountsForNeglect(stage("paused"))).toBe(false);
  });

  it("excludes closed stages, being closed", () => {
    expect(stageCountsForNeglect(stage("won"))).toBe(false);
    expect(stageCountsForNeglect(stage("lost"))).toBe(false);
  });

  it("still watches live work", () => {
    expect(stageCountsForNeglect(stage("open"))).toBe(true);
    expect(stageCountsForNeglect(stage("positive"))).toBe(true);
  });
});

/* -------------------------------------------------------------------------
   Win rate
   ------------------------------------------------------------------------- */

describe("win rate aggregates by semantic type", () => {
  const stages = [
    { id: "a", semanticType: "open" as const },
    { id: "w", semanticType: "won" as const },
    { id: "l", semanticType: "lost" as const },
    { id: "p", semanticType: "paused" as const },
  ];

  it("is won over decided, ignoring anything still open", () => {
    const out = winRate(stages, [
      { stage: "w" },
      { stage: "w" },
      { stage: "l" },
      { stage: "a" },
      { stage: "p" },
    ]);
    expect(out).toEqual({ won: 2, lost: 1, rate: 2 / 3 });
  });

  it("distinguishes 'nothing has closed' from 'nothing was won'", () => {
    // 0% and "no data yet" are different claims and a dashboard must not
    // conflate them.
    expect(winRate(stages, [{ stage: "a" }]).rate).toBeNull();
    expect(winRate(stages, [{ stage: "l" }]).rate).toBe(0);
  });

  it("compares two markets whose stages are named differently", () => {
    // "Bid Submitted" here, "Quote Out" there — both open, both comparable.
    const market = [
      { id: "quote-out", semanticType: "open" as const },
      { id: "closed-happy", semanticType: "won" as const },
      { id: "closed-sad", semanticType: "lost" as const },
    ];
    expect(
      winRate(market, [{ stage: "closed-happy" }, { stage: "closed-sad" }]).rate,
    ).toBe(0.5);
  });
});

/* -------------------------------------------------------------------------
   Lost reasons
   ------------------------------------------------------------------------- */

describe("entering a lost stage requires a reason", () => {
  it("defaults to required for lost and not for anything else", () => {
    expect(stageRequiresReason(stage("lost"))).toBe(true);
    for (const t of ["open", "positive", "paused", "won"] as SemanticType[]) {
      expect(stageRequiresReason(stage(t))).toBe(false);
    }
  });

  it("can be forced on any stage", () => {
    expect(stageRequiresReason(stage("open", { requiresReason: true }))).toBe(
      true,
    );
  });

  it("every seeded lost stage demands one", () => {
    for (const id of PIPELINE_IDS) {
      for (const s of PIPES[id].stages) {
        if (s.semanticType === "lost") expect(stageRequiresReason(s)).toBe(true);
      }
    }
  });
});

describe("entering a paused stage requires a revisit date", () => {
  it("defaults to required for paused and not for anything else", () => {
    expect(stageRequiresRevisitDate(stage("paused"))).toBe(true);
    for (const t of ["open", "positive", "won", "lost"] as SemanticType[]) {
      expect(stageRequiresRevisitDate(stage(t))).toBe(false);
    }
  });

  it("closes the gap the neglect exclusions would otherwise open", () => {
    // Paused deals are excluded from neglect, so one with no revisit date
    // produces no signal at all — it falls out of both alerts and is silently
    // unmonitored. Requiring the date on entry is what stops that.
    for (const id of PIPELINE_IDS) {
      for (const s of PIPES[id].stages) {
        if (s.semanticType === "paused") {
          expect(stageRequiresRevisitDate(s)).toBe(true);
          expect(stageCountsForNeglect(s)).toBe(false);
        }
      }
    }
  });
});
