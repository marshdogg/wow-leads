import { describe, expect, it } from "vitest";
import { stageCellColor } from "@/components/list/ListTable";
import {
  revisitStatus,
  undatedCount,
  type RevisitDueRow,
} from "@/components/manager/rows";
import { SEMANTIC_STYLE } from "@/lib/pipelines";
import type { SemanticType, StageConfig } from "@/lib/types";

const stage = (
  semanticType: SemanticType,
  over: Partial<StageConfig> = {},
): StageConfig => ({
  id: "s" as StageConfig["id"],
  label: "S",
  hint: "",
  semanticType,
  ...over,
});

/* -------------------------------------------------------------------------
   The list's stage cell
   ------------------------------------------------------------------------- */

describe("list stage colour comes from the semantic type", () => {
  const SECONDARY = "#c6cdc6";

  it("carries the paused and lost signals through to the table", () => {
    expect(stageCellColor(stage("paused"))).toBe(SEMANTIC_STYLE.paused.title);
    expect(stageCellColor(stage("lost"))).toBe(SEMANTIC_STYLE.lost.title);
    expect(stageCellColor(stage("won"))).toBe(SEMANTIC_STYLE.won.title);
  });

  it("leaves ordinary rows in the table's own secondary tone", () => {
    // The board's heading colour is calibrated for a 15px title on its own
    // panel. Used verbatim in a dense 13px table it makes every open row as
    // loud as the lead's name beside it, so the two neutral types stay quiet.
    expect(stageCellColor(stage("open"))).toBe(SECONDARY);
    expect(stageCellColor(stage("positive"))).toBe(SECONDARY);
  });

  it("falls back to secondary when the stage is unknown", () => {
    expect(stageCellColor(undefined)).toBe(SECONDARY);
  });

  it("styles a franchise's invented stage with no code change", () => {
    // The whole point of the mechanism, asserted at the table as well as the
    // board: nothing here keys off an id.
    const invented = stage("paused", {
      id: "awaiting-permit" as StageConfig["id"],
      label: "Awaiting Permit",
    });
    expect(stageCellColor(invented)).toBe(SEMANTIC_STYLE.paused.title);
  });
});

/* -------------------------------------------------------------------------
   Revisit due
   ------------------------------------------------------------------------- */

function row(over: Partial<RevisitDueRow> = {}): RevisitDueRow {
  return {
    id: "c3",
    name: "Ivy City Warehouse",
    account: "1200 Okie St NE",
    pipeline: "Commercial",
    stage: "On-Hold",
    value: "$96K",
    daysOverdue: 3,
    daysSilent: 40,
    ...over,
  };
}

describe("revisitStatus", () => {
  it("counts days past the revisit date", () => {
    expect(revisitStatus(row({ daysOverdue: 3 }))).toEqual({
      label: "3d past revisit",
      tone: "overdue",
    });
  });

  it("treats the day itself as due, not overdue", () => {
    // Due today is actionable and must appear; only future dates are excluded,
    // and that exclusion happens in the query rather than here.
    expect(revisitStatus(row({ daysOverdue: 0 }))).toEqual({
      label: "Due today",
      tone: "today",
    });
  });

  it("says so in words when nobody ever set a revisit date", () => {
    // The worse case. Excluding paused stages from neglect assumes a date
    // replaces the rule; where none was set, nothing replaces anything and the
    // deal is invisible to both signals. A blank cell would hide exactly that.
    const status = revisitStatus(row({ daysOverdue: null, daysSilent: 152 }));
    expect(status.tone).toBe("undated");
    expect(status.label).toBe("No revisit date · 152d silent");
  });

  it("does not claim a silence it cannot measure", () => {
    expect(revisitStatus(row({ daysOverdue: null, daysSilent: null })).label).toBe(
      "No revisit date · never touched",
    );
  });
});

describe("undatedCount", () => {
  it("counts only the rows with no revisit date", () => {
    expect(
      undatedCount([
        row({ id: "a", daysOverdue: null }),
        row({ id: "b", daysOverdue: 0 }),
        row({ id: "c", daysOverdue: 9 }),
        row({ id: "d", daysOverdue: null }),
      ]),
    ).toBe(2);
  });

  it("is zero when every pause has an end date", () => {
    expect(undatedCount([row(), row({ id: "b", daysOverdue: 0 })])).toBe(0);
    expect(undatedCount([])).toBe(0);
  });
});
