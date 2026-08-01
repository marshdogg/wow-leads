/**
 * Pure logic behind the Templates editor.
 *
 * All of it runs client-side against facts the page loaded once, which is what
 * makes the preview live — `lib/templates/resolve.ts` is deliberately free of
 * database and clock so the editor can render a template against a real record
 * on every keystroke without writing anything.
 */

import {
  factsSatisfy,
  renderTemplate,
  tokensIn,
  unknownTokens,
} from "@/lib/templates/resolve";
import type {
  MessageTemplate,
  TemplateChannel,
  TemplateFacts,
} from "@/lib/templates/types";
import { PIPES, TRACK_STYLE } from "@/lib/pipelines";
import type { PipelineId, StageId, TrackId, TriggerType } from "@/lib/types";

/** The editable subset of a template. */
export interface TemplateDraft {
  id: string;
  name: string;
  channel: TemplateChannel;
  triggerType: TriggerType | null;
  pipelineId: PipelineId | null;
  stageId: StageId | null;
  track: TrackId | null;
  subject: string | null;
  body: string;
  active: boolean;
  isDefault: boolean;
  /**
   * Not edited on this screen, but carried through every save: the repository
   * defaults it to `false`, so omitting it would silently clear the flag on
   * any template that had it set.
   */
  allowAiAdaptation: boolean;
}

export function toDraft(t: MessageTemplate): TemplateDraft {
  return {
    id: t.id,
    name: t.name,
    channel: t.channel,
    triggerType: t.triggerType,
    pipelineId: t.pipelineId,
    stageId: t.stageId,
    track: t.track,
    subject: t.subject,
    body: t.body,
    active: t.active,
    isDefault: t.isDefault,
    allowAiAdaptation: t.allowAiAdaptation ?? false,
  };
}

/**
 * A draft shaped as a `MessageTemplate` so the shipped pure functions can be
 * used unchanged. The fields the resolver never reads are filled with
 * placeholders rather than duplicating its logic here.
 */
function asTemplate(d: TemplateDraft): MessageTemplate {
  return {
    ...d,
    authoredBy: null,
    updatedAt: new Date(0),
  };
}

/* -------------------------------------------------------------------------
   Scope
   ------------------------------------------------------------------------- */

/** "Residential Re-marketing · 2nd Follow-up · SMS", or "Any record". */
export function scopeSummary(d: TemplateDraft): string {
  const parts: string[] = [];
  if (d.pipelineId) parts.push(PIPES[d.pipelineId].title);
  if (d.stageId) parts.push(stageLabelOf(d.stageId));
  if (d.track) parts.push(trackLabelOf(d.track));
  if (d.triggerType) parts.push(triggerLabel(d.triggerType));
  if (!parts.length) return d.channel === "ANY" ? "Any record" : "Any record";
  return parts.join(" · ");
}

function stageLabelOf(stageId: StageId): string {
  for (const p of Object.values(PIPES)) {
    const s = p.stages.find((x) => x.id === stageId);
    if (s) return s.label;
  }
  return stageId;
}

function trackLabelOf(track: TrackId): string {
  return allTracks().find((t) => t.id === track)?.label ?? track;
}

export const TRIGGER_LABELS: Record<TriggerType, string> = {
  eleven_month: "11-month check-in",
  seasonal: "Seasonal",
  revival: "Revival",
  sequence: "Sequence step",
  speed_to_lead: "Speed to lead",
  neighbour_campaign: "Neighbour campaign",
  never_quoted: "Never quoted",
};

export const TRIGGER_TYPES = Object.keys(TRIGGER_LABELS) as TriggerType[];

export function triggerLabel(t: TriggerType): string {
  return TRIGGER_LABELS[t] ?? t;
}

/** Every stage across every pipeline, for the stage selector. */
export function allStages(): { id: StageId; label: string; pipeline: string }[] {
  return Object.values(PIPES).flatMap((p) =>
    p.stages.map((s) => ({ id: s.id, label: s.label, pipeline: p.title })),
  );
}

/**
 * Every track a deal can actually carry, from `TRACK_STYLE`.
 *
 * Deliberately not `PipelineConfig.trackOptions`: that is the board's *filter*
 * list, and New Leads sets it empty because it shows source as a card metric
 * instead — yet its deals still carry `canvassed`, and `scopeMatches` still
 * matches on it. Scoping a template to canvassed leads has to stay possible.
 */
export function allTracks(): { id: TrackId; label: string }[] {
  return (Object.keys(TRACK_STYLE) as TrackId[]).map((id) => ({
    id,
    label: titleCase(TRACK_STYLE[id].label),
  }));
}

/** "REPEAT WORK" → "Repeat work". Chip labels shout; a select shouldn't. */
function titleCase(s: string): string {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * How the resolver picks between two templates that both match. Powers of two
 * in `resolve.ts`, so a narrower dimension can never be outvoted by a
 * combination of vaguer ones — write one general template, override narrowly.
 */
export const PRECEDENCE_NOTE =
  "When several templates match, the most specific wins: stage beats track, track beats trigger, trigger beats pipeline. Your own copy beats a shipped default. So write one general template and override it narrowly.";

/* -------------------------------------------------------------------------
   Preview
   ------------------------------------------------------------------------- */

export interface PreviewResult {
  /** Tokens the registry knows but this record cannot fill. */
  missing: string[];
  /** Tokens that aren't in the registry at all — typos. */
  unknown: string[];
  /** Whether the resolver would consider this template for this record. */
  eligible: boolean;
  subject: string | null;
  /** Rendered when eligible; otherwise the body with gaps left visible. */
  body: string;
}

export function previewTemplate(
  d: TemplateDraft,
  facts: TemplateFacts,
): PreviewResult {
  const template = asTemplate(d);
  const unknown = unknownTokens(template);
  const known = tokensIn(template).filter((t) => !unknown.includes(t));
  const missing = known.filter((t) => {
    const v = facts[t];
    return typeof v !== "string" || !v.trim();
  });

  const eligible = unknown.length === 0 && factsSatisfy(template, facts);

  if (eligible) {
    const r = renderTemplate(template, facts);
    return { missing, unknown, eligible, subject: r.subject, body: r.body };
  }

  // Ineligible: substitute what we can and leave the gaps as their tokens, so
  // the author sees exactly which words are missing rather than a blank.
  const partial = (text: string) =>
    text.replace(/\{\{\s*([a-zA-Z][\w.]*)\s*\}\}/g, (m, token: string) => {
      const v = facts[token];
      return typeof v === "string" && v.trim() ? v : m;
    });

  return {
    missing,
    unknown,
    eligible,
    subject: d.subject ? partial(d.subject) : null,
    body: partial(d.body),
  };
}

/**
 * Why a template won't be used for a record, in the author's words rather than
 * an error's. Returns null when it will be used.
 *
 * This is the sentence the whole screen exists to produce: an author who wrote
 * "the {{job.scope}} we finished {{job.completedMonth}}" and picked a brand-new
 * lead needs to understand that the template is *working as designed*, not
 * broken.
 */
export function eligibilityExplanation(
  result: PreviewResult,
  recordName: string,
): string | null {
  if (result.eligible) return null;
  if (result.unknown.length) {
    return `Fix the unrecognised ${result.unknown.length === 1 ? "variable" : "variables"} before this can be previewed.`;
  }
  // Deliberately does *not* quote each variable's `source`. Those sentences
  // were written to sit beside one variable at a time in the palette; three of
  // them concatenated read as a wall and bury the only line that explains what
  // is happening. Name the tokens here, let the palette describe them.
  return (
    `${recordName} has no value for ${list(result.missing.map((t) => `{{${t}}}`))}. ` +
    `Rather than send a sentence with a hole in it, the agent falls through to ` +
    `a simpler template.`
  );
}

/** "a", "a and b", "a, b and c". */
function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* -------------------------------------------------------------------------
   Objective checks
   ------------------------------------------------------------------------- */

/** The token that puts the recipient's name in the message. */
const NAME_TOKEN = "contact.firstName";

/**
 * Whether the copy addresses the recipient by name.
 *
 * Reported as a fact, in the same muted tone as the character count, rather
 * than as a warning: a nameless message is usually a mistake but not always
 * one, and a check that asserts an opinion is the kind authors learn to
 * dismiss — taking the segment count with it.
 */
export function usesContactName(d: TemplateDraft): boolean {
  return tokensIn(asTemplate(d)).includes(NAME_TOKEN);
}

/* -------------------------------------------------------------------------
   SMS length
   ------------------------------------------------------------------------- */

export interface SmsLength {
  characters: number;
  segments: number;
  /** GSM-7 alphabet, or Unicode — which halves the per-segment budget. */
  unicode: boolean;
}

// Anything outside printable ASCII forces UCS-2. An em-dash or a curly
// apostrophe is enough, which is exactly the surprise worth surfacing.
const GSM_SAFE = /^[\x20-\x7E\n\r]*$/;

/**
 * Characters and segments for an SMS body. Counted rather than judged: a
 * length limit is a fact about the carrier, unlike "this reads salesy".
 */
export function smsLength(body: string): SmsLength {
  const unicode = !GSM_SAFE.test(body);
  const characters = [...body].length;
  const single = unicode ? 70 : 160;
  const concat = unicode ? 67 : 153;
  const segments =
    characters === 0 ? 0 : characters <= single ? 1 : Math.ceil(characters / concat);
  return { characters, segments, unicode };
}
