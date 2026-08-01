/**
 * Pure logic behind the Campaigns editor.
 *
 * All of it runs client-side against candidate facts the page loaded once,
 * which is what makes the audience count live: `audienceMatches` in
 * `lib/campaigns/audience.ts` is deliberately free of database and clock, so
 * the editor can re-size an audience on every keystroke without writing or
 * fetching anything. Same arrangement as the Templates preview.
 */

import {
  approvableContent,
  campaignContentHash,
} from "@/lib/campaigns/approval";
import {
  audienceIsSupported,
  audienceKindSpec,
  audienceMatches,
  mayReenrol,
} from "@/lib/campaigns/audience";
import type {
  ApprovalMode,
  Audience,
  AudienceFacts,
  AudienceKind,
  Campaign,
} from "@/lib/campaigns/types";
import { PIPES } from "@/lib/pipelines";
import type { PipelineId, StageId } from "@/lib/types";

/* -------------------------------------------------------------------------
   The draft
   ------------------------------------------------------------------------- */

export interface StepDraft {
  /**
   * Stable key for React across reorder and delete. Not the database id — a
   * step that has never been saved has no id, and two unsaved steps would
   * otherwise collide on "".
   */
  key: string;
  /** Null until the step has been saved once. */
  id: string | null;
  /** Days after the previous step — or after enrolment, for step one. */
  delayDays: number;
  channel: StepChannel;
  /** Null resolves by scope at send time. See {@link TEMPLATE_NULL_NOTE}. */
  templateId: string | null;
  label: string;
}

export type StepChannel = "SMS" | "EMAIL" | "PHONE";

export const STEP_CHANNELS: StepChannel[] = ["SMS", "EMAIL", "PHONE"];

export interface CampaignDraft {
  /** Null until saved once. */
  id: string | null;
  name: string;
  /** Open string — a franchise invents "Reviews" or "Newsletters". */
  category: string;
  description: string;
  audience: Audience;
  approvalMode: ApprovalMode;
  active: boolean;
  reenrolAfterDays: number | null;
  steps: StepDraft[];
}

let keySeq = 0;
const nextKey = () => `s${++keySeq}`;

export function toDraft(c: Campaign): CampaignDraft {
  return {
    id: c.id,
    name: c.name,
    category: c.category,
    description: c.description,
    audience: { kind: c.audience.kind, params: { ...c.audience.params } },
    approvalMode: c.approvalMode,
    active: c.active,
    reenrolAfterDays: c.reenrolAfterDays,
    steps: [...c.steps]
      .sort((a, b) => a.stepNumber - b.stepNumber)
      .map((s) => ({
        key: nextKey(),
        id: s.id,
        delayDays: s.delayDays,
        channel: asStepChannel(s.channel),
        templateId: s.templateId,
        label: s.label,
      })),
  };
}

/** `CampaignStep.channel` is an open string; the editor offers three. */
function asStepChannel(channel: string): StepChannel {
  const up = channel.toUpperCase();
  return (STEP_CHANNELS as string[]).includes(up)
    ? (up as StepChannel)
    : "SMS";
}

/**
 * A new campaign starts on `tagged`, not on the review-request kind the
 * feature was asked for. `tagged` is the only kind that can be evaluated
 * today, so starting there means the first thing an author sees is a real
 * count rather than a zero and an apology.
 */
export function blankDraft(category: string): CampaignDraft {
  return {
    id: null,
    name: "",
    category,
    description: "",
    audience: { kind: "tagged", params: {} },
    approvalMode: "per_message",
    active: false,
    reenrolAfterDays: null,
    steps: [newStep(0)],
  };
}

export function newStep(delayDays: number): StepDraft {
  return {
    key: nextKey(),
    id: null,
    delayDays,
    channel: "SMS",
    templateId: null,
    label: "",
  };
}

/* -------------------------------------------------------------------------
   Audience prose
   ------------------------------------------------------------------------- */

/**
 * Which single parameter a kind needs. The editor renders one control, not a
 * form — the audience is a sentence with a hole in it.
 */
export type AudienceParamKind = "days" | "months" | "tag" | "pipelineStage";

export function paramKind(kind: AudienceKind): AudienceParamKind {
  switch (kind) {
    case "job_completed_days_ago":
      return "days";
    case "no_job_in_months":
      return "months";
    case "tagged":
      return "tag";
    case "pipeline_stage":
      return "pipelineStage";
  }
}

/**
 * `audienceSentence` and `stagePath` moved to `lib/campaigns/describe.ts`.
 * The campaign runner needs the same sentence for its "why this fired"
 * reasons, and a second copy would eventually disagree with this one — in
 * text a human reads before approving a send.
 */
export { audienceSentence, stagePath } from "@/lib/campaigns/describe";

/** Every stage across every pipeline, for the stage selector. */
export function allStages(): {
  pipelineId: PipelineId;
  stageId: StageId;
  label: string;
}[] {
  return Object.values(PIPES).flatMap((p) =>
    p.stages.map((s) => ({
      pipelineId: p.id,
      stageId: s.id,
      label: `${p.label} · ${s.label}`,
    })),
  );
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/* -------------------------------------------------------------------------
   Audience size
   ------------------------------------------------------------------------- */

/**
 * A candidate, with enough identity to name them beside the count.
 *
 * Structurally identical to the repository's `AudienceCandidate` and declared
 * separately on purpose: this module is imported into the browser bundle, and
 * a type-only import from `lib/repositories/campaigns` is one careless edit
 * away from dragging Drizzle and a database connection in with it.
 */
export interface AudienceCandidate extends AudienceFacts {
  dealId: string;
  name: string;
  account: string;
}

export interface AudienceSize {
  /** In the audience today. */
  matching: number;
  /** Matching, but inside the re-enrolment window, so skipped. */
  blocked: number;
  /** What a run today would actually enrol. */
  enrolling: number;
  /** Everyone the campaign could ever have considered. */
  total: number;
  /** Up to three names, so the number can be checked rather than believed. */
  sample: string[];
}

export function sizeAudience(
  audience: Audience,
  candidates: AudienceCandidate[],
  reenrolAfterDays: number | null,
  now: Date,
): AudienceSize {
  let matching = 0;
  let blocked = 0;
  const sample: string[] = [];

  for (const c of candidates) {
    if (!audienceMatches(audience, c, now)) continue;
    matching += 1;
    if (mayReenrol(c, reenrolAfterDays, now)) {
      if (sample.length < 3) sample.push(c.name);
    } else {
      blocked += 1;
    }
  }

  return {
    matching,
    blocked,
    enrolling: matching - blocked,
    total: candidates.length,
    sample,
  };
}

/**
 * Whether the count is a **population** or a **daily rate**.
 *
 * This is the whole point of rule one and the reason the same number means two
 * different things on this screen. `job_completed_days_ago` matches an exact
 * day, so its count is "how many people cross day N today" — a fresh handful
 * every morning, never a list you could export. Every other kind is a standing
 * population that is the same tomorrow unless someone's record changes.
 */
export function countIsDailyRate(kind: AudienceKind): boolean {
  return kind === "job_completed_days_ago";
}

/** "3 today", "28 right now" — the count with the unit its kind implies. */
export function countPhrase(kind: AudienceKind, n: number): string {
  return `${n} ${countUnit(kind)}`;
}

/** The unit alone, for the caption beside a large numeral. */
export function countUnit(kind: AudienceKind): string {
  return countIsDailyRate(kind) ? "today" : "right now";
}

/** "Raman Oyelaran, Lorna Kirkbride and 6 others". */
export function sampleSentence(size: AudienceSize): string | null {
  if (!size.enrolling) return null;
  const rest = size.enrolling - size.sample.length;
  const names = joinList(size.sample);
  if (rest <= 0) return names;
  return `${names} and ${rest} ${rest === 1 ? "other" : "others"}`;
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/* -------------------------------------------------------------------------
   Why an audience selects nobody
   ------------------------------------------------------------------------- */

export interface AudienceGap {
  /** Short all-caps heading, matching the Templates eligibility panel. */
  heading: string;
  body: string;
  /** True when the cause is missing plumbing rather than the author's input. */
  systemic: boolean;
}

/**
 * How many job completions we hold, and how many the Funnel actually sent.
 *
 * Two numbers rather than one boolean because they answer different
 * questions. `total > 0` decides whether a job-based audience can be evaluated
 * at all — that is `audienceIsSupported`'s input. `fromFunnel` decides whether
 * the resulting count means anything about a real franchise: today every row
 * is seeded so the feature can be demonstrated, and a screen that prints
 * "3 enrol today" without saying so implies an integration that does not
 * exist.
 *
 * Derived from one call to `getJobCompletionStats()` rather than reading
 * `hasJobCompletions()` alongside it, so the two can never disagree.
 */
export interface JobCompletionSource {
  total: number;
  fromFunnel: number;
}

/** Whether job-based audiences can be evaluated at all. */
export function completionsExist(source: JobCompletionSource): boolean {
  return source.total > 0;
}

/** Whether this kind reads job-completion dates at all. */
export function isJobBased(kind: AudienceKind): boolean {
  return audienceKindSpec(kind).requires === "job-completions";
}

/** Completions exist, but none of them came from WOW OS. */
export function completionsAreSeededOnly(source: JobCompletionSource): boolean {
  return source.total > 0 && source.fromFunnel === 0;
}

/**
 * Why this audience will not select anyone, in the franchise owner's words.
 * Null when it will.
 *
 * The systemic case is the important one and it is stated plainly rather than
 * hidden: two kinds need job-completion dates the WOW OS Funnel does not send
 * us. Removing them from the dropdown would be the quiet version of the same
 * failure — an owner would build the review campaign they came here for out of
 * `tagged`, get it subtly wrong, and never learn why the obvious option was
 * missing. Same principle as the Templates screen's eligibility panel: surface
 * the gap.
 */
export function audienceGap(
  audience: Audience,
  size: AudienceSize,
  completions: JobCompletionSource,
): AudienceGap | null {
  const { kind, params } = audience;
  const jobBased = isJobBased(kind);

  if (!audienceIsSupported(kind, completionsExist(completions))) {
    return {
      heading: "SELECTS NOBODY UNTIL THE FUNNEL SENDS COMPLETIONS",
      body:
        "This audience is timed off the date a job finished, and the WOW OS Funnel does not send us job completions yet. " +
        "The job facts on a card today are display strings — “COMPLETED Aug 2025” is enough to print and useless to count days from. " +
        "So this campaign is buildable now and will select nobody, every morning, until that data arrives. Nothing here is broken; the timestamp does not exist yet.",
      systemic: true,
    };
  }

  /*
   * The count is real arithmetic over rows that exist — and every one of those
   * rows was written by the seed. Saying nothing here would be the quiet
   * version of the same dishonesty the panel above avoids: a franchise owner
   * would read "3 enrol today", conclude the integration works, and arm a
   * campaign that selects nobody on their own data. Reported before the
   * empty-audience checks below, because where the numbers came from matters
   * whether the answer is three or zero.
   */
  if (jobBased && completionsAreSeededOnly(completions)) {
    return {
      heading: "COUNTED FROM SEEDED JOBS, NOT FROM WOW OS",
      body:
        `All ${plural(completions.total, "completed job")} we hold were written by the seed so this feature could be built and shown. ` +
        "WOW OS is not sending completions yet, so on a live franchise this audience would still select nobody. " +
        "Treat the number below as a worked example of the rule rather than a real audience.",
      systemic: true,
    };
  }

  // An unfilled parameter is not a gap worth a panel — the sentence already
  // reads with a hole in it and `draftIssues` blocks the save.
  if (kind === "tagged" && !params.tag) return null;
  if (kind === "pipeline_stage" && !(params.pipelineId && params.stageId)) {
    return null;
  }
  if (kind === "job_completed_days_ago" && typeof params.days !== "number") {
    return null;
  }
  if (kind === "no_job_in_months" && typeof params.months !== "number") {
    return null;
  }

  if (size.matching === 0) {
    return {
      heading: "NOBODY MATCHES THIS",
      body: countIsDailyRate(kind)
        ? `No customer crosses that day today. This audience selects a new handful each morning rather than a standing list, so an empty day is normal — but check the number against a day you know had work finishing.`
        : `None of the ${size.total} records we hold match. Check the wording against what is actually on the accounts.`,
      systemic: false,
    };
  }

  if (size.enrolling === 0) {
    return {
      heading: "EVERYONE MATCHING IS INSIDE THE RE-ENROLMENT WINDOW",
      body: `${plural(size.matching, "record")} match, and every one of them has been enrolled too recently to enter again. Widen the window, or wait.`,
      systemic: false,
    };
  }

  return null;
}

/* -------------------------------------------------------------------------
   Steps
   ------------------------------------------------------------------------- */

export interface ScheduledStep {
  step: StepDraft;
  /** Days after enrolment — the running total the author thinks in. */
  day: number;
}

/**
 * Steps with their absolute day.
 *
 * The model stores each delay *relative to the previous step*, which is what a
 * runner needs. An author thinks in absolute days — "day 0, day 3, day 10" —
 * and gets the arithmetic wrong reading a column of relative numbers. So the
 * editor shows both: the field they edit is the delay, the label beside it is
 * where that lands.
 */
export function schedule(steps: StepDraft[]): ScheduledStep[] {
  let day = 0;
  return steps.map((step) => {
    day += step.delayDays;
    return { step, day };
  });
}

/** "Day 0 SMS · Day 3 Email" — the cadence at a glance, for the list. */
export function cadenceSummary(steps: StepDraft[]): string {
  if (!steps.length) return "No steps yet";
  return schedule(steps)
    .map(({ step, day }) => `Day ${day} ${titleCase(step.channel)}`)
    .join(" · ");
}

/** "SMS" → "Sms" reads wrong; channels stay upper for the two acronyms. */
function titleCase(channel: StepChannel): string {
  return channel === "PHONE" ? "Call" : channel === "EMAIL" ? "Email" : "SMS";
}

/** How long the whole programme runs, once someone enters it. */
export function runLengthDays(steps: StepDraft[]): number {
  return steps.reduce((sum, s) => sum + s.delayDays, 0);
}

export const TEMPLATE_NULL_NOTE =
  "Chosen at send time by the Templates screen’s own rules. Improving the copy there improves this campaign, with nothing to re-edit here.";

export const TEMPLATE_PINNED_NOTE =
  "Frozen to this exact template. Later edits on the Templates screen will not reach this campaign — pin only when the wording is the point.";

/* -------------------------------------------------------------------------
   Approval mode
   ------------------------------------------------------------------------- */

/**
 * How many items a single run puts in the Approvals queue.
 *
 * The number is the argument. "Per message" on a two-step newsletter to four
 * hundred people is eight hundred things for a human to read, and nobody
 * discovers that by reading the words "each draft is approved individually".
 */
export function approvalLoad(
  steps: StepDraft[],
  enrolling: number,
  mode: ApprovalMode,
): number {
  return mode === "per_message" ? steps.length * enrolling : 1;
}

/** Where per-message stops being review and starts being rubber-stamping. */
export const APPROVAL_LOAD_WARNING = 40;

/* -------------------------------------------------------------------------
   Bulk approval
   ------------------------------------------------------------------------- */

export type CampaignApprovalState =
  /** Per-message campaigns approve nothing in advance. */
  | { kind: "per_message" }
  /** Bulk, but the copy is not knowable in advance. See below. */
  | { kind: "unapprovable"; unpinnedSteps: number[] }
  | { kind: "never" }
  | { kind: "stale"; approvedAt: Date; approvedBy: string | null }
  | { kind: "approved"; approvedAt: Date; approvedBy: string | null };

/**
 * Where a bulk campaign stands against its approval gate.
 *
 * `unapprovable` is the state worth explaining. `approvableContent` hashes
 * **the copy each step will send**, and a step with no pinned template has no
 * such copy — the Templates screen picks it per record at send time. That is
 * the right default everywhere else on this screen, and under bulk it is a
 * contradiction: nobody can approve wording that does not exist yet. So bulk
 * campaigns have to pin, and the screen says so rather than letting someone
 * tick a box over an empty promise. Flagged to the runner's owner.
 *
 * @param bodyByStep resolved copy, keyed by step number. Steps absent from the
 * map are unpinned.
 */
export function campaignApprovalState(
  campaign: Campaign,
  bodyByStep: Map<number, string>,
): CampaignApprovalState {
  if (campaign.approvalMode !== "bulk") return { kind: "per_message" };

  const unpinnedSteps = campaign.steps
    .filter((s) => !bodyByStep.has(s.stepNumber))
    .map((s) => s.stepNumber);
  if (unpinnedSteps.length) return { kind: "unapprovable", unpinnedSteps };

  if (!campaign.approvedAt || !campaign.approvedHash) return { kind: "never" };

  const current = campaignContentHash(
    approvableContent(campaign, bodyByStep),
  );
  return current === campaign.approvedHash
    ? {
        kind: "approved",
        approvedAt: campaign.approvedAt,
        approvedBy: campaign.approvedBy,
      }
    : {
        kind: "stale",
        approvedAt: campaign.approvedAt,
        approvedBy: campaign.approvedBy,
      };
}

/* -------------------------------------------------------------------------
   Re-enrolment
   ------------------------------------------------------------------------- */

/** "Never enrols the same person twice", or the window in words. */
export function reenrolSentence(
  reenrolAfterDays: number | null,
  kind: AudienceKind,
): string {
  if (reenrolAfterDays === null) {
    return "Once only. Nobody enters this campaign a second time, ever.";
  }
  const window = `Somebody who has already been through this can enter again after ${plural(reenrolAfterDays, "day")}.`;
  return countIsDailyRate(kind)
    ? `${window} The exact-day audience already stops repeats on its own, so this is the safety net rather than the mechanism.`
    : `${window} This audience keeps matching for as long as the record does, so this window is the only thing stopping a repeat.`;
}

/* -------------------------------------------------------------------------
   Validation
   ------------------------------------------------------------------------- */

/**
 * What must be fixed before this can be saved.
 *
 * An unsupported audience is deliberately **not** in here. A review campaign
 * written today against completion data that arrives next quarter is a
 * reasonable thing to save — it is explained, not blocked.
 */
export function draftIssues(draft: CampaignDraft): string[] {
  const issues: string[] = [];

  if (!draft.name.trim()) issues.push("A campaign needs a name.");
  if (!draft.category.trim()) {
    issues.push("Pick or type a category — it decides where this sits in the rail.");
  }

  const { kind, params } = draft.audience;
  switch (paramKind(kind)) {
    case "days":
      if (typeof params.days !== "number" || Number.isNaN(params.days)) {
        issues.push("Say how many days after the job this fires.");
      } else if (params.days < 0) {
        issues.push("A campaign cannot fire before the job finishes.");
      }
      break;
    case "months":
      if (typeof params.months !== "number" || Number.isNaN(params.months)) {
        issues.push("Say how many months of silence qualify someone.");
      } else if (params.months < 1) {
        issues.push("Give the silence at least a month, or this selects every customer.");
      }
      break;
    case "tag":
      if (!params.tag?.trim()) issues.push("Pick the tag this campaign goes to.");
      break;
    case "pipelineStage":
      if (!params.pipelineId || !params.stageId) {
        issues.push("Pick both a pipeline and a stage.");
      }
      break;
  }

  if (!draft.steps.length) {
    issues.push("A campaign with no steps sends nothing. Add at least one.");
  }
  draft.steps.forEach((s, i) => {
    if (s.delayDays < 0) {
      issues.push(`Step ${i + 1} has a negative delay.`);
    }
    if (!s.label.trim()) {
      issues.push(`Step ${i + 1} needs a name — it is what the Approvals queue shows.`);
    }
  });

  if (draft.reenrolAfterDays !== null && draft.reenrolAfterDays < 1) {
    issues.push("A re-enrolment window shorter than a day is not a window.");
  }

  return issues;
}

/* -------------------------------------------------------------------------
   Saving
   ------------------------------------------------------------------------- */

/** The wire shape the save action takes. Steps are replaced wholesale. */
export interface SaveCampaignInput {
  id?: string;
  name: string;
  category: string;
  description: string;
  audience: Audience;
  approvalMode: ApprovalMode;
  active: boolean;
  reenrolAfterDays: number | null;
  steps: {
    stepNumber: number;
    delayDays: number;
    channel: StepChannel;
    templateId: string | null;
    label: string;
  }[];
}

export function toSaveInput(draft: CampaignDraft): SaveCampaignInput {
  return {
    ...(draft.id ? { id: draft.id } : {}),
    name: draft.name.trim(),
    category: draft.category.trim(),
    description: draft.description.trim(),
    audience: draft.audience,
    approvalMode: draft.approvalMode,
    active: draft.active,
    reenrolAfterDays: draft.reenrolAfterDays,
    steps: draft.steps.map((s, i) => ({
      stepNumber: i + 1,
      delayDays: s.delayDays,
      channel: s.channel,
      templateId: s.templateId,
      label: s.label.trim(),
    })),
  };
}
