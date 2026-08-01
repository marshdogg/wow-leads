/**
 * Turns the prototype's human strings into the real timestamps the neglect and
 * overdue queries run on.
 *
 * The board displays `deals.stale` / `deals.nextDue` verbatim; `lastTouchAt`
 * and `nextDueAt` are derived from those same strings here so the two can
 * never disagree. Seed-time only, but pure and unit-tested.
 */

const MS_DAY = 86_400_000;
/** "5 mo no referral" is 152 days on the prototype's neglected list → 30.4. */
const DAYS_PER_MONTH = 30.4;

const MONTHS: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Sept: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

const DOW: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Days since the last conversation implied by a `stale` string, or null when
 * nobody has ever spoken to them ("not yet contacted").
 *
 * Read literally, including the strings that date a job or a loss rather than
 * a conversation ("11 mo since job", "lost 6 mo ago") — those really are how
 * long it has been since anyone talked to that customer, and the trigger
 * service depends on it: the revival trigger must be able to see that nobody
 * has contacted Rudy Kaminski since the loss six months ago. Whether a deal is
 * *neglected* is a separate question answered by `isNeglected`, which also
 * weighs whether someone has a next action booked.
 */
export function staleDays(stale: string): number | null {
  const s = stale.trim();
  if (!s || /not yet contacted/i.test(s)) return null;
  return silenceDays(s);
}

/**
 * Where the seed puts the newest entry on a deal's timeline: exactly on its
 * last-touch date, not a flat three days back. This is what keeps
 * `deals.last_touch_at`, the card's `stale` line and the Record screen's
 * timeline telling the same story.
 */
export const anchorDays = staleDays;

function silenceDays(s: string): number | null {
  let m = /^(\d+)\s*d\s+silent$/i.exec(s);
  if (m) return Number(m[1]);

  m = /(\d+)\s*d\s+ago/i.exec(s);
  if (m) return Number(m[1]);

  m = /(\d+)\s*mo\b/i.exec(s);
  if (m) return Math.round(Number(m[1]) * DAYS_PER_MONTH);

  m = /(\d+)\s*wks?\b/i.exec(s);
  if (m) return Number(m[1]) * 7;

  m = /^day\s+(\d+)\s+of/i.exec(s);
  if (m) return Number(m[1]);

  if (/yesterday/i.test(s)) return 1;

  // "meeting set" and anything else undated: recent enough not to be neglected.
  return 3;
}

/** The real `lastTouchAt` behind a `stale` string. */
export function lastTouchFrom(stale: string, now: Date): Date | null {
  const days = staleDays(stale);
  return days === null ? null : new Date(now.getTime() - days * MS_DAY);
}

function withTime(base: Date, due: string, fallbackHour: number): Date {
  const t = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(due);
  const d = new Date(base);
  if (t) {
    let hour = Number(t[1]) % 12;
    if (/pm/i.test(t[3])) hour += 12;
    d.setHours(hour, Number(t[2]), 0, 0);
  } else {
    d.setHours(fallbackHour, 0, 0, 0);
  }
  return d;
}

/**
 * The real `nextDueAt` behind a `next.due` string. Returns null for strings
 * that name no date at all.
 */
export function nextDueFrom(due: string, now: Date): Date | null {
  const s = due.trim();
  if (!s) return null;

  const overdue = /^was due\s+(\d+)\s+days?\s+ago/i.exec(s);
  if (overdue) {
    const d = new Date(now.getTime() - Number(overdue[1]) * MS_DAY);
    d.setHours(9, 0, 0, 0);
    return d;
  }

  if (/^today\b/i.test(s)) return withTime(now, s, 17);
  if (/^drafted today\b/i.test(s)) return withTime(now, s, 9);
  if (/^tomorrow\b/i.test(s))
    return withTime(new Date(now.getTime() + MS_DAY), s, 9);

  // "Mar 2027 · scheduled" — month and year, no day.
  const monthYear = /^([A-Z][a-z]{2,3})\s+(\d{4})\b/.exec(s);
  if (monthYear && MONTHS[monthYear[1]] !== undefined) {
    return new Date(Number(monthYear[2]), MONTHS[monthYear[1]], 1, 9, 0, 0, 0);
  }

  // "Sep 4 · 6:30 PM", "Aug 12 · booked", "Jan 8 2027 · scheduled"
  const monthDay = /^([A-Z][a-z]{2,3})\s+(\d{1,2})(?:\s+(\d{4}))?\b/.exec(s);
  if (monthDay && MONTHS[monthDay[1]] !== undefined) {
    const year = monthDay[3] ? Number(monthDay[3]) : now.getFullYear();
    const base = new Date(year, MONTHS[monthDay[1]], Number(monthDay[2]));
    return withTime(base, s, 9);
  }

  // "Thu 11:00 AM", "Mon 10:00 AM" — the next such weekday, strictly ahead.
  const dow = /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\b/.exec(s);
  if (dow) {
    const delta = (DOW[dow[1]] - now.getDay() + 7) % 7 || 7;
    return withTime(new Date(now.getTime() + delta * MS_DAY), s, 9);
  }

  return null;
}
