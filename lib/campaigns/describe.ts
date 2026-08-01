import { PIPES } from "@/lib/pipelines";
import type { PipelineId } from "@/lib/types";
import type { Audience } from "./types";

/**
 * Prose for an audience, resolved against pipeline config.
 *
 * A7 built this in `components/campaigns/draft.ts` after correctly refusing
 * the fragment builder that used to sit on `AudienceKindSpec` — two of the
 * four kinds don't compose into a sentence, and `pipeline_stage` could only
 * render raw ids, naming nothing anyone has seen on screen.
 *
 * It lives here rather than in the UI because the **campaign runner needs the
 * same sentence** for its "why this fired" reasons, and those are read by the
 * person approving the message. Two implementations would eventually disagree,
 * and the one a human reads before approving a send is the wrong place for
 * drift.
 *
 * `audience.ts` still imports nothing — a predicate has no business knowing
 * about pipeline labels. This is a describer, which does.
 */

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/** "Re-marketing · 2nd Follow-up". Falls back to ids for unseeded rows. */
export function stagePath(pipelineId: string, stageId: string): string {
  const pipe = PIPES[pipelineId as PipelineId];
  if (!pipe) return `${pipelineId} · ${stageId}`;
  const stage = pipe.stages.find((s) => s.id === stageId);
  return `${pipe.label} · ${stage?.label ?? stageId}`;
}

export function audienceSentence(audience: Audience): string {
  const { kind, params } = audience;
  switch (kind) {
    case "job_completed_days_ago": {
      if (typeof params.days !== "number") {
        return "Customers a set number of days after their job finished";
      }
      if (params.days === 0) return "Customers on the day their job finished";
      // "exactly" is load-bearing: this audience is a moment, not a state.
      return `Customers exactly ${plural(params.days, "day")} after their job finished`;
    }
    case "no_job_in_months": {
      if (typeof params.months !== "number") {
        return "Customers we haven’t worked for lately";
      }
      return `Customers we haven’t worked for in ${plural(params.months, "month")} or more`;
    }
    case "tagged":
      return params.tag
        ? `Everyone tagged ${params.tag}`
        : "Everyone carrying a tag — pick which";
    case "pipeline_stage":
      return params.pipelineId && params.stageId
        ? `Everyone sitting in ${stagePath(params.pipelineId, params.stageId)}`
        : "Everyone sitting in a pipeline stage — pick which";
  }
}
