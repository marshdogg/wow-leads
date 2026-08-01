/**
 * Structural mirrors of the analytics repository's row types, plus the
 * derivations the dashboard needs when the repository supplies raw figures
 * rather than presentation values.
 *
 * Declared locally so the manager components stay decoupled from
 * `lib/repositories/analytics.ts` — its rows satisfy these shapes.
 */

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
  const k = rows.reduce((acc, r) => acc + parseMoneyK(r.value), 0);
  if (!k) return "$0";
  return k >= 1000
    ? `$${(k / 1000).toFixed(2).replace(/\.?0+$/, "")}M`
    : `$${Math.round(k)}K`;
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
