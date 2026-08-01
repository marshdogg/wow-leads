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

const DAY_MS = 86_400_000;

/**
 * A deal is neglected when it has never been touched, or when its last touch
 * is *strictly older* than the pipeline's window. At exactly `neglectDays`
 * old it is not yet neglected — the same boundary the SQL uses.
 */
export function isNeglected(
  lastTouchAt: Date | string | null | undefined,
  neglectDays: number,
  now: Date = new Date(),
): boolean {
  if (lastTouchAt == null) return true;
  const last = lastTouchAt instanceof Date ? lastTouchAt : new Date(lastTouchAt);
  if (Number.isNaN(last.getTime())) return true;
  return last.getTime() < now.getTime() - neglectDays * DAY_MS;
}

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
 * Human wording of the current thresholds for the alert header — generated
 * from config so the copy cannot drift from the rule it describes.
 * With the seeded values: "No logged activity in 14+ days — 45+ on Commercial Bid."
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
  const base = `No logged activity in ${common[0]}+ days`;
  if (!exceptions.length) return `${base}.`;

  const tail = exceptions
    .map(([days, labels]) => `${days}+ on ${labels.join(" and ")}`)
    .join(", ");
  return `${base} — ${tail}.`;
}
