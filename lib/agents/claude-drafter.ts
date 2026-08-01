import Anthropic from "@anthropic-ai/sdk";
import { monthDay, monthYear } from "@/lib/triggers/dates";
import type { TriggerFacts } from "@/lib/triggers/types";
import { renderTemplate } from "./template-drafter";
import type { DraftRequest, DraftResult, Drafter } from "./types";

/**
 * The AI drafter.
 *
 * It is a strict upgrade over `TemplateDrafter`, never a dependency: it is
 * only selected when `ANTHROPIC_API_KEY` is set, and on any error, any empty
 * response, or any output that fails validation it falls back to the template
 * silently. A trigger firing must never depend on a network call succeeding.
 *
 * The model is given *only* facts read off the record and the same reasoning
 * bullets the human will see on the right of the approval card. It is told,
 * in the strongest terms the prompt can carry, not to add anything that is
 * not in that list — because the human approving the draft is trusting that
 * the message and the bullets describe the same reality.
 */

export const DRAFT_MODEL = "claude-sonnet-5";

/** Bounds a usable message has to sit inside. Outside these, use the template. */
const MIN_BODY_CHARS = 80;
const MAX_BODY_CHARS = 700;

/** Unfilled-placeholder tells. Any of these means the draft is unusable. */
const PLACEHOLDER_PATTERNS = [
  /\[[^\]]{2,40}\]/, // [name], [address]
  /\{\{?[^}]{2,40}\}?\}/, // {name}, {{name}}
  /\b(?:XX+|TBD|FIRSTNAME|LASTNAME|INSERT )\b/i,
];

const SYSTEM_PROMPT = `You write outreach messages for WOW 1 DAY PAINTING, a residential and commercial painting company. A human reads every message you write and approves it before it sends, so it has to be something they would be happy to have gone out under their own name.

Write the message body only. No subject line, no greeting block, no signature, no quotation marks around it, no commentary about what you wrote.

The register, which is not negotiable:
- First person, as the named sender writing to the named recipient. "Marshall at WOW 1 DAY PAINTING", not "the team at WOW".
- Specific to this actual job. Name the real rooms, the real dates, the real dollar figures, the real deadline. A message that would read the same for a different customer is a failure.
- One clear ask at the end, phrased as a question a person can answer in a sentence.
- Zero marketing language. No "we're excited", no "reach out", no "don't miss out", no exclamation marks, no emoji, no superlatives about the company.
- Plain, warm, direct. Short sentences. Contractions are fine in SMS; write EMAIL slightly more fully.
- 2 to 4 sentences for SMS, 3 to 5 for EMAIL.

The absolute rule: every concrete claim in your message must come from the FACTS list you are given. Do not invent a room, a date, a price, a discount, a name, a past conversation, or a promise about scheduling. If a fact you would like is not in the list, write around it. Inventing detail here means a customer receives a false statement about their own home.

Reference example of the target register:
Hi Delia — Marshall at WOW 1 DAY PAINTING. Your one-year warranty inspection is coming up on the interior work we finished last August. It is a good moment to touch up the hallway and stairwell zones that take the most traffic. Want me to bring an estimator by in the next couple of weeks?`;

export class ClaudeDrafter implements Drafter {
  readonly id = "claude";

  constructor(
    private readonly client: Anthropic,
    private readonly model: string = DRAFT_MODEL,
  ) {}

  async draft(request: DraftRequest): Promise<DraftResult> {
    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 700,
          system: SYSTEM_PROMPT,
          // Short, scoped copy task on a cron path — keep it cheap and fast.
          output_config: { effort: "low" },
          messages: [{ role: "user", content: buildUserPrompt(request) }],
        },
        { timeout: 20_000 },
      );

      const body = extractText(response);
      if (isUsable(body)) return { body, source: "claude" };
    } catch {
      // Network, auth, rate limit, refusal — all resolve the same way. The
      // trigger still fires and the human still gets a draft to approve.
    }
    return { body: renderTemplate(request), source: "template" };
  }
}

function extractText(response: Anthropic.Message): string {
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  // Models occasionally wrap the body in quotes despite the instruction.
  return text.replace(/^["“']|["”']$/g, "").trim();
}

function isUsable(body: string): boolean {
  if (body.length < MIN_BODY_CHARS || body.length > MAX_BODY_CHARS) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * The facts the model is allowed to use, and nothing else. Kept as a flat
 * labelled list rather than JSON so that "everything here is true, nothing
 * else is" reads as an instruction rather than a schema.
 */
export function buildUserPrompt(request: DraftRequest): string {
  const { facts, reasons, channel, sender } = request;
  const lines = [
    `CHANNEL: ${channel}`,
    `SENDER: ${sender.name} (${sender.firstName}) at ${sender.company}`,
    `RECIPIENT: ${facts.contact.name} (${facts.contact.firstName})`,
    ...factLines(facts),
  ];

  return [
    "FACTS — the only things you may state:",
    ...lines.map((line) => `- ${line}`),
    "",
    "WHY THIS TRIGGER FIRED — the human approving this will see these bullets beside your message, so it must be consistent with them:",
    ...reasons.map((reason) => `- ${reason}`),
    "",
    `Write the ${channel} message body now.`,
  ].join("\n");
}

function factLines(facts: TriggerFacts): string[] {
  switch (facts.kind) {
    case "eleven_month": {
      const lines = [
        "TRIGGER: 11-month warranty inspection is due",
        `WORK DONE: ${facts.scope.summary}`,
      ];
      if (facts.jobCompletedAt)
        lines.push(`JOB COMPLETED: ${monthYear(facts.jobCompletedAt)}`);
      if (facts.scope.value) lines.push(`JOB VALUE: ${facts.scope.value}`);
      if (facts.scope.areas.length > 0)
        lines.push(
          `ROOMS AND AREAS IN THE ORIGINAL JOB: ${facts.scope.areas.join(", ")}`,
        );
      if (facts.completionFollowUpAt)
        lines.push(
          `LAST CONTACT: completion follow-up, ${monthYear(facts.completionFollowUpAt)}`,
        );
      lines.push(
        "THE ASK: offer to bring an estimator by for the warranty inspection in the next couple of weeks",
      );
      return lines;
    }

    case "seasonal": {
      const lines = [
        "TRIGGER: a live promotional offer is going unanswered and is about to expire",
        `OFFER: ${facts.promoLabel}`,
      ];
      if (facts.promoSentAt) lines.push(`OFFER SENT: ${monthDay(facts.promoSentAt)}`);
      if (facts.promoExpiresAt)
        lines.push(`OFFER EXPIRES: ${monthDay(facts.promoExpiresAt)}`);
      lines.push(`REPLIED: no${facts.opened ? " (opened, no reply)" : " (not opened)"}`);
      if (facts.scopeAreas.length > 0)
        lines.push(`AREAS THE OFFER COVERS: ${facts.scopeAreas.join(", ")}`);
      if (facts.priorJobNotes.length > 0)
        lines.push(`PRIOR JOB HISTORY: ${facts.priorJobNotes.join("; ")}`);
      if (facts.priorJobPhrase)
        lines.push(`WHEN THE PRIOR JOB WAS DISCUSSED: ${facts.priorJobPhrase}`);
      lines.push(
        "THE ASK: offer to hold an estimate slot this week so they can decide before the offer expires",
      );
      return lines;
    }

    case "revival": {
      const lines = [
        "TRIGGER: a deal lost on price has finished its six-month cooling period",
        `SCOPE THAT WAS QUOTED AND NEVER DONE: ${facts.originalScope}`,
      ];
      if (facts.originalValue) lines.push(`ORIGINAL QUOTE: ${facts.originalValue}`);
      if (facts.lostReason) lines.push(`WHY IT WAS LOST: ${facts.lostReason}`);
      if (facts.lostAt) lines.push(`WHEN IT WAS LOST: ${monthYear(facts.lostAt)}`);
      lines.push(
        "WHAT WE CAN OFFER: current schedule has room, and the work can be phased to bring the number down",
        "THE ASK: a ten-minute call this week",
        "TONE NOTE: acknowledge the price objection directly. Do not apologise for it and do not pretend the earlier conversation did not happen.",
      );
      return lines;
    }

    case "sequence": {
      const lines = [
        `TRIGGER: step ${facts.stepNumber} of ${facts.totalSteps} in the ${facts.sequenceName} sequence is due`,
        `THIS STEP: ${facts.stepLabel}`,
        `PROSPECT COMPANY: ${facts.accountName} (say "${facts.accountShortName}" mid-sentence)`,
        `WORK TYPE THEY ARE A FIT FOR: ${facts.workType}`,
      ];
      if (facts.accountTags.length > 0)
        lines.push(`ACCOUNT TAGS: ${facts.accountTags.join(", ")}`);
      if (facts.projectHint)
        lines.push(`A PROJECT OF THEIRS WE KNOW ABOUT: ${facts.projectHint}`);
      if (facts.reference)
        lines.push(
          `REFERENCE WE CAN NAME: ${facts.reference.name}, an active ${facts.reference.relation} account — ${facts.reference.proof}`,
        );
      lines.push(
        "WHAT WE ARE KNOWN FOR: one-day turnarounds on occupied buildings, sequencing around other trades",
        facts.stepNumber === 1
          ? "THE ASK: ten minutes of their time"
          : "THE ASK: still ten minutes of their time, referencing the earlier note without repeating it",
      );
      return lines;
    }
  }
}
