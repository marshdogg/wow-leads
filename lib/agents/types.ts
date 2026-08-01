import type { ContactChannel } from "@/lib/types";
import type { AgentId, TriggerFacts } from "@/lib/triggers/types";

/**
 * Drafting contract.
 *
 * A `Drafter` turns record facts into the message a human is about to
 * approve. There are two implementations — `TemplateDrafter`, which is
 * deterministic and needs nothing, and `ClaudeDrafter`, which needs an API
 * key — and they are interchangeable. See `lib/agents/drafter.ts` for how one
 * is chosen at call time.
 */

export interface Sender {
  /** "Marshall Behrns" — who the message is from. */
  name: string;
  /** "Marshall" — how they sign a text. */
  firstName: string;
  /** "WOW 1 DAY PAINTING". */
  company: string;
}

export interface DraftRequest {
  facts: TriggerFacts;
  /** The WHY THIS FIRED bullets. The draft must be consistent with these. */
  reasons: string[];
  /** Chosen from the contact's stated preference. */
  channel: ContactChannel;
  sender: Sender;
}

export type DraftSource = "claude" | "template";

export interface DraftResult {
  body: string;
  /** Which drafter produced it — surfaced in the audit trail. */
  source: DraftSource;
}

export interface Drafter {
  readonly id: string;
  draft(request: DraftRequest): Promise<DraftResult>;
}

/** The agent identity a drafted approval is attributed to. */
export type { AgentId };

export const DEFAULT_SENDER: Sender = {
  name: "Marshall Behrns",
  firstName: "Marshall",
  company: "WOW 1 DAY PAINTING",
};
