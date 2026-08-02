import { describe, expect, it } from "vitest";
import {
  PIPELINE_IDS,
  PIPES,
  isRevisitDue,
  revisitState,
  stageCountsForNeglect,
} from "@/lib/pipelines";
import type { SemanticType } from "@/lib/types";

/**
 * Revisit due — the signal that replaces neglect on a paused stage.
 *
 * The defect behind all of this: a Commercial bid moved to On-Hold with a
 * revisit date six months out still tripped the 45-day neglect rule. It was
 * flagged as neglected while sitting exactly where somebody deliberately put
 * it — a false positive by design, and the kind that teaches people the alert
 * is noise.
 *
 * Excluding paused stages from neglect fixes the false positive but opens a
 * false *negative*: a parked deal that nobody ever comes back to. So the
 * exclusion and the replacement have to arrive together, and the tests that
 * matter most here are the ones asserting they cover each other.
 */

const NOW = new Date(2026, 6, 31);

const stage = (semanticType: SemanticType) => ({ semanticType });

const PAUSED = stage("paused");

/* -------------------------------------------------------------------------
   The four states
   ------------------------------------------------------------------------- */

describe("revisit state", () => {
  it("says nothing about a stage that is not paused", () => {
    for (const t of ["open", "positive", "won", "lost"] as SemanticType[]) {
      expect(revisitState(stage(t), { revisitDate: new Date(2020, 0, 1) }, NOW)).toBe(
        "not-paused",
      );
    }
  });

  it("is due once the date has passed, and scheduled before it", () => {
    expect(revisitState(PAUSED, { revisitDate: new Date(2026, 6, 30) }, NOW)).toBe(
      "due",
    );
    expect(revisitState(PAUSED, { revisitDate: new Date(2026, 7, 1) }, NOW)).toBe(
      "scheduled",
    );
  });

  it("is due on the day itself, not the day after", () => {
    // A revisit date is a commitment to look at it *that day*. Waiting until
    // the day after means the dashboard is always one day behind the promise.
    expect(revisitState(PAUSED, { revisitDate: NOW }, NOW)).toBe("due");
  });

  it("distinguishes a paused deal with no date from one that is merely early", () => {
    // The shape with no staleness signal at all — see below.
    expect(revisitState(PAUSED, { revisitDate: null }, NOW)).toBe("no-date");
    expect(revisitState(PAUSED, {}, NOW)).toBe("no-date");
  });

  it("exposes the due case as a boolean for the dashboard list", () => {
    expect(isRevisitDue(PAUSED, { revisitDate: new Date(2026, 0, 1) }, NOW)).toBe(true);
    expect(isRevisitDue(PAUSED, { revisitDate: new Date(2027, 0, 1) }, NOW)).toBe(false);
    expect(isRevisitDue(PAUSED, { revisitDate: null }, NOW)).toBe(false);
    // An overdue date on a stage that is not paused is not a revisit — that
    // deal is live, and neglect is the signal that applies to it.
    expect(isRevisitDue(stage("open"), { revisitDate: new Date(2020, 0, 1) }, NOW)).toBe(
      false,
    );
  });
});

/* -------------------------------------------------------------------------
   The pairing — neither signal may swallow the other
   ------------------------------------------------------------------------- */

describe("neglect and revisit cover the board between them", () => {
  it("never applies both signals to the same stage", () => {
    for (const id of PIPELINE_IDS) {
      for (const s of PIPES[id].stages) {
        const neglect = stageCountsForNeglect(s);
        const revisit = revisitState(s, { revisitDate: new Date(2020, 0, 1) }, NOW);
        expect(neglect && revisit !== "not-paused").toBe(false);
      }
    }
  });

  it("leaves every live stage with exactly one staleness signal", () => {
    // "Live" means not closed. A won or lost deal is finished and should be
    // silent; anything else must be watched by one rule or the other, because
    // a stage watched by neither is a place deals go to be forgotten.
    for (const id of PIPELINE_IDS) {
      for (const s of PIPES[id].stages) {
        if (s.semanticType === "won" || s.semanticType === "lost") {
          expect(stageCountsForNeglect(s)).toBe(false);
          expect(revisitState(s, { revisitDate: null }, NOW)).toBe("not-paused");
          continue;
        }
        const watched =
          stageCountsForNeglect(s) ||
          revisitState(s, { revisitDate: null }, NOW) !== "not-paused";
        expect(watched, `${id}/${s.id} has no staleness signal`).toBe(true);
      }
    }
  });

  it("covers the three paused stages that shipped", () => {
    // On-Hold was the motivating case; Dormant and Nurture are the same shape
    // and would have had the same false positive.
    const paused = PIPELINE_IDS.flatMap((id) =>
      PIPES[id].stages.filter((s) => s.semanticType === "paused").map((s) => s.id),
    );
    expect(paused).toEqual(["hold", "dormant", "nurture"]);
    for (const id of PIPELINE_IDS) {
      for (const s of PIPES[id].stages) {
        if (s.semanticType !== "paused") continue;
        expect(stageCountsForNeglect(s)).toBe(false);
        expect(isRevisitDue(s, { revisitDate: new Date(2020, 0, 1) }, NOW)).toBe(true);
      }
    }
  });

  it("leaves a paused deal with no revisit date unwatched — a known gap", () => {
    // Asserted rather than fixed, because fixing it is a product decision
    // about whether a revisit date is mandatory on entry to a paused stage.
    // Pinned here so the gap is a recorded state rather than a surprise, and
    // so closing it later breaks a test that explains itself.
    const parked = { revisitDate: null };
    expect(stageCountsForNeglect(PAUSED)).toBe(false);
    expect(isRevisitDue(PAUSED, parked, NOW)).toBe(false);
    expect(revisitState(PAUSED, parked, NOW)).toBe("no-date");
  });
});
