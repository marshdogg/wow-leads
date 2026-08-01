import type {
  ContactChannel,
  PipelineId,
  StageId,
  TrackId,
  TriggerType,
} from "@/lib/types";

/**
 * Message templates — the copy a draft is built from, owned by the franchise
 * rather than by the codebase.
 *
 * Today the drafted copy lives in `lib/agents/template-drafter.ts` as string
 * literals, which means changing "your one-year warranty inspection" needs a
 * deploy. These rows replace those literals.
 *
 * The load-bearing rule is inherited from the approvals screen: **a draft may
 * only state things the record actually knows.** A template is therefore only
 * *eligible* for a record when every variable it marks required can be
 * resolved from that record — see `resolveTemplate`. That is what stops a
 * franchise authoring "the {{job.scope}} we finished in {{job.completedMonth}}"
 * and having it go out to someone with no job history.
 */

export type TemplateChannel = ContactChannel | "ANY";

export interface MessageTemplate {
  id: string;
  /** Shown in the Templates list — "11-month warranty check-in". */
  name: string;
  channel: TemplateChannel;

  /* ---- Scope. Every null widens the template to "any". ---------------- */
  triggerType: TriggerType | null;
  pipelineId: PipelineId | null;
  stageId: StageId | null;
  track: TrackId | null;

  /** Email only; ignored for SMS. */
  subject: string | null;
  /** The copy, with `{{variable}}` placeholders. */
  body: string;

  active: boolean;
  /**
   * Whether the AI drafter may adapt this copy, or must send it as written.
   *
   * Defaults to false — off. A franchise authors a template because they want
   * *those words* to go out; letting a model paraphrase hands that choice back
   * to us. The approval queue catches an obviously wrong message, but the rep
   * approving it is not the person who wrote the template and will not notice
   * a softened warranty qualifier or a conditional quietly turned into a
   * commitment. So the decision belongs to whoever owns the copy, per
   * template, rather than being a global switch we pick for them.
   */
  allowAiAdaptation?: boolean;
  /**
   * True for the copy we ship. A franchise editing a default forks it into
   * their own row rather than mutating ours, so an upgrade can still improve
   * the shipped defaults without silently overwriting someone's rewrite.
   */
  isDefault: boolean;
  authoredBy: string | null;
  updatedAt: Date;
}

/* -------------------------------------------------------------------------
   Variables
   ------------------------------------------------------------------------- */

/**
 * A value a template can interpolate. `required: true` means a record that
 * cannot supply it makes the whole template ineligible — the resolver falls
 * through to a less specific one rather than rendering a gap.
 */
export interface TemplateVariable {
  /** The `{{token}}` as authored. */
  token: string;
  label: string;
  /** What it renders, for the Templates screen's help text. */
  example: string;
  /** Where the value comes from, in plain words, for the same screen. */
  source: string;
}

/** The facts a template can draw on, assembled per record before rendering. */
export interface TemplateFacts {
  [token: string]: string | null;
}

export interface RenderedTemplate {
  templateId: string;
  channel: TemplateChannel;
  subject: string | null;
  body: string;
  /** Tokens the template used, for the "why this fired" trail. */
  usedTokens: string[];
}

/* -------------------------------------------------------------------------
   Resolution
   ------------------------------------------------------------------------- */

export interface TemplateQuery {
  triggerType: TriggerType;
  pipelineId: PipelineId;
  stageId: StageId;
  track: TrackId | null;
  channel: ContactChannel;
}

export type TemplateRejection =
  | "inactive"
  | "channel-mismatch"
  | "scope-mismatch"
  | "missing-required-facts";

export interface TemplateMatch {
  template: MessageTemplate;
  /** Higher wins. See `SPECIFICITY` in `resolve.ts`. */
  score: number;
}
