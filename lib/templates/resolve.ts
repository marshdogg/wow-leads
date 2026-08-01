import type {
  MessageTemplate,
  RenderedTemplate,
  TemplateFacts,
  TemplateQuery,
  TemplateVariable,
} from "./types";

/**
 * Template selection and rendering. Pure — no database, no clock — so the
 * behaviour that matters is unit-testable and the Templates screen can preview
 * a template against a real record without writing anything.
 */

/**
 * The variables a template may use. Adding one here makes it available in the
 * editor's help panel and to the renderer; nothing else needs to change.
 */
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  {
    token: "contact.firstName",
    label: "Contact first name",
    example: "Delia",
    source: "The primary contact on the account.",
  },
  {
    token: "sender.firstName",
    label: "Your first name",
    example: "Marshall",
    source: "The user who will approve the send.",
  },
  {
    token: "sender.company",
    label: "Company",
    example: "WOW 1 DAY PAINTING",
    source: "The franchise name.",
  },
  {
    token: "job.scope",
    label: "Last job scope",
    example: "the interior work",
    source: "The completed job on the account. Absent for a lead with no job.",
  },
  {
    token: "job.completedMonth",
    label: "Job completed",
    example: "last August",
    source: "Completion date of the last job.",
  },
  {
    token: "job.address",
    label: "Job address",
    example: "2308 Tunlaw Rd NW",
    source: "The address of the job, for neighbour campaigns.",
  },
  {
    token: "promo.discount",
    label: "Promo discount",
    example: "15%",
    source: "The promo attached to the deal.",
  },
  {
    token: "promo.expires",
    label: "Promo expiry",
    example: "August 15",
    source: "The promo's window end.",
  },
  {
    token: "enquiry.month",
    label: "Enquiry month",
    example: "June last year",
    source: "When a never-quoted contact first got in touch.",
  },
  {
    token: "enquiry.channel",
    label: "Enquiry channel",
    example: "the home show",
    source: "How a never-quoted contact reached us.",
  },
];

const KNOWN_TOKENS = new Set(TEMPLATE_VARIABLES.map((v) => v.token));

/**
 * Scope weights. Deliberately powers of two so a more specific dimension can
 * never be outvoted by a combination of vaguer ones — a stage-specific
 * template always beats a pipeline-and-track one, which is the intuition a
 * person editing these will have.
 */
const SPECIFICITY = {
  stage: 8,
  track: 4,
  triggerType: 2,
  pipeline: 1,
} as const;

const TOKEN_PATTERN = /\{\{\s*([a-zA-Z][\w.]*)\s*\}\}/g;

/** Every `{{token}}` a template body and subject reference, deduplicated. */
export function tokensIn(template: MessageTemplate): string[] {
  const text = `${template.subject ?? ""}\n${template.body}`;
  return Array.from(
    new Set(Array.from(text.matchAll(TOKEN_PATTERN), (m) => m[1])),
  );
}

/** Tokens a template uses that aren't in the registry — an authoring error. */
export function unknownTokens(template: MessageTemplate): string[] {
  return tokensIn(template).filter((t) => !KNOWN_TOKENS.has(t));
}

/**
 * Whether a template's scope admits this request. A null dimension means "any"
 * and always matches; a set dimension must match exactly.
 */
export function scopeMatches(
  template: MessageTemplate,
  query: TemplateQuery,
): boolean {
  if (template.triggerType && template.triggerType !== query.triggerType) {
    return false;
  }
  if (template.pipelineId && template.pipelineId !== query.pipelineId) {
    return false;
  }
  if (template.stageId && template.stageId !== query.stageId) return false;
  if (template.track && template.track !== query.track) return false;
  if (template.channel !== "ANY" && template.channel !== query.channel) {
    return false;
  }
  return true;
}

export function specificity(template: MessageTemplate): number {
  let score = 0;
  if (template.stageId) score += SPECIFICITY.stage;
  if (template.track) score += SPECIFICITY.track;
  if (template.triggerType) score += SPECIFICITY.triggerType;
  if (template.pipelineId) score += SPECIFICITY.pipeline;
  return score;
}

/**
 * Whether every token the template needs can be filled from these facts.
 *
 * This is the guard the whole feature rests on. A franchise can author "the
 * {{job.scope}} we finished {{job.completedMonth}}" and it simply will not be
 * chosen for a contact who has never had a job — the resolver moves on to a
 * less specific template instead of rendering a sentence with a hole in it.
 */
export function factsSatisfy(
  template: MessageTemplate,
  facts: TemplateFacts,
): boolean {
  return tokensIn(template).every((token) => {
    const value = facts[token];
    return typeof value === "string" && value.trim().length > 0;
  });
}

/**
 * The best template for this request, or null when nothing qualifies — in
 * which case the caller must not send. Most specific wins; ties go to the
 * franchise's own template over a shipped default, then to the most recently
 * updated, so an edit takes effect predictably.
 */
export function resolveTemplate(
  templates: MessageTemplate[],
  query: TemplateQuery,
  facts: TemplateFacts,
): MessageTemplate | null {
  const eligible = templates
    .filter((t) => t.active)
    .filter((t) => scopeMatches(t, query))
    .filter((t) => factsSatisfy(t, facts));

  if (!eligible.length) return null;

  return eligible.sort((a, b) => {
    const bySpecificity = specificity(b) - specificity(a);
    if (bySpecificity !== 0) return bySpecificity;
    // A franchise's own copy beats the one we shipped.
    if (a.isDefault !== b.isDefault) return a.isDefault ? 1 : -1;
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  })[0];
}

/**
 * Fills a template. Throws rather than emitting a gap: by the time this runs
 * `factsSatisfy` has already vouched for every token, so a miss here is a bug
 * in the caller and must not be papered over into an outgoing message.
 */
export function renderTemplate(
  template: MessageTemplate,
  facts: TemplateFacts,
): RenderedTemplate {
  const used: string[] = [];

  const fill = (text: string) =>
    text.replace(TOKEN_PATTERN, (_match, token: string) => {
      const value = facts[token];
      if (typeof value !== "string" || !value.trim()) {
        throw new Error(
          `Template ${template.id} needs {{${token}}} but the record has no value for it. ` +
            `resolveTemplate() should have rejected this template.`,
        );
      }
      used.push(token);
      return value;
    });

  return {
    templateId: template.id,
    channel: template.channel,
    subject: template.subject ? fill(template.subject) : null,
    body: fill(template.body),
    usedTokens: Array.from(new Set(used)),
  };
}
