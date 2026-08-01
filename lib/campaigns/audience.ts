import type {
  Audience,
  AudienceFacts,
  AudienceKind,
  AudienceParams,
} from "./types";

/**
 * Audience evaluation. Pure — no database, no clock passed implicitly — so the
 * rules that decide who receives outreach are unit-testable and the Campaigns
 * screen can size an audience before anyone commits to sending anything.
 */

export interface AudienceKindSpec {
  kind: AudienceKind;
  label: string;
  /** What it selects, in the words a franchise owner would use. */
  description: string;
  /** Rendered in the editor to build the sentence around the input. */
  sentence: (params: AudienceParams) => string;
  /** Whether this kind can be evaluated at all right now. */
  requires?: "job-completions";
}

export const AUDIENCE_KINDS: AudienceKindSpec[] = [
  {
    kind: "job_completed_days_ago",
    label: "Customers whose job finished N days ago",
    description:
      "Fires a set number of days after a job completes. Review requests, warranty check-ins, anything timed off the work itself.",
    sentence: (p) => `${p.days ?? 0} days after their job finished`,
    requires: "job-completions",
  },
  {
    kind: "no_job_in_months",
    label: "Customers with no job in N months",
    description:
      "Everyone we have worked for, but not lately. Cross-sell and win-back.",
    sentence: (p) => `no job in the last ${p.months ?? 0} months`,
    requires: "job-completions",
  },
  {
    kind: "tagged",
    label: "Everyone tagged X",
    description:
      "A flat list by tag. Newsletters and service-specific offers.",
    sentence: (p) => `tagged ${p.tag ?? "…"}`,
  },
  {
    kind: "pipeline_stage",
    label: "Everyone in a pipeline stage",
    description: "Stage-based nurture that doesn't warrant its own trigger.",
    sentence: (p) => `sitting in ${p.pipelineId ?? "…"} · ${p.stageId ?? "…"}`,
  },
];

export function audienceKindSpec(kind: AudienceKind): AudienceKindSpec {
  const spec = AUDIENCE_KINDS.find((k) => k.kind === kind);
  if (!spec) throw new Error(`Unknown audience kind "${kind}".`);
  return spec;
}

/** Whole days from `from` to `to`, floored. Negative when `from` is later. */
function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

/** Whole months, by calendar rather than by 30-day approximation. */
function monthsBetween(from: Date, to: Date): number {
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return months;
}

/**
 * Whether a candidate is in this audience right now.
 *
 * `job_completed_days_ago` matches an **exact day**, not "at least N days".
 * A review request is a moment, not a state: "4 or more days since the job"
 * would re-select the same customer every day forever, and the re-enrolment
 * guard would be the only thing standing between them and a daily nag. Making
 * the window exact means the guard is a safety net rather than the mechanism.
 */
export function audienceMatches(
  audience: Audience,
  facts: AudienceFacts,
  now: Date,
): boolean {
  const { kind, params } = audience;

  switch (kind) {
    case "job_completed_days_ago": {
      if (!facts.jobCompletedAt) return false;
      const target = params.days;
      if (typeof target !== "number") return false;
      return daysBetween(facts.jobCompletedAt, now) === target;
    }

    case "no_job_in_months": {
      // Never having had a job is not the same as not having had one lately.
      // This audience is for winning back customers, so someone who has never
      // been a customer does not belong in it.
      if (!facts.jobCompletedAt) return false;
      const target = params.months;
      if (typeof target !== "number") return false;
      return monthsBetween(facts.jobCompletedAt, now) >= target;
    }

    case "tagged":
      return Boolean(params.tag) && facts.tags.includes(params.tag!);

    case "pipeline_stage":
      return (
        facts.pipelineId === params.pipelineId &&
        facts.stageId === params.stageId
      );
  }
}

/**
 * Whether someone may be enrolled again, given how long ago they last were.
 * A campaign with no `reenrolAfterDays` is once-only.
 */
export function mayReenrol(
  facts: AudienceFacts,
  reenrolAfterDays: number | null,
  now: Date,
): boolean {
  if (!facts.lastEnrolledAt) return true;
  if (reenrolAfterDays === null) return false;
  return daysBetween(facts.lastEnrolledAt, now) >= reenrolAfterDays;
}

/** Both gates, which is what a runner actually needs. */
export function shouldEnrol(
  audience: Audience,
  facts: AudienceFacts,
  reenrolAfterDays: number | null,
  now: Date,
): boolean {
  return (
    audienceMatches(audience, facts, now) &&
    mayReenrol(facts, reenrolAfterDays, now)
  );
}

/**
 * Whether an audience can be evaluated at all yet.
 *
 * The two job-based kinds need completion data the Funnel does not currently
 * send us. Rather than let a franchise build a review campaign that silently
 * selects nobody, the editor asks this and says so — the same honesty the
 * template eligibility rule applies to copy.
 */
export function audienceIsSupported(
  kind: AudienceKind,
  hasJobCompletions: boolean,
): boolean {
  return audienceKindSpec(kind).requires === "job-completions"
    ? hasJobCompletions
    : true;
}
