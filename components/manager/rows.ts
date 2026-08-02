/**
 * Structural mirrors of the analytics repository's row types, plus the
 * derivations the dashboard needs when the repository supplies raw figures
 * rather than presentation values.
 *
 * Declared locally so the manager components stay decoupled from
 * `lib/repositories/analytics.ts` — its rows satisfy these shapes.
 */

import type { RevisitState } from "@/lib/pipelines";

/* -------------------------------------------------------------------------
   Neglected deals
   ------------------------------------------------------------------------- */

export interface NeglectedRow {
  id: string;
  name: string;
  account: string;
  /** Display label, e.g. "Commercial". */
  pipeline: string;
  /** Display label, e.g. "Plan Review". */
  stage: string;
  /** Display string, e.g. "$96K", "$4.9K est.", "—". */
  value: string;
  days: number;
}

/**
 * Total pipeline value sitting untouched. Sums whatever is parseable out of
 * the per-row display strings and ignores the rest, so a partner row reading
 * "—" contributes nothing instead of breaking the roll-up.
 */
export function neglectedTotal(rows: readonly NeglectedRow[]): string {
  return sumMoney(rows.map((r) => r.value));
}

/* -------------------------------------------------------------------------
   Revisit due
   ------------------------------------------------------------------------- */

/**
 * Structural mirror of the repository's `RevisitDueDeal`.
 *
 * `state` is the authority for *what kind of row this is*; the numbers are
 * only for saying it. The query filters to `no-date` and `due`, so those are
 * the two that reach here — but this reads `state` rather than inferring the
 * classification from `daysOverdue` being null, because those agree only
 * because of an upstream filter, and moving the "due" boundary would leave a
 * label contradicting the query that produced the row.
 */
export interface RevisitDueRow {
  id: string;
  name: string;
  account: string;
  pipeline: string;
  stage: string;
  value: string;
  state: RevisitState;
  daysOverdue: number | null;
  daysSilent: number | null;
}

export interface RevisitStatus {
  label: string;
  /** Undated pauses are the worse case and read louder. */
  tone: "undated" | "overdue" | "today";
  /** Secondary line, when there is a more alarming number than the primary. */
  note: string | null;
}

/**
 * What a paused deal's row says on its right-hand side.
 *
 * `state` decides whether the row is a problem; this decides how to say it.
 * The one distinction made here and nowhere upstream is **due today** versus
 * days past — `revisitState` says `due` on the day it falls, and the query has
 * no opinion beyond that, but "Due today" and "12d past revisit" ask different
 * things of the reader.
 *
 * The undated case is not a missing value to render as "—". Excluding paused
 * stages from neglect assumes a revisit date replaces the rule; where nobody
 * set one, nothing replaces anything and the deal is parked indefinitely,
 * absent from both dashboards.
 */
export function revisitStatus(row: RevisitDueRow): RevisitStatus {
  if (row.state === "no-date") {
    return {
      label: "No revisit date",
      tone: "undated",
      note: row.daysSilent === null ? "never touched" : `${row.daysSilent}d silent`,
    };
  }

  const overdue = row.daysOverdue ?? 0;
  return {
    label: overdue === 0 ? "Due today" : `${overdue}d past revisit`,
    tone: overdue === 0 ? "today" : "overdue",
    /*
     * The silence is often the louder number. A partner twelve days past a
     * revisit is a diary item; the same partner at 152 days silent is a
     * relationship nobody has tended since spring, and the revisit slipping is
     * the symptom rather than the story. Shown only when it says something the
     * primary number doesn't.
     */
    note:
      row.daysSilent !== null && row.daysSilent > overdue
        ? `${row.daysSilent}d silent`
        : null,
  };
}

/** How many of these are parked with no way back. */
export function undatedCount(rows: readonly RevisitDueRow[]): number {
  return rows.filter((r) => r.state === "no-date").length;
}

/**
 * Sum a set of money display strings back into one. Values arrive formatted
 * ("$96K", "$4.9K est.", "—") because that is what the repositories return;
 * anything unparseable contributes zero rather than breaking the total.
 */
export function sumMoney(values: readonly string[]): string {
  const k = values.reduce((acc, v) => acc + parseMoneyK(v), 0);
  if (!k) return "$0";
  return k >= 1000
    ? `$${(k / 1000).toFixed(2).replace(/\.?0+$/, "")}M`
    : `$${Math.round(k)}K`;
}

/**
 * Whether a formatted money string carries an actual amount.
 *
 * A zero total on the attribution surfaces means nothing has been *estimated*
 * yet — a lead sitting in New has no EST. VALUE by definition — not that the
 * work was worthless. Printing "$0" asserts the second, so callers show
 * nothing at all instead.
 */
export function hasValue(money: string): boolean {
  return !/^\$?0(\.0+)?[KM]?$/.test(money.trim());
}

/** "$96K" → 96 · "$1.2M" → 1200 · "—" → 0. */
function parseMoneyK(value: string): number {
  const m = /\$\s*([\d,.]+)\s*([KM])?/i.exec(value);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  const unit = (m[2] ?? "K").toUpperCase();
  return unit === "M" ? n * 1000 : n;
}

/* -------------------------------------------------------------------------
   Leaderboard
   ------------------------------------------------------------------------- */

export interface LeaderboardRow {
  initials: string;
  name: string;
  /** Agent rows render the square AI chip and "—" for calls/visits/proposals. */
  isAgent: boolean;
  calls: string;
  visits: string;
  proposals: string;
  /** "12" for a person, "31 drafted" for an agent. */
  contacts: string;
  /** Supplied by the repository, or derived by {@link callsColor}. */
  callsColor?: string;
}

/**
 * Call volume is tinted relative to the best human on the board rather than
 * against a fixed number — the point of the leaderboard is comparison between
 * reps, and a hard threshold would go all-amber in a slow week.
 */
export function callsColor(
  row: LeaderboardRow,
  rows: readonly LeaderboardRow[],
): string {
  if (row.callsColor) return row.callsColor;
  if (row.isAgent) return "#6f7a6f";

  const n = parseFloat(row.calls);
  if (!Number.isFinite(n)) return "#c6cdc6";

  const best = Math.max(
    ...rows
      .filter((r) => !r.isAgent)
      .map((r) => parseFloat(r.calls))
      .filter((v) => Number.isFinite(v)),
    0,
  );
  if (!best) return "#c6cdc6";

  const share = n / best;
  if (share >= 0.8) return "#b6f07a";
  if (share >= 0.5) return "#c6cdc6";
  return "#e0a52b";
}

/* -------------------------------------------------------------------------
   Pipeline health
   ------------------------------------------------------------------------- */

export interface HealthRow {
  name: string;
  /** Active pipeline value, e.g. "$806K". */
  active: string;
  /** Win rate, e.g. "34%". */
  win: string;
  /** Average deal size, e.g. "$134K". */
  size: string;
  winColor?: string;
}

/** Team row reads neutral; a rep at or above ~30% reads green, below amber. */
export function winColor(row: HealthRow): string {
  if (row.winColor) return row.winColor;
  if (row.name.toLowerCase() === "team") return "#c6cdc6";
  const n = parseFloat(row.win);
  if (!Number.isFinite(n)) return "#c6cdc6";
  return n >= 30 ? "#b6f07a" : "#e0a52b";
}

/* -------------------------------------------------------------------------
   Source → revenue ROI
   ------------------------------------------------------------------------- */

export interface SourceRoiRow {
  label: string;
  /** Bar length as a percentage — accepts 92 or "92%". */
  pct: number | string;
  /** Attributed revenue, e.g. "$284K". */
  value: string;
  color?: string;
}

export function roiPct(row: SourceRoiRow): number {
  const n =
    typeof row.pct === "number" ? row.pct : parseFloat(row.pct.replace("%", ""));
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0;
}

/** The prototype's four-step ramp: strong sources bright, weak ones muted. */
export function roiColor(row: SourceRoiRow): string {
  if (row.color) return row.color;
  const pct = roiPct(row);
  if (pct >= 70) return "#7ed321";
  if (pct >= 60) return "#6fab48";
  if (pct >= 30) return "#59853f";
  return "#3f5c31";
}

/* -------------------------------------------------------------------------
   Prospecting metrics
   ------------------------------------------------------------------------- */

export interface Stat {
  label: string;
  value: string;
  color: string;
  note: string;
}
