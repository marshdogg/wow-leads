import { describe, expect, it } from "vitest";
import { DAYS, ESTIMATORS, TIMES } from "@/lib/pipelines";
import {
  EMPTY_SELECTION,
  OS_REF_PATTERN,
  bookingEyebrow,
  bookingTitle,
  canConfirm,
  carriesFor,
  estimatorFromSelection,
  generateOsRef,
  isValidOsRef,
  missingSelection,
  sel,
  whenLabel,
  whenLabelFromSelection,
} from "@/lib/wow-os/booking";

describe("osRef generation", () => {
  it("always produces the EST-##### format", () => {
    for (const r of [0, 0.25, 0.5, 0.75, 0.999999]) {
      expect(generateOsRef(() => r)).toMatch(OS_REF_PATTERN);
    }
  });

  it("stays five digits across a thousand random draws", () => {
    for (let i = 0; i < 1000; i++) {
      expect(isValidOsRef(generateOsRef())).toBe(true);
    }
  });

  it("matches the seeded demo ref", () => {
    expect(isValidOsRef("EST-40218")).toBe(true);
  });

  it("rejects malformed refs", () => {
    for (const bad of [
      "EST-4021", // four digits
      "EST-402188", // six digits
      "est-40218", // lower case
      "EST40218", // no hyphen
      "40218",
      "",
      "EST-4021A",
      " EST-40218",
    ]) {
      expect(isValidOsRef(bad)).toBe(false);
    }
  });
});

describe("when label", () => {
  it("composes dow, date and time", () => {
    expect(whenLabel({ dow: "Thu", date: "Aug 6" }, "10:00 AM")).toBe(
      "Thu Aug 6 at 10:00 AM",
    );
  });

  it("builds the same label from selection indices", () => {
    // Thu Aug 6 is DAYS[1]; 10:00 AM is TIMES[1].
    expect(DAYS[1]).toEqual({ dow: "Thu", date: "Aug 6" });
    expect(TIMES[1]).toBe("10:00 AM");
    expect(
      whenLabelFromSelection({
        dayIndex: 1,
        timeIndex: 1,
        estimatorIndex: 0,
      }),
    ).toBe("Thu Aug 6 at 10:00 AM");
  });

  it("refuses to build a label from an incomplete selection", () => {
    expect(() => whenLabelFromSelection(EMPTY_SELECTION)).toThrow();
    expect(() =>
      whenLabelFromSelection({
        dayIndex: 0,
        timeIndex: null,
        estimatorIndex: 0,
      }),
    ).toThrow();
  });
});

describe("step validation", () => {
  it("cannot confirm with nothing selected", () => {
    expect(canConfirm(EMPTY_SELECTION)).toBe(false);
    expect(missingSelection(EMPTY_SELECTION)).toBe("Pick a day");
  });

  it("names the next missing choice in order", () => {
    expect(
      missingSelection({ dayIndex: 0, timeIndex: null, estimatorIndex: null }),
    ).toBe("Pick a time");
    expect(
      missingSelection({ dayIndex: 0, timeIndex: 2, estimatorIndex: null }),
    ).toBe("Pick an estimator");
  });

  it("confirms only when day, time and estimator are all chosen", () => {
    expect(
      canConfirm({ dayIndex: 0, timeIndex: 0, estimatorIndex: 0 }),
    ).toBe(true);
    expect(
      missingSelection({ dayIndex: 0, timeIndex: 0, estimatorIndex: 0 }),
    ).toBeNull();
  });

  it("rejects out-of-range and non-integer indices", () => {
    expect(
      canConfirm({
        dayIndex: DAYS.length,
        timeIndex: 0,
        estimatorIndex: 0,
      }),
    ).toBe(false);
    expect(
      canConfirm({ dayIndex: -1, timeIndex: 0, estimatorIndex: 0 }),
    ).toBe(false);
    expect(
      canConfirm({
        dayIndex: 0,
        timeIndex: 0,
        estimatorIndex: ESTIMATORS.length,
      }),
    ).toBe(false);
    expect(
      canConfirm({ dayIndex: 0.5, timeIndex: 0, estimatorIndex: 0 }),
    ).toBe(false);
  });
});

describe("estimator lookup", () => {
  it("resolves the selected estimator", () => {
    expect(
      estimatorFromSelection({
        dayIndex: 0,
        timeIndex: 0,
        estimatorIndex: 1,
      }).name,
    ).toBe("Granville Smith");
  });

  it("throws when no estimator is selected", () => {
    expect(() => estimatorFromSelection(EMPTY_SELECTION)).toThrow();
  });
});

describe("carries across the seam", () => {
  it("lists the six items, two of them deal-specific", () => {
    const carries = carriesFor({
      source: "Past Customer",
      assignedBy: "Trigger → Dani",
    });
    expect(carries).toEqual([
      "Account + contacts",
      "Property details",
      "Access notes",
      "Source · Past Customer",
      "Full activity with provenance",
      "Assigned by · Trigger → Dani",
    ]);
  });
});

describe("modal chrome copy", () => {
  it("matches the prototype per step", () => {
    expect(bookingEyebrow(1)).toBe("THE HANDOFF");
    expect(bookingEyebrow(2)).toBe("HANDOFF COMPLETE");
    expect(bookingTitle(1, "Marisol Vance")).toBe(
      "Book the estimate — Marisol Vance",
    );
    expect(bookingTitle(2, "Marisol Vance")).toBe(
      "One record, now in the Funnel",
    );
  });
});

describe("selection styling", () => {
  it("uses the prototype's exact hexes", () => {
    expect(sel(true)).toEqual({
      border: "#4b9c2d",
      bg: "#0f1a0b",
      color: "#b6f07a",
    });
    expect(sel(false)).toEqual({
      border: "#262b25",
      bg: "#141814",
      color: "#c6cdc6",
    });
  });
});
