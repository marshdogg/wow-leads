import { describe, expect, it } from "vitest";
import {
  UNKNOWN_STAGE_INDEX,
  UNTRACKED_SORT_VALUE,
  compareDeals,
  nextSort,
  sortDeals,
  sortValue,
} from "@/components/list/sort";
import { stageIds } from "@/lib/pipelines";
import type { Deal, ListSortKey, TrackId } from "@/lib/types";

const RESI_STAGES = stageIds("resi");

function deal(over: Partial<Deal> & { id: string }): Deal {
  return {
    pipe: "resi",
    track: null,
    stage: "past",
    name: "Unnamed",
    account: "—",
    tags: [],
    source: "Past Customer",
    owner: { initials: "MB", name: "Marshall Behrns", agent: false },
    assignedBy: "Self-sourced",
    aiPending: false,
    stale: "",
    staleWarn: false,
    metrics: [],
    next: null,
    act: "Log Call",
    quick: true,
    ...over,
  };
}

/** Ids in sorted order, so assertions read as the rendered row order. */
function order(deals: Deal[], key: ListSortKey, dir: 1 | -1): string[] {
  return sortDeals(deals, { key, dir }, RESI_STAGES).map((d) => d.id);
}

describe("sortValue", () => {
  it("lower-cases names so sorting ignores case", () => {
    expect(sortValue(deal({ id: "a", name: "abbott" }), "name", RESI_STAGES)).toBe(
      "abbott",
    );
    expect(sortValue(deal({ id: "b", name: "Abbott" }), "name", RESI_STAGES)).toBe(
      "abbott",
    );
  });

  it("maps tracks to their chip labels and untracked deals to the tail value", () => {
    const tracks: [TrackId, string][] = [
      ["referral", "REFERRAL"],
      ["repeat", "REPEAT WORK"],
      ["revival", "REVIVAL"],
      // New Leads tracks go through the same lookup — nothing here is pinned
      // to the Residential set.
      ["inbound", "INBOUND"],
      ["canvassed", "CANVASSED"],
      ["event", "EVENT"],
    ];
    for (const [track, label] of tracks) {
      expect(sortValue(deal({ id: track, track }), "track", RESI_STAGES)).toBe(
        label,
      );
    }
    expect(sortValue(deal({ id: "u", track: null }), "track", RESI_STAGES)).toBe(
      UNTRACKED_SORT_VALUE,
    );
  });

  it("zero-pads the stage index so pipeline order beats alphabetical order", () => {
    expect(sortValue(deal({ id: "a", stage: "past" }), "stage", RESI_STAGES)).toBe(
      "00",
    );
    expect(
      sortValue(deal({ id: "b", stage: "result" }), "stage", RESI_STAGES),
    ).toBe("05");
  });

  it("sorts a stage outside the pipeline last", () => {
    expect(
      sortValue(deal({ id: "x", stage: "negotiation" }), "stage", RESI_STAGES),
    ).toBe(String(UNKNOWN_STAGE_INDEX));
  });

  it("encodes next action as overdue, then scheduled, then unset", () => {
    expect(
      sortValue(
        deal({ id: "o", next: { label: "Call", due: "Aug 1", state: "overdue" } }),
        "next",
        RESI_STAGES,
      ),
    ).toBe("0Aug 1");
    expect(
      sortValue(
        deal({ id: "k", next: { label: "Call", due: "Aug 1", state: "ok" } }),
        "next",
        RESI_STAGES,
      ),
    ).toBe("1Aug 1");
    expect(sortValue(deal({ id: "n", next: null }), "next", RESI_STAGES)).toBe("2");
  });

  it("prefers initialType over stale for last touch", () => {
    expect(
      sortValue(
        deal({ id: "a", initialType: "Cold call · Jul 28", stale: "19d silent" }),
        "stale",
        RESI_STAGES,
      ),
    ).toBe("Cold call · Jul 28");
    expect(
      sortValue(deal({ id: "b", stale: "19d silent" }), "stale", RESI_STAGES),
    ).toBe("19d silent");
    expect(sortValue(deal({ id: "c" }), "stale", RESI_STAGES)).toBe("");
  });
});

describe("sortDeals — all six keys, both directions", () => {
  it("sorts by name", () => {
    const deals = [
      deal({ id: "c", name: "Carmen Ruiz" }),
      deal({ id: "a", name: "alice Brand" }),
      deal({ id: "b", name: "Bo Whitfield" }),
    ];
    expect(order(deals, "name", 1)).toEqual(["a", "b", "c"]);
    expect(order(deals, "name", -1)).toEqual(["c", "b", "a"]);
  });

  it("sorts by track with untracked deals last ascending, first descending", () => {
    const deals = [
      deal({ id: "untracked", track: null }),
      deal({ id: "revival", track: "revival" }),
      deal({ id: "referral", track: "referral" }),
      deal({ id: "repeat", track: "repeat" }),
    ];
    expect(order(deals, "track", 1)).toEqual([
      "referral",
      "repeat",
      "revival",
      "untracked",
    ]);
    expect(order(deals, "track", -1)).toEqual([
      "untracked",
      "revival",
      "repeat",
      "referral",
    ]);
  });

  it("sorts New Leads tracks by chip label, untracked still last", () => {
    const deals = [
      deal({ id: "untracked", pipe: "newleads", track: null }),
      deal({ id: "inbound", pipe: "newleads", track: "inbound" }),
      deal({ id: "event", pipe: "newleads", track: "event" }),
      deal({ id: "canvassed", pipe: "newleads", track: "canvassed" }),
    ];
    expect(order(deals, "track", 1)).toEqual([
      "canvassed",
      "event",
      "inbound",
      "untracked",
    ]);
    expect(order(deals, "track", -1)).toEqual([
      "untracked",
      "inbound",
      "event",
      "canvassed",
    ]);
  });

  it("sorts by stage in pipeline order for any pipeline's stage list", () => {
    const stages = stageIds("newleads");
    const deals = [
      deal({ id: "nurture", pipe: "newleads", stage: "nurture" }),
      deal({ id: "new", pipe: "newleads", stage: "new" }),
      deal({ id: "qualified", pipe: "newleads", stage: "qualified" }),
    ];
    const ids = sortDeals(deals, { key: "stage", dir: 1 }, stages).map(
      (d) => d.id,
    );
    expect(ids).toEqual(["new", "qualified", "nurture"]);
  });

  it("sorts by stage in pipeline order, not alphabetically", () => {
    // Alphabetically: "2nd Follow-up" < "Followed Up" < "Past Customer".
    const deals = [
      deal({ id: "result", stage: "result" }),
      deal({ id: "second", stage: "second" }),
      deal({ id: "past", stage: "past" }),
      deal({ id: "first", stage: "first" }),
    ];
    expect(order(deals, "stage", 1)).toEqual([
      "past",
      "first",
      "second",
      "result",
    ]);
    expect(order(deals, "stage", -1)).toEqual([
      "result",
      "second",
      "first",
      "past",
    ]);
  });

  it("sorts by next action: overdue first, then due, unset last", () => {
    const deals = [
      deal({ id: "unset", next: null }),
      deal({ id: "ok-b", next: { label: "Call", due: "Aug 4", state: "ok" } }),
      deal({
        id: "overdue",
        next: { label: "Call", due: "Jul 22", state: "overdue" },
      }),
      deal({ id: "ok-a", next: { label: "Call", due: "Aug 1", state: "ok" } }),
    ];
    expect(order(deals, "next", 1)).toEqual([
      "overdue",
      "ok-a",
      "ok-b",
      "unset",
    ]);
    expect(order(deals, "next", -1)).toEqual([
      "unset",
      "ok-b",
      "ok-a",
      "overdue",
    ]);
  });

  it("sorts by owner name", () => {
    const deals = [
      deal({ id: "r", owner: { initials: "RA", name: "Reese Alvarado", agent: false } }),
      deal({ id: "ai", owner: { initials: "AI", name: "Agent", agent: true } }),
      deal({ id: "d", owner: { initials: "DK", name: "dani Koval", agent: false } }),
    ];
    expect(order(deals, "owner", 1)).toEqual(["ai", "d", "r"]);
    expect(order(deals, "owner", -1)).toEqual(["r", "d", "ai"]);
  });

  it("sorts by last touch as a plain string", () => {
    const deals = [
      deal({ id: "c", stale: "19d silent" }),
      deal({ id: "a", initialType: "Cold call · Jul 28" }),
      deal({ id: "b", stale: "11 mo since job" }),
    ];
    expect(order(deals, "stale", 1)).toEqual(["b", "c", "a"]);
    expect(order(deals, "stale", -1)).toEqual(["a", "c", "b"]);
  });
});

describe("ties and stability", () => {
  it("returns 0 for equal values in both directions", () => {
    const a = deal({ id: "a", name: "Same Name" });
    const b = deal({ id: "b", name: "same name" });
    expect(compareDeals(a, b, { key: "name", dir: 1 }, RESI_STAGES)).toBe(0);
    expect(compareDeals(a, b, { key: "name", dir: -1 }, RESI_STAGES)).toBe(0);
  });

  it("keeps input order for ties, in both directions", () => {
    const deals = [
      deal({ id: "first", next: null }),
      deal({ id: "second", next: null }),
      deal({ id: "third", next: null }),
    ];
    expect(order(deals, "next", 1)).toEqual(["first", "second", "third"]);
    expect(order(deals, "next", -1)).toEqual(["first", "second", "third"]);
  });

  it("does not mutate the input array", () => {
    const deals = [deal({ id: "b", name: "b" }), deal({ id: "a", name: "a" })];
    sortDeals(deals, { key: "name", dir: 1 }, RESI_STAGES);
    expect(deals.map((d) => d.id)).toEqual(["b", "a"]);
  });
});

describe("nextSort", () => {
  it("sorts a new key ascending", () => {
    expect(nextSort({ key: "next", dir: -1 }, "name")).toEqual({
      key: "name",
      dir: 1,
    });
  });

  it("reverses the active key", () => {
    expect(nextSort({ key: "name", dir: 1 }, "name")).toEqual({
      key: "name",
      dir: -1,
    });
    expect(nextSort({ key: "name", dir: -1 }, "name")).toEqual({
      key: "name",
      dir: 1,
    });
  });
});
