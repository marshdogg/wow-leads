/**
 * Job-completion ingest — WOW OS Funnel → WOW Leads.
 *
 * ⚠️  **This endpoint is real. The caller is not.** WOW OS does not send job
 * completions yet; every row in `jobs` today came from `pnpm seed`. The full
 * contract WOW OS must implement — URL, headers, payload, retry semantics —
 * is documented at the top of `lib/wow-os/jobs.ts`, which is the file to hand
 * to whoever builds the Funnel side.
 *
 * Why this exists: a review-request campaign fires a fixed number of days
 * after a job finishes, so it needs the completion as a *timestamp*. The job
 * facts already on a card are display strings ("COMPLETED Aug 2025") and
 * cannot schedule anything. Until this endpoint has a real caller, the
 * job-based audiences stay unavailable in the Campaigns editor rather than
 * silently selecting nobody — see `audienceIsSupported()`.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { accounts } from "@/db/schema";
import { eq } from "drizzle-orm";
import { upsertCompletedJob } from "@/lib/repositories/campaigns";
import { isAuthorisedBearer } from "@/lib/wow-os/auth";
import { jobCompletedPayloadSchema } from "@/lib/wow-os/jobs";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  if (!isAuthorisedBearer(request, process.env.WOW_OS_WEBHOOK_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Body is not valid JSON" },
      { status: 400 },
    );
  }

  const parsed = jobCompletedPayloadSchema.safeParse(body);
  if (!parsed.success) {
    // Name the failing fields: a webhook author debugging a 400 at 2am cannot
    // read our source, and "invalid payload" tells them nothing.
    return NextResponse.json(
      { error: "Invalid payload", fields: z.treeifyError(parsed.error) },
      { status: 400 },
    );
  }

  const payload = parsed.data;

  // The account must exist: `jobs.account_id` is a foreign key, and a job for
  // an account we have never heard of would fail at the database with a 500.
  // A 400 naming the id is the honest answer — the Funnel sent us something we
  // cannot place, and that is a data problem on one side or the other.
  const [account] = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, payload.accountId))
    .limit(1);
  if (!account) {
    return NextResponse.json(
      { error: `Unknown accountId: ${payload.accountId}` },
      { status: 400 },
    );
  }

  /**
   * Idempotency lives in the repository, which conflicts on `wow_os_job_id` —
   * a column with its own unique index, so our primary keys never inherit an
   * external system's id format. A redelivered webhook updates the row it
   * already wrote and cannot produce a second one; that matters because a
   * duplicate row is a second review request to a customer who already got
   * one. `created` distinguishes insert from update for the response.
   *
   * The write is audited as `job/ingest.create` / `job/ingest.update` against
   * the `wow-os-funnel` agent, so ingested rows are attributable without the
   * route knowing anything about the audit trail.
   */
  const { id, created } = await upsertCompletedJob({
    wowOsJobId: payload.jobId,
    accountId: payload.accountId,
    dealId: payload.dealId ?? null,
    completedAt: payload.completedAt,
    workType: payload.workType,
    scope: payload.scope,
    areas: payload.areas,
    valueCents: payload.valueCents,
    crew: payload.crew ?? null,
  });

  return NextResponse.json({ ok: true, jobId: payload.jobId, id, created });
}
