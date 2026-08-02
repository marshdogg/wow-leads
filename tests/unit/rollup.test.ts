import { describe, expect, it } from "vitest";
import { DEAL_FIXTURES } from "@/lib/fixtures/deals";
import { PIPES } from "@/lib/pipelines";
import {
  compactMoney,
  metricThousands,
  rollupStageValue,
} from "@/lib/repositories/rules";
import type { DealMetric } from "@/lib/types";

const card = (metrics: DealMetric[]) => ({ metrics });

describe("$ in stage roll-up", () => {
  it("counts EST. VALUE", () => {
    expect(
      rollupStageValue([card([{ label: "EST. VALUE", value: "$180K" }])], true),
    ).toBe("$180K in stage");
  });

  it("counts BID", () => {
    expect(rollupStageValue([card([{ label: "BID", value: "$244K" }])], true)).toBe(
      "$244K in stage",
    );
  });

  it("counts EST. VALUE and BID together across a column", () => {
    const cards = [
      card([{ label: "EST. VALUE", value: "$96K" }]),
      card([{ label: "BID", value: "$132K" }]),
    ];
    expect(rollupStageValue(cards, true)).toBe("$228K in stage");
  });

  it("ignores metrics that are not value metrics", () => {
    const cards = [
      card([
        { label: "EST. VALUE", value: "$96K" },
        { label: "TAKEOFF", value: "60%" },
      ]),
      card([{ label: "DECISION", value: "Oct 2026" }]),
    ];
    expect(rollupStageValue(cards, true)).toBe("$96K in stage");
  });

  it("ignores non-numeric value metrics rather than producing NaN", () => {
    expect(
      rollupStageValue([card([{ label: "BID", value: "TBD" }])], true),
    ).toBeNull();
  });

  it("returns null for an empty column", () => {
    expect(rollupStageValue([], true)).toBeNull();
  });

  it("returns null when the column sums to zero", () => {
    expect(
      rollupStageValue([card([{ label: "BID", value: "$0K" }])], true),
    ).toBeNull();
  });

  it("returns null for every pipeline that does not show stage value", () => {
    const cards = [card([{ label: "EST. VALUE", value: "$180K" }])];
    for (const pipe of ["resi", "bizdev", "partner"] as const) {
      expect(rollupStageValue(cards, PIPES[pipe].showStageValue)).toBeNull();
    }
    expect(rollupStageValue(cards, PIPES.comm.showStageValue)).toBe(
      "$180K in stage",
    );
  });

  it("reproduces the prototype's Commercial column totals from the fixtures", () => {
    const comm = DEAL_FIXTURES.filter((d) => d.pipe === "comm");
    const totals = Object.fromEntries(
      PIPES.comm.stages.map((stage) => [
        stage.id,
        rollupStageValue(
          comm
            .filter((d) => d.stage === stage.id)
            .map((d) => card(d.metrics ?? [])),
          true,
        ),
      ]),
    );
    expect(totals).toEqual({
      prospect: "$180K in stage",
      invited: "$310K in stage",
      takeoff: "$96K in stage",
      submitted: "$244K in stage",
      negotiation: "$88K in stage",
      hold: "$132K in stage",
      // The outcome stages exist on every pipeline now and start empty. Null
      // rather than "$0K in stage" — nothing closed is not zero value.
      "comm-won": null,
      "comm-lost": null,
    });
  });
});

describe("metricThousands", () => {
  it("strips currency and suffixes", () => {
    expect(metricThousands("$310K")).toBe(310);
    expect(metricThousands("$7.4K")).toBe(7.4);
  });

  it("returns 0 for values with no number in them", () => {
    expect(metricThousands("High")).toBe(0);
    expect(metricThousands("—")).toBe(0);
  });
});

describe("compactMoney", () => {
  it("compacts full-dollar figures to K", () => {
    expect(compactMoney("$4,900")).toBe("$4.9K");
    expect(compactMoney("$12,100")).toBe("$12.1K");
  });

  it("passes already-compact figures through untouched", () => {
    expect(compactMoney("$96K")).toBe("$96K");
    expect(compactMoney("$1.05M")).toBe("$1.05M");
  });
});
