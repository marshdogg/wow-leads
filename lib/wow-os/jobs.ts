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
 * Responses:
 *   200  {"ok":true,"jobId":"WO-88421","id":"job-29a91384","created":true}
 *        `id` is ours and stable across redeliveries; `created` distinguishes
 *        the first delivery from a retry.
 *   400  {"error":"Invalid payload","fields":{…}} — names the failing fields.
 *        Also returned for an `accountId` we do not hold.
 *   401  missing or wrong secret.
 *
 * **`jobId` is the idempotency key.** Retry freely: redelivering the same
 * `jobId` updates the existing row and returns `created:false`. It will never
 * produce a second row, and therefore never a second review request. Retry on
 * any 5xx or timeout; do not retry a 400.
 *
 * **`seed:` is a reserved prefix** and a `jobId` starting with it is rejected.
 * Seeded demo rows carry it so `getJobCompletionStats()` can report how many
 * completions genuinely came from the Funnel.
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

/* -------------------------------------------------------------------------
   Payload
   ------------------------------------------------------------------------- */

/** Matches `CompletedJob.workType`. Kept open-ish — WOW OS owns this list. */
export const WORK_TYPES = ["interior", "exterior", "industrial"] as const;

/** Clock skew between two servers is normal; a future completion date is not. */
const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export const jobCompletedPayloadSchema = z.object({
  /**
   * The Funnel's own job id. The idempotency key — see the header.
   *
   * `seed:` is reserved: the seed marks its rows with that prefix so
   * `getJobCompletionStats()` can report how many completions actually came
   * from the Funnel. A real ref using it would be counted as demo data.
   */
  jobId: z
    .string()
    .min(1)
    .max(64)
    .refine(
      (v) => !v.startsWith("seed:"),
      "jobId may not start with the reserved prefix `seed:`",
    ),
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
 * Payload → `upsertCompletedJob`'s input.
 *
 * Note what is *not* here: an `id`. The repository owns key generation and
 * conflicts on `wow_os_job_id`, a column with its own unique index, so the
 * Funnel's ref is stored as data rather than folded into our primary key.
 *
 * An earlier version of this file derived a local id from the ref instead,
 * because `jobs` had no column to conflict on. That worked, but it made our
 * primary keys carry an external system's id format — and the derivation had
 * to be injective or two Funnel refs could collapse into one row and silently
 * merge two jobs. A unique column removes the whole class of problem.
 */
export function toUpsertInput(payload: JobCompletedPayload): {
  wowOsJobId: string;
  accountId: string;
  dealId: string | null;
  completedAt: Date;
  workType: string;
  scope: string;
  areas: string[];
  valueCents: number;
  crew: string | null;
} {
  return {
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
 * Seeded completions carry a `seed:` prefix on `wowOsJobId`; Funnel-delivered
 * ones carry the Funnel's own ref. That prefix is the seam that keeps the
 * demo data honest — see `getJobCompletionStats()`, which counts anything
 * `seed:` as *not* from the Funnel so a screen can say "5 completions, none
 * live yet" rather than implying an integration that does not exist.
 *
 * The Funnel must never send a ref beginning `seed:`. It would not corrupt
 * anything, but it would be counted as demo data and under-report real
 * ingest, so the payload schema rejects it.
 */
export const SEED_JOB_PREFIX = "seed:";

export function isSeededJobRef(wowOsJobId: string | null): boolean {
  return Boolean(wowOsJobId?.startsWith(SEED_JOB_PREFIX));
}
