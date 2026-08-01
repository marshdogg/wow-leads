import { describe, expect, it } from "vitest";
import {
  factsSatisfy,
  renderTemplate,
  resolveTemplate,
  scopeMatches,
  specificity,
  tokensIn,
  unknownTokens,
} from "@/lib/templates/resolve";
import type { MessageTemplate, TemplateQuery } from "@/lib/templates/types";

const AT = new Date(2026, 7, 1);

function template(over: Partial<MessageTemplate> = {}): MessageTemplate {
  return {
    id: "t1",
    name: "Test",
    channel: "ANY",
    triggerType: null,
    pipelineId: null,
    stageId: null,
    track: null,
    subject: null,
    body: "Hi {{contact.firstName}} — {{sender.firstName}} at {{sender.company}}.",
    active: true,
    isDefault: false,
    authoredBy: null,
    updatedAt: AT,
    ...over,
  };
}

const QUERY: TemplateQuery = {
  triggerType: "eleven_month",
  pipelineId: "resi",
  stageId: "past",
  track: "repeat",
  channel: "SMS",
};

const FACTS = {
  "contact.firstName": "Delia",
  "sender.firstName": "Marshall",
  "sender.company": "WOW 1 DAY PAINTING",
};

describe("token parsing", () => {
  it("finds tokens in both subject and body, deduplicated", () => {
    const t = template({
      subject: "About {{job.scope}}",
      body: "{{job.scope}} and {{contact.firstName}}",
    });
    expect(tokensIn(t).sort()).toEqual(["contact.firstName", "job.scope"]);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(tokensIn(template({ body: "Hi {{  contact.firstName  }}" }))).toEqual(
      ["contact.firstName"],
    );
  });

  it("flags a token that isn't a known variable", () => {
    const t = template({ body: "Hi {{contact.nickname}}" });
    expect(unknownTokens(t)).toEqual(["contact.nickname"]);
    expect(unknownTokens(template())).toEqual([]);
  });
});

describe("scope matching", () => {
  it("treats a null dimension as 'any'", () => {
    expect(scopeMatches(template(), QUERY)).toBe(true);
  });

  it("rejects a template scoped to a different stage", () => {
    expect(scopeMatches(template({ stageId: "promo" }), QUERY)).toBe(false);
  });

  it("rejects a template scoped to a different channel", () => {
    expect(scopeMatches(template({ channel: "EMAIL" }), QUERY)).toBe(false);
    expect(scopeMatches(template({ channel: "SMS" }), QUERY)).toBe(true);
  });

  it("scores a more specific scope higher on every dimension", () => {
    expect(specificity(template({ stageId: "past" }))).toBeGreaterThan(
      specificity(template({ track: "repeat" })),
    );
    // Powers of two: stage alone must outrank everything vaguer combined.
    const vaguer = template({
      track: "repeat",
      triggerType: "eleven_month",
      pipelineId: "resi",
    });
    expect(specificity(template({ stageId: "past" }))).toBeGreaterThan(
      specificity(vaguer),
    );
  });
});

describe("a template may only say what the record knows", () => {
  it("is ineligible when a token has no value", () => {
    const t = template({ body: "the {{job.scope}} we finished" });
    expect(factsSatisfy(t, FACTS)).toBe(false);
  });

  it("treats a blank value as missing, not as an empty string", () => {
    const t = template({ body: "Hi {{contact.firstName}}" });
    expect(factsSatisfy(t, { "contact.firstName": "   " })).toBe(false);
  });

  it("falls through to a less specific template rather than leaving a gap", () => {
    // The specific one references a job this contact has never had.
    const specific = template({
      id: "specific",
      stageId: "past",
      body: "the {{job.scope}} we finished {{job.completedMonth}}",
    });
    const general = template({ id: "general", body: "Hi {{contact.firstName}}" });

    const chosen = resolveTemplate([specific, general], QUERY, FACTS);
    expect(chosen?.id).toBe("general");
  });

  it("returns null when nothing qualifies, so the caller cannot send", () => {
    const t = template({ body: "the {{job.scope}} we finished" });
    expect(resolveTemplate([t], QUERY, FACTS)).toBeNull();
  });
});

describe("resolution order", () => {
  it("prefers the most specific eligible template", () => {
    const general = template({ id: "general" });
    const staged = template({ id: "staged", stageId: "past" });
    expect(resolveTemplate([general, staged], QUERY, FACTS)?.id).toBe("staged");
  });

  it("skips inactive templates entirely", () => {
    const staged = template({ id: "staged", stageId: "past", active: false });
    const general = template({ id: "general" });
    expect(resolveTemplate([staged, general], QUERY, FACTS)?.id).toBe(
      "general",
    );
  });

  it("prefers a franchise's own copy over the shipped default", () => {
    const shipped = template({ id: "shipped", isDefault: true });
    const mine = template({ id: "mine", isDefault: false });
    expect(resolveTemplate([shipped, mine], QUERY, FACTS)?.id).toBe("mine");
  });

  it("breaks a remaining tie on the most recent edit", () => {
    const older = template({ id: "older", updatedAt: new Date(2026, 0, 1) });
    const newer = template({ id: "newer", updatedAt: new Date(2026, 6, 1) });
    expect(resolveTemplate([older, newer], QUERY, FACTS)?.id).toBe("newer");
  });
});

describe("rendering", () => {
  it("fills every token and reports which it used", () => {
    const out = renderTemplate(template(), FACTS);
    expect(out.body).toBe("Hi Delia — Marshall at WOW 1 DAY PAINTING.");
    expect(out.usedTokens.sort()).toEqual([
      "contact.firstName",
      "sender.company",
      "sender.firstName",
    ]);
  });

  it("fills the subject too, and leaves it null when there isn't one", () => {
    const withSubject = template({ subject: "A note from {{sender.company}}" });
    expect(renderTemplate(withSubject, FACTS).subject).toBe(
      "A note from WOW 1 DAY PAINTING",
    );
    expect(renderTemplate(template(), FACTS).subject).toBeNull();
  });

  it("throws rather than emitting a gap into an outgoing message", () => {
    const t = template({ body: "the {{job.scope}} we finished" });
    expect(() => renderTemplate(t, FACTS)).toThrow(/job\.scope/);
  });
});
