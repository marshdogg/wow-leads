import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runAllTriggers } from "@/lib/triggers/runner";

/**
 * Daily trigger sweep — Vercel Cron, 06:00.
 *
 * Runs all four trigger runners, creates drafted approvals, and returns a
 * summary. It sends nothing: every approval it creates is waiting for a human
 * in the Approvals queue, which is the entire point of the product.
 *
 * Idempotent by construction — `runAllTriggers` skips any (deal, trigger)
 * pair that already has a pending draft or one created today, so running it
 * twice on the same morning is a no-op the second time.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/**
 * The sweep touches every deal and may make one model call per draft. 60s is
 * the Hobby-plan ceiling and matches the `functions` entry in vercel.json —
 * a larger value here fails the deploy rather than raising the limit.
 */
export const maxDuration = 60;

export async function GET(request: Request): Promise<Response> {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
    const summary = await runAllTriggers({ dryRun });
    return NextResponse.json({ ok: true, dryRun, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Trigger run failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

/**
 * `Authorization: Bearer ${CRON_SECRET}`, compared in constant time.
 *
 * With no `CRON_SECRET` configured the endpoint is closed rather than open —
 * a misconfigured deploy must not leave a write endpoint reachable by
 * anyone who guesses the path.
 */
function isAuthorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization") ?? "";
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) return false;

  return safeEqual(header.slice(prefix.length), secret);
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length — compare against a same-length buffer and AND the result in.
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}
