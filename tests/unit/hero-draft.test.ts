import { describe, expect, it } from "vitest";
import { draftFromTemplates } from "@/lib/agents/template-drafter";
import { DEFAULT_SENDER } from "@/lib/agents/types";
import { TEMPLATE_FIXTURES } from "@/lib/fixtures/templates";
import type { MessageTemplate } from "@/lib/templates/types";
import type {
  ContactFacts,
  ElevenMonthFacts,
  NeighbourCampaignFacts,
} from "@/lib/triggers/types";
import type { StageId } from "@/lib/types";

/**
 * The reference drafts, pinned character for character.
 *
 * These are not ordinary copy tests. The 11-month body is the string the lead
 * verifies against production after every deploy, and it is the message the
 * whole product was demonstrated with. Everything it says is derived —
 * "interior" from the completion record, "last August" from a timestamp,
 * "hallway and stairwell" from the job's named areas — so any change to where
 * those facts come from can quietly change what the customer reads.
 *
 * **Whole strings, not tokens.** A token-level check passes straight through
 * the failure that actually matters: a plausible, well-formed, *different*
 * sentence. Only the full string catches "the interior work we finished in
 * August" replacing "…we finished last August".
 *
 * A break here is not necessarily a bug — a franchise editing shipped copy is
 * the entire point of the Templates feature. It is a *stop and look*: either
 * somebody intended this and the expected string moves with them, or a
 * refactor changed a message nobody meant to touch. The migration of `job.*`
 * onto the `jobs` table is exactly the second case waiting to happen.
 */

const SHIPPED: MessageTemplate[] = TEMPLATE_FIXTURES.map((t) => ({
  ...t,
  authoredBy: null,
  updatedAt: new Date(2026, 0, 1 + (100 - t.order)),
}));

const NOW = new Date(2026, 6, 31);

function draft(
  facts: ElevenMonthFacts | NeighbourCampaignFacts,
  stageId: StageId = "past",
  track: "repeat" | null = "repeat",
): string {
  const outcome = draftFromTemplates({
    facts,
    reasons: [],
    channel: "SMS",
    sender: DEFAULT_SENDER,
    templates: SHIPPED,
    query: {
      triggerType: facts.kind,
      pipelineId: "resi",
      stageId,
      track,
      channel: "SMS",
    },
  });
  if ("skipped" in outcome) throw new Error(`No template resolved: ${outcome.reason}`);
  return outcome.body;
}

const delia: ContactFacts = {
  name: "Delia Marchetti",
  firstName: "Delia",
  prefers: "SMS",
  address: "(202) 555-0188",
  pronoun: null,
};

function heroFacts(overrides: Partial<ElevenMonthFacts> = {}): ElevenMonthFacts {
  return {
    kind: "eleven_month",
    dealId: "r1",
    dealName: "Delia Marchetti",
    contact: delia,
    jobCompletedAt: new Date(2025, 7, 21),
    completionFollowUpAt: new Date(2025, 8, 3),
    lastContactAt: null,
    scope: {
      summary: "Interior repaint",
      workType: "interior",
      areas: ["hallway", "stairwell"],
      value: "$8,400",
    },
    replies: { count: 2, medianMinutes: 40, note: "replies within the hour" },
    now: NOW,
    ...overrides,
  };
}

describe("the reference draft", () => {
  it("renders the prototype's 11-month message exactly", () => {
    expect(draft(heroFacts())).toBe(
      "Hi Delia — Marshall at WOW 1 DAY PAINTING. Your one-year warranty " +
        "inspection is coming up on the interior work we finished last August. " +
        "It is a good moment to touch up the hallway and stairwell zones that " +
        "take the most traffic. Want me to bring an estimator by in the next " +
        "couple of weeks?",
    );
  });

  it("falls to the no-rooms variant, exactly, when no areas were logged", () => {
    const body = draft(
      heroFacts({
        scope: {
          summary: "Interior repaint",
          workType: "interior",
          areas: [],
          value: "$8,400",
        },
      }),
    );
    expect(body).toBe(
      "Hi Delia — Marshall at WOW 1 DAY PAINTING. Your one-year warranty " +
        "inspection is coming up on the interior work we finished last August. " +
        "It is a good moment to walk the job and catch anything worth touching " +
        "up while the warranty is live. Want me to bring an estimator by in the " +
        "next couple of weeks?",
    );
  });

  it("never names a month the record cannot date", () => {
    const body = draft(heroFacts({ jobCompletedAt: null }));
    expect(body).not.toMatch(/August|last year|back in/);
    expect(body).toContain("one-year warranty inspection");
  });

  it("renders the neighbour reference exactly", () => {
    const facts: NeighbourCampaignFacts = {
      kind: "neighbour_campaign",
      dealId: "r8",
      dealName: "Lorna Kirkbride",
      contact: { ...delia, name: "", firstName: "", address: "2306 Tunlaw Rd NW" },
      jobAddress: "2308 Tunlaw Rd NW",
      jobCompletedAt: new Date(2026, 6, 29),
      scope: {
        summary: "Exterior repaint",
        workType: "exterior",
        areas: [],
        value: "$9,250",
      },
      crewName: "Kris Jolin crew",
      crewOnSiteUntil: new Date(2026, 7, 1),
      neighbourAddress: "2306 Tunlaw Rd NW",
      canvassTargetId: "cv-r8-2306",
      proximity: "next door",
      alreadyKnown: false,
      now: NOW,
    };
    // "next door to you", never "next door from you".
    expect(draft(facts, "result", null)).toBe(
      "Hi — Marshall at WOW 1 DAY PAINTING. We just finished the exterior at " +
        "2308 Tunlaw Rd NW, next door to you. The crew is in the neighbourhood " +
        "through Saturday, so if you have been thinking about your exterior I " +
        "can have an estimator take a look while we are already here.",
    );
  });
});
