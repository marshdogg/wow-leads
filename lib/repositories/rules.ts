/**
 * Pure business rules shared by the repositories.
 *
 * These live apart from the query code so they can be unit-tested without a
 * database, and so the rules themselves stay readable. Nothing here imports
 * `db`.
 */

import type { DealMetric, NextActionState } from "@/lib/types";

const MS_DAY = 86_400_000;

/** Thrown when a deal is asked to move to a stage that is not its own. */
export class StageTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageTransitionError";
  }
}

export interface StageLike {
  id: string;
  pipelineId: string;
}

/**
 * A deal may only move to a stage of its own pipeline. Validated against the
 * `stages` rows rather than the TypeScript union, so a stage added or moved in
 * the database is honoured without a deploy.
 */
export function assertStageInPipeline(
  dealId: string,
  dealPipelineId: string,
  stageId: string,
  stages: StageLike[],
): StageLike {
  const stage = stages.find((s) => s.id === stageId);
  if (!stage) {
    throw new StageTransitionError(
      `Unknown stage "${stageId}" — cannot move deal ${dealId}.`,
    );
  }
  if (stage.pipelineId !== dealPipelineId) {
    throw new StageTransitionError(
      `Stage "${stageId}" belongs to pipeline "${stage.pipelineId}", but deal ${dealId} is in "${dealPipelineId}".`,
    );
  }
  return stage;
}

/* -------------------------------------------------------------------------
   Neglect
   ------------------------------------------------------------------------- */

/** Whole days since the last touch. */
export function daysSince(lastTouchAt: Date, now: Date): number {
  return Math.floor((now.getTime() - lastTouchAt.getTime()) / MS_DAY);
}

/**
 * Neglected means falling through the cracks: nobody has spoken to them in
 * `neglectDays` — 14 for Residential, Biz Dev and Partner, 45 for Commercial,
 * read from the pipeline row rather than hard-coded — **and** nobody has a
 * next action booked to fix that.
 *
 * The second half matters. Rudy Kaminski was lost on price six months ago and
 * nobody has called him since, which is exactly right: the loss is recent
 * enough that the revival trigger only just cleared its cooling period, and
 * there is a revival call on the calendar for Thursday. Long silence plus a
 * booked next action is a deal being worked, not a deal being dropped, and
 * putting it on the manager's alert list trains people to ignore the list.
 *
 * An overdue next action, or none at all, is the signal that nobody is on it.
 *
 * A deal nobody has ever contacted (`lastTouchAt` null — an identified partner
 * not yet approached) is not neglected either; there is no elapsed silence to
 * measure, and it is the pipeline stage's job to surface it.
 */
export function isNeglected(
  lastTouchAt: Date | null,
  neglectDays: number,
  now: Date,
  nextActionState: NextActionState | null = null,
): boolean {
  if (!lastTouchAt) return false;
  if (nextActionState === "ok") return false;
  return daysSince(lastTouchAt, now) >= neglectDays;
}

/* -------------------------------------------------------------------------
   `$ in stage` roll-up
   ------------------------------------------------------------------------- */

/** The numeric part of a metric value in thousands, or 0 when non-numeric. */
export function metricThousands(value: string): number {
  const n = parseFloat(value.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/**
 * `$XXXK in stage` for a column: the sum of each card's EST. VALUE or BID
 * metric. Returns null when the pipeline does not show a total (everything but
 * Commercial) or when the column sums to zero.
 */
export function rollupStageValue(
  cards: { metrics: DealMetric[] }[],
  showStageValue: boolean,
): string | null {
  if (!showStageValue) return null;
  const sum = cards.reduce((acc, card) => {
    const m = card.metrics.find(
      (x) => x.label === "EST. VALUE" || x.label === "BID",
    );
    return acc + (m ? metricThousands(m.value) : 0);
  }, 0);
  return sum ? `$${Math.round(sum)}K in stage` : null;
}

/* -------------------------------------------------------------------------
   Formatting
   ------------------------------------------------------------------------- */

const MONTH_ABBR = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "$4,900" → "$4.9K"; "$96K" is already compact and passes through. */
export function compactMoney(value: string): string {
  if (/k|m/i.test(value)) return value;
  const n = parseFloat(value.replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(n)) return value;
  if (n < 1000) return `$${n}`;
  const k = Math.round(n / 100) / 10;
  return `$${k}K`;
}

/** Renders a due date the way the board writes them: "Aug 2 · 9:00 AM". */
export function formatDue(at: Date): string {
  const hour24 = at.getHours();
  const hour = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minutes = String(at.getMinutes()).padStart(2, "0");
  const meridiem = hour24 < 12 ? "AM" : "PM";
  return `${MONTH_ABBR[at.getMonth()]} ${at.getDate()} · ${hour}:${minutes} ${meridiem}`;
}
