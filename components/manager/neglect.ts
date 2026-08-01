/**
 * Neglect rules.
 *
 * "Neglected" is not one number. A residential re-marketing lead that has
 * gone 14 days without a touch is being dropped; a commercial bid at 14 days
 * is normal — those cycles run months. The threshold therefore lives on the
 * pipeline (`pipelines.neglect_days` / `PipelineConfig.neglectDays`), and
 * nothing in this module hard-codes 14.
 *
 * The predicate below mirrors the SQL the repository runs
 * (`last_touch_at is null or last_touch_at < now() - neglect_days`), so the
 * count in the rail badge and the rows on the dashboard can never disagree.
 */

import { PIPELINE_IDS, PIPES } from "@/lib/pipelines";

/**
 * The predicate itself lives in `lib/repositories/rules.ts` — it is pure and
 * imports no `db`, and the neglected list, the rail badge and this dashboard
 * must not be able to disagree about what "neglected" means. Re-exported here
 * so the manager screen has one import for its neglect logic, and so
 * `tests/unit/neglect.test.ts` pins the behaviour the dashboard depends on.
 *
 * The rule, in full:
 *   1. An on-time next action → never neglected. Someone is on it.
 *   2. Otherwise measure from the last contact, or from `createdAt` when
 *      there has never been one. Neither → nothing to measure, not neglected.
 *   3. Silent for `neglectDays` or more → neglected.
 */
export { daysSince, isNeglected } from "@/lib/repositories/rules";

const DAY_MS = 86_400_000;

/**
 * Which channels reset the silence clock. A trigger firing, a job completing
 * or a lead being captured happened **to** an account, not with it. Timelines
 * still render all eight channels — this set only governs "last touch".
 *
 * Same source as the predicate above, for the same reason. Note the sibling
 * `CUSTOMER_CONTACT_CHANNELS`, which excludes NOTE: "did a human attend to
 * this account" and "did we actually reach the customer" are different
 * questions, and the trigger service needs the stricter one.
 */
export { CONTACT_CHANNELS, isContactChannel } from "@/lib/repositories/rules";

/** Whole days since the last touch, or null if there has never been one. */
export function daysSilent(
  lastTouchAt: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (lastTouchAt == null) return null;
  const last = lastTouchAt instanceof Date ? lastTouchAt : new Date(lastTouchAt);
  if (Number.isNaN(last.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - last.getTime()) / DAY_MS));
}

/**
 * Human wording of the current rule for the alert header — the thresholds are
 * generated from config so the copy cannot drift from what the query does.
 * With the seeded values:
 * "No logged activity in 14+ days (45+ on Commercial Bid) and no next action booked."
 */
export function neglectRuleCopy(): string {
  const byDays = new Map<number, string[]>();
  for (const id of PIPELINE_IDS) {
    const p = PIPES[id];
    byDays.set(p.neglectDays, [...(byDays.get(p.neglectDays) ?? []), p.label]);
  }

  const ranked = [...byDays.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  );
  const [common, ...exceptions] = ranked;

  const tail = exceptions
    .map(([days, labels]) => `${days}+ on ${labels.join(" and ")}`)
    .join(", ");
  const window = exceptions.length
    ? `${common[0]}+ days (${tail})`
    : `${common[0]}+ days`;

  return `No logged activity in ${window} and no next action booked.`;
}
