import { describe, expect, it } from "vitest";
import {
  allStages,
  allTracks,
  eligibilityExplanation,
  previewTemplate,
  scopeSummary,
  smsLength,
  toDraft,
  TRIGGER_TYPES,
  usesContactName,
  triggerLabel,
  type TemplateDraft,
} from "@/components/templates/draft";
import { TEMPLATE_VARIABLES } from "@/lib/templates/resolve";
import type { MessageTemplate, TemplateFacts } from "@/lib/templates/types";

const base: TemplateDraft = {
  id: "t1",
  name: "11-month warranty check-in",
  channel: "SMS",
  triggerType: "eleven_month",
  pipelineId: "resi",
  stageId: null,
  track: null,
  subject: null,
  body: "Hi {{contact.firstName}} — {{sender.firstName}} at {{sender.company}}.",
  active: true,
  isDefault: true,
  allowAiAdaptation: false,
};

/** A record with a job history. */
const withJob: TemplateFacts = {
  "contact.firstName": "Delia",
  "sender.firstName": "Marshall",
  "sender.company": "WOW 1 DAY PAINTING",
  "job.scope": "the interior work",
  "job.completedMonth": "last August",
};

/** A brand-new lead: no job, so job tokens are absent. */
const noJob: TemplateFacts = {
  "contact.firstName": "Adaeze",
  "sender.firstName": "Marshall",
  "sender.company": "WOW 1 DAY PAINTING",
  "job.scope": null,
  "job.completedMonth": "",
};

describe("previewTemplate", () => {
  it("renders every token when the record can fill them", () => {
    const r = previewTemplate(base, withJob);
    expect(r.eligible).toBe(true);
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
    expect(r.body).toBe("Hi Delia — Marshall at WOW 1 DAY PAINTING.");
  });

  it("is ineligible when a token has no value on the record", () => {
    const draft = { ...base, body: "About {{job.scope}}, {{contact.firstName}}." };
    const r = previewTemplate(draft, noJob);
    expect(r.eligible).toBe(false);
    expect(r.missing).toEqual(["job.scope"]);
  });

  it("treats an empty string as missing, not as a value", () => {
    const draft = { ...base, body: "We finished {{job.completedMonth}}." };
    expect(previewTemplate(draft, noJob).missing).toEqual([
      "job.completedMonth",
    ]);
  });

  it("leaves the gap visible rather than blanking it", () => {
    // An author needs to see *which* words are missing, not a sentence that
    // silently lost its middle.
    const draft = { ...base, body: "About {{job.scope}}, {{contact.firstName}}." };
    expect(previewTemplate(draft, noJob).body).toBe(
      "About {{job.scope}}, Adaeze.",
    );
  });

  it("flags a typo as unknown rather than merely missing", () => {
    const draft = { ...base, body: "Hi {{contact.firstname}}" };
    const r = previewTemplate(draft, withJob);
    expect(r.unknown).toEqual(["contact.firstname"]);
    expect(r.missing).toEqual([]);
    expect(r.eligible).toBe(false);
  });

  it("renders the subject too when there is one", () => {
    const draft: TemplateDraft = {
      ...base,
      channel: "EMAIL",
      subject: "{{contact.firstName}}, a quick check-in",
      body: "Hi {{contact.firstName}}.",
    };
    const r = previewTemplate(draft, withJob);
    expect(r.subject).toBe("Delia, a quick check-in");
  });

  it("a template with no tokens is eligible for anyone", () => {
    const draft = { ...base, body: "Thanks again — the WOW crew." };
    expect(previewTemplate(draft, noJob).eligible).toBe(true);
  });
});

describe("eligibilityExplanation", () => {
  it("says nothing when the template applies", () => {
    expect(
      eligibilityExplanation(previewTemplate(base, withJob), "Delia"),
    ).toBeNull();
  });

  it("names the record and the tokens it cannot fill", () => {
    const draft = { ...base, body: "About {{job.scope}}." };
    const msg = eligibilityExplanation(
      previewTemplate(draft, noJob),
      "Adaeze Nwosu",
    );
    expect(msg).toContain("Adaeze Nwosu");
    expect(msg).toContain("{{job.scope}}");
  });

  it("does not repeat the palette's description of each variable", () => {
    // Those sentences are written to sit beside one variable at a time. Three
    // of them strung together read as a wall and bury the explanation.
    const draft = {
      ...base,
      body: "About {{job.scope}} we did {{job.completedMonth}}.",
    };
    const msg = eligibilityExplanation(previewTemplate(draft, noJob), "Adaeze");
    expect(msg).not.toMatch(/absent for a lead with no job/i);
    expect(msg).not.toMatch(/completion date of the last job/i);
  });

  it("reads as a list when several tokens are missing", () => {
    const draft = {
      ...base,
      body: "{{job.scope}} {{job.completedMonth}} {{job.address}}",
    };
    const msg = eligibilityExplanation(previewTemplate(draft, noJob), "Adaeze");
    expect(msg).toContain(
      "{{job.scope}}, {{job.completedMonth}} and {{job.address}}",
    );
  });

  it("frames it as the rule working, not as an error", () => {
    const draft = { ...base, body: "About {{job.scope}}." };
    const msg = eligibilityExplanation(previewTemplate(draft, noJob), "Adaeze");
    expect(msg).toMatch(/falls through to a simpler template/);
    expect(msg).not.toMatch(/error|invalid|failed/i);
  });

  it("asks for the typo to be fixed before talking about eligibility", () => {
    const draft = { ...base, body: "Hi {{contact.firstnam}}" };
    const msg = eligibilityExplanation(previewTemplate(draft, withJob), "Delia");
    expect(msg).toContain("unrecognised");
  });
});

describe("scopeSummary", () => {
  it("reads as the dimensions that are set", () => {
    expect(scopeSummary(base)).toBe(
      "Residential Re-marketing · 11-month check-in",
    );
  });

  it("says so plainly when nothing is scoped", () => {
    expect(
      scopeSummary({
        ...base,
        triggerType: null,
        pipelineId: null,
        channel: "ANY",
      }),
    ).toBe("Any record");
  });

  it("names the stage and track when they narrow it", () => {
    const s = scopeSummary({ ...base, stageId: "second", track: "revival" });
    expect(s).toContain("2nd Follow-up");
    expect(s).toContain("Revival");
  });
});

describe("scope option lists", () => {
  it("offers every trigger type", () => {
    expect(TRIGGER_TYPES).toContain("eleven_month");
    expect(TRIGGER_TYPES).toContain("never_quoted");
    for (const t of TRIGGER_TYPES) {
      expect(triggerLabel(t), t).not.toBe(t);
    }
  });

  it("offers stages from every pipeline, disambiguated", () => {
    const stages = allStages();
    expect(stages.find((s) => s.id === "past")?.pipeline).toBe(
      "Residential Re-marketing",
    );
    expect(stages.some((s) => s.id === "hold")).toBe(true);
    expect(stages.some((s) => s.id === "nurture")).toBe(true);
  });

  it("offers each track once and never the 'all' pseudo-track", () => {
    const tracks = allTracks();
    expect(tracks.some((t) => t.id === "revival")).toBe(true);
    // New Leads sets `trackOptions: []` (source shows as a card metric), but
    // its deals still carry `canvassed` and the resolver still matches on it,
    // so the selector must still offer it.
    expect(tracks.some((t) => t.id === "canvassed")).toBe(true);
    expect(tracks.some((t) => String(t.id) === "all")).toBe(false);
    expect(tracks.find((t) => t.id === "repeat")?.label).toBe("Repeat work");
    expect(new Set(tracks.map((t) => t.id)).size).toBe(tracks.length);
  });
});

describe("smsLength", () => {
  it("counts a short GSM message as one segment", () => {
    const r = smsLength("Hi Delia — done");
    expect(r.characters).toBe(15);
  });

  it("uses the 160-character boundary for plain ASCII", () => {
    expect(smsLength("a".repeat(160)).segments).toBe(1);
    expect(smsLength("a".repeat(161)).segments).toBe(2);
  });

  it("halves the budget when a curly quote forces Unicode", () => {
    // The surprise worth surfacing: one smart apostrophe doubles the cost.
    const plain = smsLength("a".repeat(100));
    const curly = smsLength("a".repeat(99) + "’");
    expect(plain.unicode).toBe(false);
    expect(plain.segments).toBe(1);
    expect(curly.unicode).toBe(true);
    expect(curly.segments).toBe(2);
  });

  it("counts nothing as no segments", () => {
    expect(smsLength("")).toEqual({
      characters: 0,
      segments: 0,
      unicode: false,
    });
  });
});

describe("usesContactName", () => {
  it("sees the name token wherever it appears", () => {
    expect(usesContactName(base)).toBe(true);
    expect(
      usesContactName({ ...base, body: "Morning {{contact.firstName}}!" }),
    ).toBe(true);
  });

  it("reports its absence", () => {
    expect(
      usesContactName({ ...base, body: "Time for your warranty look-over?" }),
    ).toBe(false);
  });

  it("counts the subject as part of the message", () => {
    expect(
      usesContactName({
        ...base,
        channel: "EMAIL",
        subject: "{{contact.firstName}}, a quick note",
        body: "Time for your warranty look-over?",
      }),
    ).toBe(true);
  });

  it("is not fooled by a near-miss token", () => {
    // `{{contact.firstname}}` is a typo, not a name — the unknown-token
    // warning owns that case, and this check must not paper over it.
    expect(
      usesContactName({ ...base, body: "Hi {{contact.firstname}}" }),
    ).toBe(false);
  });
});

describe("toDraft", () => {
  it("carries every editable field off the stored template", () => {
    const t: MessageTemplate = {
      id: "t9",
      name: "Neighbour knock",
      channel: "SMS",
      triggerType: "neighbour_campaign",
      pipelineId: "newleads",
      stageId: null,
      track: "canvassed",
      subject: null,
      body: "We're painting {{job.address}}.",
      active: false,
      isDefault: false,
      authoredBy: "u-marshall",
      updatedAt: new Date("2026-07-01"),
    };
    expect(toDraft(t)).toEqual({
      id: "t9",
      name: "Neighbour knock",
      channel: "SMS",
      triggerType: "neighbour_campaign",
      pipelineId: "newleads",
      stageId: null,
      track: "canvassed",
      subject: null,
      body: "We're painting {{job.address}}.",
      active: false,
      isDefault: false,
      allowAiAdaptation: false,
    });
  });
});

describe("the variable registry drives the UI", () => {
  it("every variable documents where it comes from", () => {
    // The palette prints `source` verbatim; an empty one would render a blank
    // help line rather than the warning an author needs.
    for (const v of TEMPLATE_VARIABLES) {
      expect(v.source.trim(), v.token).not.toBe("");
      expect(v.example.trim(), v.token).not.toBe("");
      expect(v.label.trim(), v.token).not.toBe("");
    }
  });
});
