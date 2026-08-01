import { renderTemplate, resolveTemplate } from "@/lib/templates/resolve";
import { buildTemplateFacts } from "./template-facts";
import type {
  DraftOutcome,
  DraftRequest,
  DraftSkipped,
  Drafter,
} from "./types";
import type {
  MessageTemplate,
  RenderedTemplate,
  TemplateFacts,
} from "@/lib/templates/types";

/**
 * The deterministic drafter.
 *
 * This is the *primary* path, not a fallback: the product has to be
 * convincing with no API key set, so this has to write copy a rep would
 * actually send. The register is fixed and non-negotiable — first person,
 * named, specific to the actual job, one clear ask, zero marketing fluff:
 *
 *   Hi Delia — Marshall at WOW 1 DAY PAINTING. Your one-year warranty
 *   inspection is coming up on the interior work we finished last August. It
 *   is a good moment to touch up the hallway and stairwell zones that take
 *   the most traffic. Want me to bring an estimator by in the next couple of
 *   weeks?
 *
 * Every noun in that message comes off the record. So does every noun here:
 * where a fact is missing the sentence is dropped, never padded.
 */
export class TemplateDrafter implements Drafter {
  readonly id = "template";

  async draft(request: DraftRequest): Promise<DraftOutcome> {
    return draftFromTemplates(request);
  }
}

/**
 * Resolve a template for this record and fill it.
 *
 * Returns a skip rather than a fallback when nothing is eligible. That is a
 * deliberate refusal: a franchise that has deleted or narrowed its templates
 * must get no drafts, not ours quietly reappearing under their name. The
 * runner reports the skip so the silence is visible instead of mysterious.
 */
export function draftFromTemplates(request: DraftRequest): DraftOutcome {
  const resolution = resolveForRequest(request);
  if ("skipped" in resolution) return resolution;

  return {
    body: resolution.rendered.body,
    subject: resolution.rendered.subject,
    templateId: resolution.rendered.templateId,
    source: "template",
  };
}

export interface TemplateResolution {
  template: MessageTemplate;
  facts: TemplateFacts;
  rendered: RenderedTemplate;
}

/** Shared by both drafters: pick the template, fill it, keep the parts. */
export function resolveForRequest(
  request: DraftRequest,
): TemplateResolution | DraftSkipped {
  const facts = buildTemplateFacts(request.facts, request.sender);
  const template = resolveTemplate(request.templates, request.query, facts);

  if (!template) {
    return {
      skipped: true,
      reason: request.templates.length
        ? "No template matched this record — every candidate needed a fact the record does not have"
        : "No templates configured for this franchise",
    };
  }

  return { template, facts, rendered: renderTemplate(template, facts) };
}
