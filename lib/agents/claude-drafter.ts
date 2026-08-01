import Anthropic from "@anthropic-ai/sdk";
import { resolveForRequest } from "./template-drafter";
import type {
  DraftOutcome,
  DraftRequest,
  DraftResult,
  Drafter,
} from "./types";

/**
 * The AI drafter.
 *
 * Since copy moved into franchise-authored templates, this no longer writes a
 * message from scratch. **The template is the message.** Claude is only
 * allowed to adapt it, only when the template's author has ticked
 * `allowAiAdaptation`, and only in ways that preserve every concrete claim.
 *
 * Why the default is off: a franchise writes a template because they want
 * *those words* sent. Letting a model paraphrase means what reaches the
 * customer is not what they approved. The eligibility rule stops Claude
 * inventing a *fact*, but it does nothing about altered *meaning* — softening
 * a warranty qualifier, or turning "I can hold a Thursday slot" into a firmer
 * promise than anyone authorised. Those are the failure modes in this domain
 * and they are all reachable with a perfectly accurate fact list.
 *
 * Where adaptation is switched on, it is bounded rather than trusted: the
 * output must still contain every value that was interpolated into the
 * template — dates, prices, addresses, names. That is checkable, and checked.
 * Anything that fails falls back to the rendered template, as does any error,
 * empty response or missing key. A trigger firing never depends on a network
 * call succeeding.
 */

export const DRAFT_MODEL = "claude-sonnet-5";

/** Bounds a usable message has to sit inside. Outside these, use the template. */
const MIN_BODY_CHARS = 80;
const MAX_BODY_CHARS = 700;

/** Unfilled-placeholder tells. Any of these means the draft is unusable. */
const PLACEHOLDER_PATTERNS = [
  /\[[^\]]{2,40}\]/, // [name], [address]
  /\{\{?[^}]{2,40}\}?\}/, // an unrendered {{token}}
  /\b(?:XX+|TBD|FIRSTNAME|LASTNAME|INSERT )\b/i,
];

const SYSTEM_PROMPT = `You adapt approved outreach copy for WOW 1 DAY PAINTING, a residential and commercial painting company.

You are given a message that a franchise owner has already written and approved, already filled in with this customer's details. Your job is to adapt it to read naturally for this specific record — not to rewrite it, and not to write a new one.

What you may change: sentence order, connective phrasing, contractions, and the greeting, so the message reads like a person wrote it to this person rather than a form letter.

What you may not change, under any circumstances:
- Any date, price, percentage, address, room, name, or deadline. These appear in the message because a record contains them. Reproduce every one exactly as written.
- Any commitment or qualifier. "I can hold a Thursday slot" is an offer; do not make it a booking. "If it is still on your list" is a condition; do not drop it. Warranty and guarantee wording is legal language — reproduce it verbatim.
- The ask. One clear ask, the same one the template makes.

You may not add anything. No new claims about their property, no urgency that was not there, no marketing language, no exclamation marks, no emoji.

Output the adapted message body only. No preamble, no quotation marks, no commentary.`;

export class ClaudeDrafter implements Drafter {
  readonly id = "claude";

  constructor(
    private readonly client: Anthropic,
    private readonly model: string = DRAFT_MODEL,
  ) {}

  async draft(request: DraftRequest): Promise<DraftOutcome> {
    const resolution = resolveForRequest(request);
    if ("skipped" in resolution) return resolution;

    const { template, facts, rendered } = resolution;
    const asWritten: DraftResult = {
      body: rendered.body,
      subject: rendered.subject,
      templateId: rendered.templateId,
      source: "template",
    };

    // The author's decision, not ours.
    if (!template.allowAiAdaptation) return asWritten;

    // The values that must survive adaptation, taken from what was actually
    // interpolated rather than guessed from the prose.
    const mustKeep = rendered.usedTokens
      .map((token) => facts[token])
      .filter((v): v is string => typeof v === "string" && v.trim().length > 0);

    try {
      const response = await this.client.messages.create(
        {
          model: this.model,
          max_tokens: 700,
          system: SYSTEM_PROMPT,
          output_config: { effort: "low" },
          messages: [
            {
              role: "user",
              content: buildUserPrompt(request, rendered.body, mustKeep),
            },
          ],
        },
        { timeout: 20_000 },
      );

      const body = extractText(response);
      if (isUsable(body) && preservesFacts(body, mustKeep)) {
        return { ...asWritten, body, source: "claude" };
      }
    } catch {
      // Network, auth, rate limit, refusal — all resolve the same way.
    }
    return asWritten;
  }
}

/**
 * Every interpolated value must still be present, verbatim.
 *
 * This is what makes adaptation a bounded risk rather than a hopeful one. A
 * model that drops "$5,600" or rewrites "August 15" as "mid-August" fails
 * here and the approved copy goes instead. It cannot catch a softened
 * qualifier — nothing automated can — which is why adaptation stays opt-in.
 */
export function preservesFacts(body: string, mustKeep: string[]): boolean {
  return mustKeep.every((value) => body.includes(value));
}

function extractText(response: Anthropic.Message): string {
  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  return text.replace(/^["\u201c']|["\u201d']$/g, "").trim();
}

function isUsable(body: string): boolean {
  if (body.length < MIN_BODY_CHARS || body.length > MAX_BODY_CHARS) return false;
  return !PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(body));
}

/**
 * The approved message, the values that must survive, and the reasoning the
 * human will see beside it. Deliberately not the raw fact list any more —
 * Claude is adapting a message, not composing one from parts.
 */
export function buildUserPrompt(
  request: DraftRequest,
  approvedBody: string,
  mustKeep: string[],
): string {
  return [
    `CHANNEL: ${request.channel}`,
    "",
    "APPROVED MESSAGE — adapt this, do not replace it:",
    approvedBody,
    "",
    "MUST APPEAR UNCHANGED IN YOUR OUTPUT:",
    ...mustKeep.map((value) => `- ${value}`),
    "",
    "WHY THIS IS BEING SENT — the human approving it sees these beside your message, so stay consistent with them:",
    ...request.reasons.map((reason) => `- ${reason}`),
    "",
    `Write the adapted ${request.channel} message body now.`,
  ].join("\n");
}
