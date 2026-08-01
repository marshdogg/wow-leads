/**
 * ============================================================================
 * JOB COMPLETIONS — THE INTEGRATION WOW OS OWES US
 * ============================================================================
 *
 * ⚠️  **WOW OS DOES NOT SEND THIS YET.** Nothing in production calls the
 * endpoint below. Every job completion in the database today was put there by
 * `pnpm seed` so the demo has something to show. Do not read a populated
 * `jobs` table as evidence that the integration is live.
 *
 * ---------------------------------------------------------------------------
 * WHAT WOW OS MUST IMPLEMENT
 * ---------------------------------------------------------------------------
 * When a job is marked complete in the Funnel, POST to:
 *
 *     POST https://<wow-leads-host>/api/wow-os/job-completed
 *     Authorization: Bearer $WOW_OS_WEBHOOK_SECRET
 *     Content-Type: application/json
 *
 *     {
 *       "jobId":       "WO-88421",              // the Funnel's own job id
 *       "accountId":   "acc-marchetti",         // WOW Leads account id
 *       "dealId":      "r1",                    // optional
 *       "completedAt": "2026-07-28T16:40:00Z",  // ISO 8601, must be UTC
 *       "workType":    "interior",              // interior | exterior | industrial
 *       "scope":       "4 rooms, hallway, stairwell",
 *       "areas":       ["living room", "hallway", "stairwell"],
 *       "valueCents":  840000,                  // integer cents, never a float
 *       "crew":        "Dani Koval"             // optional
 *     }
 *
 * Responses: `200 {"ok":true,"jobId":…,"created":true|false}` · `400` invalid
 * body (the response names the failing fields) · `401` missing/bad secret.
 *
 * **`jobId` is the idempotency key.** Retry freely: redelivering the same
 * `jobId` updates the existing row and returns `created:false`. It will never
 * produce a second row, and therefore never a second review request. Retry on
 * any 5xx or timeout; do not retry a 400.
 *
 * `completedAt` is the one field that must be right. It is a real timestamp
 * driving "fire N days after completion" — the display strings already on a
 * card (`LAST JOB $8,400`, `COMPLETED Aug 2025`) cannot schedule anything.
 *
 * ---------------------------------------------------------------------------
 * PUSH AND PULL — BOTH EXIST, AND WHY
 * ---------------------------------------------------------------------------
 * The webhook above is the **preferred** path: a review request four days
 * after completion is only as punctual as the news of the completion.
 *
 * `WowOsClient.listCompletedJobs(since)` is the **backstop**, run by the daily
 * cron. A webhook that is never delivered — deploy window, secret rotation,
 * an outage on either side — is silently lost, and the failure mode is a
 * campaign that just never fires for one customer. The pull reconciles: it
 * asks the Funnel for everything since the last known completion and upserts
 * on the same `jobId`, so anything the webhook missed lands within a day.
 *
 * Build the webhook first. Keep the pull. They converge on the same row.
 */

import { z } from "zod";
import type { CompletedJob } from "@/lib/campaigns/types";

/* -------------------------------------------------------------------------
   Payload
   ------------------------------------------------------------------------- */

/** Matches `CompletedJob.workType`. Kept open-ish — WOW OS owns this list. */
export const WORK_TYPES = ["interior", "exterior", "industrial"] as const;

/** Clock skew between two servers is normal; a future completion date is not. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export const jobCompletedPayloadSchema = z.object({
  /** The Funnel's own job id. The idempotency key — see the header. */
  jobId: z.string().min(1).max(64),
  accountId: z.string().min(1).max(64),
  dealId: z.string().min(1).max(64).nullish(),
  /**
   * ISO 8601. Coerced rather than `z.date()` because this arrives as JSON,
   * and rejected if it lands in the future — a completion that has not
   * happened yet would schedule a campaign against a date that never fires.
   */
  completedAt: z.coerce
    .date()
    .refine((d) => !Number.isNaN(d.getTime()), "completedAt is not a date")
    .refine(
      (d) => d.getTime() <= Date.now() + FUTURE_TOLERANCE_MS,
      "completedAt is in the future",
    ),
  workType: z.enum(WORK_TYPES),
  scope: z.string().max(500).default(""),
  areas: z.array(z.string().max(120)).max(50).default([]),
  /** Integer cents. A float here is a rounding bug in someone's report. */
  valueCents: z.number().int().min(0),
  crew: z.string().max(120).nullish(),
});

export type JobCompletedPayload = z.infer<typeof jobCompletedPayloadSchema>;

/* -------------------------------------------------------------------------
   Mapping
   ------------------------------------------------------------------------- */

/**
 * Payload → the domain shape the campaign audiences evaluate against.
 *
 * `id` is *ours*: a deterministic local id derived from the Funnel's `jobId`,
 * so the same completion always maps to the same row without our primary keys
 * inheriting an external system's id format.
 */
export function toCompletedJob(
  payload: JobCompletedPayload,
): CompletedJob & { wowOsJobId: string } {
  return {
    id: localJobId(payload.jobId),
    wowOsJobId: payload.jobId,
    accountId: payload.accountId,
    dealId: payload.dealId ?? null,
    completedAt: payload.completedAt,
    workType: payload.workType,
    scope: payload.scope,
    areas: payload.areas,
    valueCents: payload.valueCents,
    crew: payload.crew ?? null,
  };
}

/**
 * `WO-88421` → `job-os-WO-88421`.
 *
 * Two deliberate choices. The `job-os-` prefix namespaces Funnel-delivered
 * rows away from the seed's `job-r1` style, so ingest can never overwrite
 * demo data (or vice versa). And the ref is embedded **verbatim** rather than
 * lower-cased or slugified: normalising is lossy, and two distinct Funnel ids
 * collapsing to one local id would silently merge two jobs into one row —
 * which is the exact failure the idempotency key exists to prevent.
 *
 * `jobs` has no column for the Funnel's id, so the primary key carries it.
 * See the note in the route about what a dedicated unique column would buy.
 */
export function localJobId(wowOsJobId: string): string {
  return `job-os-${wowOsJobId}`;
}
