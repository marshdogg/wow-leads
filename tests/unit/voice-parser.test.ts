import { describe, expect, it } from "vitest";
import { parseTranscriptDeterministic } from "@/lib/voice/parse";
import { CANNED_TRANSCRIPT } from "@/lib/voice/canned";
import { splitNextStep, toEditableFields } from "@/lib/voice/types";

/**
 * Monday 3 Aug 2026 — fixed so the suggested-date maths is deterministic.
 * Noon local avoids any DST-boundary surprises in the resolver.
 */
const NOW = new Date(2026, 7, 3, 12, 0, 0);

describe("parseTranscriptDeterministic — the prototype transcript", () => {
  const note = parseTranscriptDeterministic(CANNED_TRANSCRIPT, NOW);

  it("reads the outcome as an on-site connection with grown scope", () => {
    expect(note.outcome).toBe(
      "Connected on site — scope grew to include 2 upstairs bedrooms",
    );
  });

  it("extracts the next step and resolves 'this week' to a weekday", () => {
    expect(note.nextStep).toBe("Book estimate this week");
    expect(note.date).toBe("Thu Aug 6");
    expect(note.dueAt).not.toBeNull();
    expect(new Date(note.dueAt as string).getDay()).toBe(4);
  });

  it("collects rooms plus the brand and colour into scope notes", () => {
    expect(note.notes).toBe(
      "Stairwell, hallway, 2 upstairs bedrooms. Benjamin Moore off-white to match existing.",
    );
  });

  it("turns the wedding deadline into a constraint", () => {
    expect(note.constraint).toBe(
      "Must complete before October — daughter's wedding",
    );
  });

  it("folds the suggested date into the editable NEXT STEP value", () => {
    const fields = toEditableFields(note);
    expect(fields.nextStep).toBe("Book estimate this week · suggested Thu Aug 6");
    expect(splitNextStep(fields.nextStep)).toEqual({
      label: "Book estimate this week",
      due: "Thu Aug 6",
    });
  });
});

describe("parseTranscriptDeterministic — a terse note", () => {
  const note = parseTranscriptDeterministic(
    "Left a voicemail, try again Friday.",
    NOW,
  );

  it("classifies the outcome as a voicemail", () => {
    expect(note.outcome).toBe("Left a voicemail — no contact made");
  });

  it("sets a call-back next step on the named weekday", () => {
    expect(note.nextStep).toBe("Call back Friday");
    expect(note.date).toBe("Fri Aug 7");
  });

  it("leaves scope and constraint empty rather than inventing them", () => {
    expect(note.notes).toBe("");
    expect(note.constraint).toBe("");
  });
});

describe("parseTranscriptDeterministic — no date mentioned", () => {
  const note = parseTranscriptDeterministic(
    "Walked the exterior with Rudy. He wants the trim and siding repainted, no rush on timing.",
    NOW,
  );

  it("still produces an outcome and a default next step", () => {
    expect(note.outcome).toBe("Connected on site");
    expect(note.nextStep).toBe("Follow up");
  });

  it("suggests no date at all", () => {
    expect(note.date).toBe("");
    expect(note.dueAt).toBeNull();
  });

  it("captures the scope and the work type", () => {
    expect(note.notes).toBe("Exterior, trim, siding — repaint.");
  });
});

describe("parseTranscriptDeterministic — a scope change", () => {
  const note = parseTranscriptDeterministic(
    "Met with Priya at the house. She originally wanted the kitchen but now wants the two bathrooms and the hallway as well. Send her a quote by Tuesday.",
    NOW,
  );

  it("names what was added to the scope in the outcome", () => {
    expect(note.outcome).toBe(
      "Connected on site — scope grew to include 2 bathrooms, hallway",
    );
  });

  it("reads the next step and its weekday", () => {
    expect(note.nextStep).toBe("Send quote Tuesday");
    expect(note.date).toBe("Tue Aug 4");
  });

  it("lists every room in scope notes", () => {
    expect(note.notes).toBe("Kitchen, 2 bathrooms, hallway.");
  });

  it("does not mistake 'by Tuesday' for a hard constraint", () => {
    expect(note.constraint).toBe("");
  });
});

describe("parseTranscriptDeterministic — edge cases", () => {
  it("returns entirely empty fields for an empty transcript", () => {
    expect(parseTranscriptDeterministic("   ", NOW)).toEqual({
      outcome: "",
      nextStep: "",
      date: "",
      notes: "",
      constraint: "",
      dueAt: null,
    });
  });

  it("normalises curly apostrophes before matching", () => {
    const curly = parseTranscriptDeterministic(
      "Walked the place. She wants it done before her daughter’s wedding in October.",
      NOW,
    );
    expect(curly.constraint).toBe(
      "Must complete before October — daughter's wedding",
    );
  });

  it("picks up a budget ceiling as a constraint", () => {
    const note = parseTranscriptDeterministic(
      "Spoke with the owner about the basement. Budget is $4,500 and she can't go over it.",
      NOW,
    );
    expect(note.constraint).toBe("Budget ceiling $4,500");
    expect(note.outcome).toBe("Spoke with the customer");
  });

  it("falls back to the first sentence when no outcome cue matches", () => {
    const note = parseTranscriptDeterministic(
      "The HOA board pushed the vote to next month.",
      NOW,
    );
    expect(note.outcome).toBe("The HOA board pushed the vote to next month");
  });
});
