import Anthropic from "@anthropic-ai/sdk";
import type { ContactChannel } from "@/lib/types";
import type { ContactFacts } from "@/lib/triggers/types";
import { ClaudeDrafter } from "./claude-drafter";
import { TemplateDrafter } from "./template-drafter";
import type { Drafter } from "./types";

/**
 * Drafter selection.
 *
 * Resolved at call time, not at module load, so that setting the key is a
 * restart rather than a redeploy — and so tests can flip it per case. With no
 * key the app is fully functional on the template path; adding the key is a
 * one-env-var upgrade that changes nothing else.
 */

let cachedClient: Anthropic | null = null;

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function getDrafter(): Drafter {
  if (!hasApiKey()) return new TemplateDrafter();
  cachedClient ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return new ClaudeDrafter(cachedClient);
}

/**
 * The channel label the approval card shows.
 *
 * Taken from the contact's stated preference, and it says *why* when the
 * record gives a reason to — "SMS · she prefers text" reads as a system that
 * knows the customer, which is exactly what it is.
 */
export function channelLabel(contact: ContactFacts): string {
  if (contact.prefers !== "SMS") return contact.prefers;
  const pronoun = contact.pronoun ?? "they";
  return `SMS · ${pronoun} prefer${pronoun === "they" ? "" : "s"} text`;
}

/** Which channel a draft is actually written for. */
export function channelFor(contact: ContactFacts): ContactChannel {
  // A phone preference still needs something written down for the rep to say,
  // and the card's Approve & send logs it as a call. SMS is the closest
  // written form; EMAIL would be the wrong register for it.
  return contact.prefers === "PHONE" ? "SMS" : contact.prefers;
}

export { ClaudeDrafter } from "./claude-drafter";
export { TemplateDrafter, renderTemplate } from "./template-drafter";
export * from "./types";
